export type RingColors = {
	/** Outer ring (usage) — user-selected color */
	outer: string;
	/** Middle ring (context / auto) — darker */
	middle: string;
	/** Inner ring (API) — darkest */
	inner: string;
	track: string;
	background: string;
	text: string;
	dot: string;
};

export const DEFAULT_RING_COLOR = "#5AC8FA";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function normalizeHexColor(value: string | undefined, fallback: string): string {
	if (!value) return fallback;
	const trimmed = value.trim();
	if (HEX_COLOR.test(trimmed)) return trimmed.toUpperCase();
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toUpperCase()}`;
	return fallback;
}

/** Darken a #RRGGBB color toward black by factor (0–1). */
export function darkenHex(hex: string, factor: number): string {
	const raw = hex.replace("#", "");
	const r = Math.round(parseInt(raw.slice(0, 2), 16) * (1 - factor));
	const g = Math.round(parseInt(raw.slice(2, 4), 16) * (1 - factor));
	const b = Math.round(parseInt(raw.slice(4, 6), 16) * (1 - factor));
	const toHex = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0").toUpperCase();
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Outer = ringColor; middle darker; inner darker still. */
export function resolveRingColors(ringColor?: string): RingColors {
	const outer = normalizeHexColor(ringColor, DEFAULT_RING_COLOR);
	const middle = darkenHex(outer, 0.28);
	const inner = darkenHex(outer, 0.5);
	return {
		outer,
		middle,
		inner,
		track: "#2C2C2E",
		background: "#121214",
		text: "#F5F5F7",
		dot: outer,
	};
}
