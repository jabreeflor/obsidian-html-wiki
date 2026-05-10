import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, HtmlWikiSettings } from "./settings";
import { RawNote, VaultIndex } from "./vault-index";
import {
	AssetBundle,
	AttachmentSource,
	HtmlWikiServer,
	loadDefaultAssets,
	StartResult,
} from "./server";
import { HtmlWikiSettingTab } from "./settings-tab";
import { pathToSlug } from "./slug";

const RIBBON_ICON = "book-open-text";
const STATUS_GREEN = "#2F7D3A";
const STATUS_AMBER = "#8B6F1F";

export default class HtmlWikiPlugin extends Plugin {
	settings: HtmlWikiSettings = DEFAULT_SETTINGS;
	index: VaultIndex | null = null;
	server: HtmlWikiServer | null = null;

	private statusEl: HTMLElement | null = null;
	private currentAddress: StartResult | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.index = new VaultIndex({
			frontmatterKey: this.settings.frontmatterKey,
			exclusionValue: this.settings.exclusionValue,
		});

		this.addSettingTab(new HtmlWikiSettingTab(this.app, this));

		this.addRibbonIcon(RIBBON_ICON, "Open vault wiki in browser", () => {
			this.openVaultHomeInBrowser();
		});

		this.addCommand({
			id: "open-vault",
			name: "Open vault home in browser",
			callback: () => {
				this.openVaultHomeInBrowser();
			},
		});

		this.addCommand({
			id: "open-this-note",
			name: "Open this note in browser",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (checking) return true;
				this.openNoteInBrowser(file);
				return true;
			},
		});

		this.addCommand({
			id: "restart-server",
			name: "Restart server",
			callback: () => {
				void this.restartServer();
			},
		});

		this.statusEl = this.addStatusBarItem();
		this.statusEl.addClass("html-wiki-status-bar");
		this.renderStatusBar(null);

		this.wireVaultEvents();

		this.app.workspace.onLayoutReady(() => {
			void this.boot();
		});
	}

	async onunload(): Promise<void> {
		try {
			await this.server?.stop();
		} catch (e) {
			console.error("HTML Wiki: server stop failed", e);
		}
		this.server = null;
		this.currentAddress = null;
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

	serverAddress(): StartResult | null {
		return this.currentAddress;
	}

	async restartServer(): Promise<void> {
		if (!this.server) {
			await this.boot();
			return;
		}
		try {
			const result = await this.server.restart({
				port: this.settings.port,
				host: this.settings.bindAll ? "0.0.0.0" : "127.0.0.1",
			});
			this.currentAddress = result;
			this.renderStatusBar(result);
			new Notice(`HTML Wiki: serving at http://${result.host}:${result.port}/`);
		} catch (e) {
			this.currentAddress = null;
			this.renderStatusBar(null);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`HTML Wiki: could not start server (${msg})`);
		}
	}

	openVaultHomeInBrowser(): void {
		const url = this.urlFor("/");
		if (!url) {
			new Notice("HTML Wiki: server is not running.");
			return;
		}
		this.openExternal(url);
	}

	openNoteInBrowser(file: TFile): void {
		const slug = pathToSlug(file.path);
		const url = this.urlFor(`/${slug}`);
		if (!url) {
			new Notice("HTML Wiki: server is not running.");
			return;
		}
		this.openExternal(url);
	}

	private urlFor(path: string): string | null {
		const addr = this.currentAddress;
		if (!addr) return null;
		const host = addr.host === "0.0.0.0" ? "127.0.0.1" : addr.host;
		return `http://${host}:${addr.port}${path}`;
	}

	private openExternal(url: string): void {
		try {
			const electron = require("electron") as { shell?: { openExternal: (u: string) => Promise<void> } };
			if (electron?.shell?.openExternal) {
				void electron.shell.openExternal(url);
				return;
			}
		} catch {
			// Fall through to window.open as a safety net.
		}
		window.open(url, "_blank");
	}

	private renderStatusBar(addr: StartResult | null): void {
		if (!this.statusEl) return;
		this.statusEl.empty();
		const dot = this.statusEl.createSpan({ cls: "html-wiki-dot" });
		dot.setText("●");
		dot.style.marginRight = "0.35em";
		const label = this.statusEl.createSpan();
		if (addr) {
			dot.style.color = STATUS_GREEN;
			const host = addr.host === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
			label.setText(`wiki: ${host}:${addr.port}`);
			this.statusEl.setAttribute("aria-label", `Wiki running at http://${host}:${addr.port}/`);
			this.statusEl.style.cursor = "pointer";
			this.statusEl.onclick = () => this.openVaultHomeInBrowser();
		} else {
			dot.style.color = STATUS_AMBER;
			label.setText("wiki: not running");
			this.statusEl.setAttribute("aria-label", "Wiki server not running");
			this.statusEl.style.cursor = "default";
			this.statusEl.onclick = null;
		}
	}

	private async boot(): Promise<void> {
		try {
			await this.buildInitialIndex();
		} catch (e) {
			console.error("HTML Wiki: initial index build failed", e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`HTML Wiki: index build failed (${msg}). Server not started.`);
			return;
		}
		if (!this.index) return;
		const assets = loadDefaultAssets();
		const attachments = this.makeAttachmentSource();
		this.server = new HtmlWikiServer({
			vaultName: this.app.vault.getName(),
			index: this.index,
			attachments,
			assets,
		});
		try {
			const result = await this.server.start({
				port: this.settings.port,
				host: this.settings.bindAll ? "0.0.0.0" : "127.0.0.1",
			});
			this.currentAddress = result;
			this.renderStatusBar(result);
			new Notice(`HTML Wiki: serving at http://${result.host}:${result.port}/`);
		} catch (e) {
			console.error("HTML Wiki: server start failed", e);
			this.currentAddress = null;
			this.renderStatusBar(null);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`HTML Wiki: could not start server (${msg})`);
		}
	}

	private async buildInitialIndex(): Promise<void> {
		if (!this.index) return;
		const files = this.app.vault.getMarkdownFiles();
		const raws: RawNote[] = [];
		let skipped = 0;
		for (const file of files) {
			try {
				const content = await this.app.vault.cachedRead(file);
				raws.push({ path: file.path, mtime: file.stat.mtime, content });
			} catch (e) {
				skipped++;
				console.warn(`HTML Wiki: failed to read ${file.path}`, e);
			}
		}
		this.index.build(raws);
		if (skipped > 0) {
			new Notice(`HTML Wiki: indexed ${raws.length} notes, skipped ${skipped} unreadable.`);
		}
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

	private makeAttachmentSource(): AttachmentSource {
		const adapter = this.app.vault.adapter;
		return {
			async read(rel: string): Promise<Uint8Array | null> {
				try {
					const exists = await adapter.exists(rel);
					if (!exists) return null;
					const buf = await adapter.readBinary(rel);
					return new Uint8Array(buf);
				} catch {
					return null;
				}
			},
		};
	}
}

function isMarkdownFile(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension === "md";
}

export type { AssetBundle };
