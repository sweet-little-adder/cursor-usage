import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	type DialAction,
	type KeyAction,
} from "@elgato/streamdeck";

import { renderRingImage } from "../lib/ring-image";
import { fetchUsageSnapshot, type UsageRingSettings } from "../lib/usage";

const DEFAULT_REFRESH_SECONDS = 60;

@action({ UUID: "com.orionwong.cursor-usage-ring.usage" })
export class UsageRing extends SingletonAction<UsageRingSettings> {
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly settingsByAction = new Map<string, UsageRingSettings>();

	override onWillAppear(ev: WillAppearEvent<UsageRingSettings>): void | Promise<void> {
		const settings = this.rememberSettings(ev.action.id, ev.payload.settings);
		this.startAutoRefresh(ev.action, settings);
		return this.render(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<UsageRingSettings>): void | Promise<void> {
		this.stopAutoRefresh(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<UsageRingSettings>): void | Promise<void> {
		const settings = this.rememberSettings(ev.action.id, ev.payload.settings);
		this.startAutoRefresh(ev.action, settings);
		return this.render(ev.action, settings);
	}

	override onKeyDown(ev: KeyDownEvent<UsageRingSettings>): void | Promise<void> {
		const settings = this.getRememberedSettings(ev.action.id, ev.payload.settings);
		return this.render(ev.action, settings);
	}

	private rememberSettings(actionId: string, settings: UsageRingSettings): UsageRingSettings {
		const remembered = { ...settings };
		this.settingsByAction.set(actionId, remembered);
		return remembered;
	}

	private getRememberedSettings(actionId: string, fallback: UsageRingSettings): UsageRingSettings {
		return this.settingsByAction.get(actionId) ?? fallback;
	}

	private startAutoRefresh(action: KeyAction<UsageRingSettings> | DialAction<UsageRingSettings>, settings: UsageRingSettings): void {
		this.stopAutoRefresh(action.id);

		const refresh = Number(settings.refreshSeconds);
		const seconds = Math.max(Number.isFinite(refresh) ? refresh : DEFAULT_REFRESH_SECONDS, 15);
		const timer = setInterval(() => {
			void this.render(action, this.getRememberedSettings(action.id, settings)).catch((error: unknown) => {
				streamDeck.logger.error("Auto-refresh failed", error);
			});
		}, seconds * 1000);

		this.timers.set(action.id, timer);
	}

	private stopAutoRefresh(actionId: string): void {
		const timer = this.timers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(actionId);
		}
	}

	private async render(
		action: KeyAction<UsageRingSettings> | DialAction<UsageRingSettings>,
		settings: UsageRingSettings,
	): Promise<void> {
		try {
			const snapshot = await fetchUsageSnapshot(settings);
			const image = renderRingImage(snapshot);
			await action.setImage(image);
			await action.setTitle("");
		} catch (error: unknown) {
			streamDeck.logger.error("Failed to render usage ring", error);
			await action.setTitle("ERR");
		}
	}
}
