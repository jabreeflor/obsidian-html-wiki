import { App, PluginSettingTab, Setting } from "obsidian";
import type HtmlWikiPlugin from "./main";

export class HtmlWikiSettingTab extends PluginSettingTab {
	private plugin: HtmlWikiPlugin;

	constructor(app: App, plugin: HtmlWikiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "HTML Wiki" });
		const intro = containerEl.createEl("p", { cls: "setting-item-description" });
		intro.appendText(
			"Live HTML view of this vault, served locally. Notes update as you edit them in Obsidian.",
		);

		new Setting(containerEl)
			.setName("Port")
			.setDesc(
				"Loopback port the wiki server listens on. Must be in the range 1024–65535 (privileged ports are not allowed). Defaults to 8484.",
			)
			.addText((text) => {
				text
					.setPlaceholder("8484")
					.setValue(String(this.plugin.settings.port))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!Number.isFinite(n) || n < 1024 || n > 65535) return;
						this.plugin.settings.port = n;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttribute("type", "number");
				text.inputEl.setAttribute("min", "1024");
				text.inputEl.setAttribute("max", "65535");
				text.inputEl.style.width = "8rem";
			});

		new Setting(containerEl)
			.setName("Frontmatter exclusion key")
			.setDesc(
				"Notes whose frontmatter sets this key to the exclusion value (below) are hidden from the wiki.",
			)
			.addText((text) =>
				text
					.setPlaceholder("publish")
					.setValue(this.plugin.settings.frontmatterKey)
					.onChange(async (value) => {
						const trimmed = value.trim();
						if (!trimmed) return;
						this.plugin.settings.frontmatterKey = trimmed;
						await this.plugin.saveSettings();
						this.refreshExcludedCount();
					}),
			);

		new Setting(containerEl)
			.setName("Exclusion value")
			.setDesc(
				"What value of the key above triggers exclusion. Default 'false' (boolean). Use 'true' or any literal string.",
			)
			.addText((text) =>
				text
					.setPlaceholder("false")
					.setValue(String(this.plugin.settings.exclusionValue))
					.onChange(async (value) => {
						this.plugin.settings.exclusionValue = parseExclusionLiteral(value);
						await this.plugin.saveSettings();
						this.refreshExcludedCount();
					}),
			);

		new Setting(containerEl)
			.setName("Bind to all interfaces")
			.setDesc(
				"Off (default): listen on 127.0.0.1 — only this machine can reach the wiki. On: listen on 0.0.0.0 — anyone on your network can read your vault. Use only on trusted networks.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.bindAll).onChange(async (value) => {
					this.plugin.settings.bindAll = value;
					await this.plugin.saveSettings();
					this.warnIfBindAll();
				}),
			);

		this.warnIfBindAll();

		new Setting(containerEl)
			.setName("Server")
			.setDesc("Restart the server (e.g. after changing the port or bind setting), or open the vault home in your browser.")
			.addButton((btn) =>
				btn
					.setButtonText("Restart server")
					.onClick(async () => {
						await this.plugin.restartServer();
						this.refreshAddressLine();
					}),
			)
			.addButton((btn) =>
				btn
					.setCta()
					.setButtonText("Open vault")
					.onClick(() => {
						this.plugin.openVaultHomeInBrowser();
					}),
			);

		const status = containerEl.createDiv({ cls: "html-wiki-status" });
		status.style.marginTop = "0.6rem";
		status.style.fontSize = "0.85em";
		status.style.color = "var(--text-muted)";
		status.dataset["role"] = "address-line";
		this.renderAddressLine(status);

		const exclusion = containerEl.createDiv({ cls: "html-wiki-exclusion" });
		exclusion.style.marginTop = "0.4rem";
		exclusion.style.fontSize = "0.85em";
		exclusion.style.color = "var(--text-muted)";
		exclusion.dataset["role"] = "excluded-line";
		this.renderExcludedCount(exclusion);
	}

	private warnIfBindAll(): void {
		const existing = this.containerEl.querySelector('[data-role="bindall-warning"]');
		if (existing) existing.remove();
		if (!this.plugin.settings.bindAll) return;
		const warn = this.containerEl.createDiv();
		warn.dataset["role"] = "bindall-warning";
		warn.style.padding = "0.55rem 0.75rem";
		warn.style.borderLeft = "3px solid #8B6F1F";
		warn.style.background = "rgba(139, 111, 31, 0.08)";
		warn.style.fontSize = "0.85em";
		warn.style.margin = "0.4rem 0 0.8rem";
		warn.setText(
			"Warning: any device on this network that knows your IP can read your vault. Disable when on coffee-shop / public Wi-Fi.",
		);
	}

	private refreshExcludedCount(): void {
		const el = this.containerEl.querySelector(
			'[data-role="excluded-line"]',
		) as HTMLDivElement | null;
		if (el) this.renderExcludedCount(el);
	}

	private refreshAddressLine(): void {
		const el = this.containerEl.querySelector(
			'[data-role="address-line"]',
		) as HTMLDivElement | null;
		if (el) this.renderAddressLine(el);
	}

	private renderExcludedCount(el: HTMLDivElement): void {
		el.empty();
		const idx = this.plugin.index;
		if (!idx) {
			el.setText("Index not yet built.");
			return;
		}
		const total = idx.totalCount();
		const excluded = idx.excludedCount();
		el.setText(
			`${excluded} of ${total} note${total === 1 ? "" : "s"} hidden by exclusion.`,
		);
	}

	private renderAddressLine(el: HTMLDivElement): void {
		el.empty();
		const addr = this.plugin.serverAddress();
		if (!addr) {
			el.setText("Server not running.");
			return;
		}
		el.setText(`Serving at http://${addr.host}:${addr.port}/`);
	}
}

function parseExclusionLiteral(raw: string): string | boolean | number {
	const trimmed = raw.trim();
	if (trimmed === "") return false;
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	const n = Number(trimmed);
	if (!Number.isNaN(n) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) return n;
	return trimmed;
}
