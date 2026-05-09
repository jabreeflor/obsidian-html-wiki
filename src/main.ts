import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, HtmlWikiSettings } from "./settings";

export default class HtmlWikiPlugin extends Plugin {
	settings: HtmlWikiSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
	}

	async onunload(): Promise<void> {
		// Server teardown and event-unwiring will land in later milestones.
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<HtmlWikiSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
