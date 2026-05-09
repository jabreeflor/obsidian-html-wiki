import { Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, HtmlWikiSettings } from "./settings";
import { RawNote, VaultIndex } from "./vault-index";

export default class HtmlWikiPlugin extends Plugin {
	settings: HtmlWikiSettings = DEFAULT_SETTINGS;
	index: VaultIndex | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.index = new VaultIndex({
			frontmatterKey: this.settings.frontmatterKey,
			exclusionValue: this.settings.exclusionValue,
		});
		this.app.workspace.onLayoutReady(() => {
			void this.buildInitialIndex();
		});
		this.wireVaultEvents();
	}

	async onunload(): Promise<void> {
		this.index = null;
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<HtmlWikiSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.index?.updateExclusionConfig({
			frontmatterKey: this.settings.frontmatterKey,
			exclusionValue: this.settings.exclusionValue,
		});
	}

	private async buildInitialIndex(): Promise<void> {
		if (!this.index) return;
		const files = this.app.vault.getMarkdownFiles();
		const raws: RawNote[] = [];
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			raws.push({ path: file.path, mtime: file.stat.mtime, content });
		}
		this.index.build(raws);
	}

	private wireVaultEvents(): void {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (!isMarkdownFile(file)) return;
				void this.refreshFile(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!isMarkdownFile(file)) return;
				void this.refreshFile(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (!file.path.endsWith(".md")) return;
				this.index?.remove(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!isMarkdownFile(file)) {
					if (oldPath.endsWith(".md")) this.index?.remove(oldPath);
					return;
				}
				void this.handleRename(file, oldPath);
			}),
		);
	}

	private async refreshFile(file: TFile): Promise<void> {
		if (!this.index) return;
		const content = await this.app.vault.cachedRead(file);
		this.index.update({ path: file.path, mtime: file.stat.mtime, content });
	}

	private async handleRename(file: TFile, oldPath: string): Promise<void> {
		if (!this.index) return;
		const content = await this.app.vault.cachedRead(file);
		this.index.rename(oldPath, file.path, {
			path: file.path,
			mtime: file.stat.mtime,
			content,
		});
	}
}

function isMarkdownFile(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension === "md";
}
