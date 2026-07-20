import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { resolveRingColors, type RingColors } from "./colors";

const CURSOR_DB = join(homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb");
const USAGE_SUMMARY_URL = "https://api2.cursor.sh/auth/usage-summary";

export type UsageRingSettings = {
	projectRoot?: string;
	refreshSeconds?: number;
	greenMax?: number;
	yellowMax?: number;
	ringMetric?: "cycle" | "daily_pace";
	/** Single color for all three rings */
	ringColor?: string;
};

export type UsageSnapshot = {
	membership: string;
	billingStart: string;
	billingEnd: string;
	totalPercent: number;
	autoPercent: number;
	apiPercent: number;
	dailyPacePercent: number;
	contextLoaded: boolean;
	centerText: string;
	titleText: string;
	outerPercent: number;
	middlePercent: number;
	innerPercent: number;
	colors: RingColors;
	outerColor: string;
	middleColor: string;
};

function readAccessToken(): string {
	if (!existsSync(CURSOR_DB)) {
		throw new Error("Cursor database not found. Is Cursor installed?");
	}

	const db = new DatabaseSync(CURSOR_DB, { readOnly: true });
	try {
		const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/accessToken") as
			| { value: string }
			| undefined;
		if (!row?.value) {
			throw new Error("No Cursor access token. Open Cursor and sign in.");
		}
		return row.value;
	} finally {
		db.close();
	}
}

async function fetchUsageSummary(token: string): Promise<Record<string, unknown>> {
	const response = await fetch(USAGE_SUMMARY_URL, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Usage API ${response.status}: ${body}`);
	}

	return (await response.json()) as Record<string, unknown>;
}

function parseIso(value: string): Date {
	return new Date(value);
}

function computeDailyPace(totalPercent: number, billingStart: string, billingEnd: string): number {
	const now = Date.now();
	const start = parseIso(billingStart).getTime();
	const end = parseIso(billingEnd).getTime();
	const elapsedDays = Math.max((now - start) / 86_400_000, 0.25);
	const cycleDays = Math.max((end - start) / 86_400_000, 1);
	return Math.round((totalPercent / elapsedDays) * 10) / 10;
}

function labelForPercent(percent: number, greenMax: number, yellowMax: number): string {
	if (percent <= greenMax) return "Low";
	if (percent <= yellowMax) return "OK";
	if (percent <= yellowMax + 10) return "Heavy";
	return "Hot";
}

function detectContext(projectRoot: string | undefined): boolean {
	if (!projectRoot) return false;
	const root = projectRoot.trim();
	if (!root || !existsSync(root)) return false;

	const markers = [".cursor/rules", "AGENTS.md", ".cursorrules"];
	return markers.some((marker) => existsSync(join(root, marker)));
}

function numberSetting(value: unknown, fallback: number): number {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
}

export async function fetchUsageSnapshot(settings: UsageRingSettings): Promise<UsageSnapshot> {
	const greenMax = numberSetting(settings.greenMax, 50);
	const yellowMax = numberSetting(settings.yellowMax, 80);
	const ringMetric = settings.ringMetric === "daily_pace" ? "daily_pace" : "cycle";
	const colors = resolveRingColors(settings.ringColor);

	const token = readAccessToken();
	const summary = await fetchUsageSummary(token);
	const plan = (summary.individualUsage as { plan?: Record<string, number> } | undefined)?.plan ?? {};

	// API reports percent used; rings/center show remaining (100% full → 0% empty).
	const totalPercent = Number(plan.totalPercentUsed ?? 0);
	const autoPercent = Number(plan.autoPercentUsed ?? 0);
	const apiPercent = Number(plan.apiPercentUsed ?? 0);
	const totalRemaining = clampPercent(100 - totalPercent);
	const autoRemaining = clampPercent(100 - autoPercent);
	const apiRemaining = clampPercent(100 - apiPercent);
	const dailyPacePercent = computeDailyPace(
		totalPercent,
		String(summary.billingCycleStart ?? ""),
		String(summary.billingCycleEnd ?? ""),
	);

	// Daily pace is a burn rate, not a quota — keep as-is. Cycle mode shows remaining.
	const outerPercent = ringMetric === "daily_pace" ? clampPercent(dailyPacePercent) : Math.round(totalRemaining);
	const centerText =
		ringMetric === "daily_pace" ? `${dailyPacePercent.toFixed(0)}%/d` : `${Math.round(totalRemaining)}%`;

	const contextLoaded = detectContext(settings.projectRoot);
	const colorSource = ringMetric === "daily_pace" ? dailyPacePercent : totalPercent;
	const statusLabel = labelForPercent(colorSource, greenMax, yellowMax);
	const titleText = contextLoaded ? `${centerText} · Ctx ✓` : `${centerText} · ${statusLabel}`;

	return {
		membership: String(summary.membershipType ?? "unknown"),
		billingStart: String(summary.billingCycleStart ?? ""),
		billingEnd: String(summary.billingCycleEnd ?? ""),
		totalPercent,
		autoPercent,
		apiPercent,
		dailyPacePercent,
		contextLoaded,
		centerText,
		titleText,
		colors,
		outerColor: colors.outer,
		outerPercent,
		middlePercent: contextLoaded ? 100 : Math.round(autoRemaining),
		innerPercent: Math.round(apiRemaining),
		middleColor: colors.middle,
	};
}

function clampPercent(value: number): number {
	return Math.min(Math.max(value, 0), 100);
}
