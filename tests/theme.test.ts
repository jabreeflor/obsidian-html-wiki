import { describe, expect, it, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VaultIndex } from "../src/vault-index";
import { Renderer } from "../src/renderer";
import {
	notePage,
	homePage,
	tagsIndexPage,
	tagPage,
	graphPage,
	searchPage,
	notFoundPage,
} from "../src/theme/templates";
import { THEME_CSS } from "../src/theme/bundled";
import { loadVault } from "./helpers/load-vault";

const FIXTURE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures/sample-vault",
);

const exclusion = { frontmatterKey: "publish", exclusionValue: false } as const;

describe("Quiet Reference theme", () => {
	let index: VaultIndex;
	let renderer: Renderer;
	const site = () => ({ vaultName: "atlas", index });

	beforeAll(async () => {
		const raws = await loadVault(FIXTURE_DIR);
		index = new VaultIndex(exclusion);
		index.build(raws);
		renderer = new Renderer();
	});

	it("loads Newsreader, Inter, JetBrains Mono via Google Fonts", () => {
		const html = homePage(site());
		expect(html).toMatch(/fonts\.googleapis\.com\/css2.*Newsreader/);
		expect(html).toContain("Inter:wght@400;500;600;700");
		expect(html).toContain("JetBrains+Mono");
		expect(html).toContain('rel="preconnect" href="https://fonts.gstatic.com"');
	});

	it("links the bundled theme + katex stylesheets and the client script", () => {
		const html = homePage(site());
		expect(html).toContain('href="/assets/theme.css"');
		expect(html).toContain('href="/assets/katex.css"');
		expect(html).toContain('src="/assets/client.js"');
	});

	it("top bar uses brand · search · nav columns with SVG icons (no emoji)", () => {
		const html = homePage(site());
		expect(html).toContain('class="top"');
		expect(html).toContain('class="brand"');
		expect(html).toContain('<span class="dot">.</span>');
		expect(html).toContain('class="search"');
		expect(html).toContain('placeholder="Search the wiki"');
		expect(html).toContain('class="kbd"');
		expect(html).toContain("⌘ K");
		expect(html).toContain('class="top-nav"');
		expect(html).toMatch(/<svg[^>]*viewBox="0 0 16 16"/);
		expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
	});

	it("note page emits crumbs, h1, lede, meta-row, tag pills, and right-aside blocks", () => {
		const note = index.get("On Reading/Boredom.md")!;
		const html = notePage(note, site(), renderer);
		expect(html).toContain('class="crumbs"');
		expect(html).toMatch(/<h1>The Calculus of Boredom<\/h1>/);
		expect(html).toContain('class="meta-row"');
		expect(html).toMatch(/class="pill"[^>]*href="\/tags\/attention"/);
		expect(html).toContain('aside class="toc"');
		expect(html).toContain('class="backlinks"');
		expect(html).toContain('class="graph-thumb"');
	});

	it("breadcrumb root is the vault name (not 'Home')", () => {
		const note = index.get("On Reading/Boredom.md")!;
		const html = notePage(note, site(), renderer);
		expect(html).toMatch(/class="crumbs"[^>]*>\s*<a href="\/">atlas<\/a>/);
	});

	it("tags index, tag page, search page, graph page, and 404 all render with the theme class", () => {
		expect(tagsIndexPage(site())).toContain('class="theme-quiet-reference page-tags"');
		expect(tagPage(site(), "attention")).toContain('class="theme-quiet-reference page-tag"');
		expect(searchPage(site())).toContain('class="theme-quiet-reference page-search"');
		expect(graphPage(site())).toContain('class="theme-quiet-reference page-graph"');
		expect(notFoundPage(site(), "/no")).toContain('class="theme-quiet-reference page-404"');
	});

	it("CSS bundle defines the spec color tokens and avoids 'tech' blue / purple", () => {
		expect(THEME_CSS).toContain("--accent: #1C2A3A");
		expect(THEME_CSS).toContain("--bg: #FFFFFF");
		expect(THEME_CSS).toContain("--ink: #0F1115");
		expect(THEME_CSS).toContain("--rule: #E8E8E4");
		expect(THEME_CSS.toLowerCase()).not.toContain("#3b82f6");
		expect(THEME_CSS.toLowerCase()).not.toContain("rgb(59, 130, 246)");
		expect(THEME_CSS).not.toMatch(/#[a-f0-9]{0,2}[6-9a-f][0-9a-f][3-7][0-9a-f][a-f]/i);
	});

	it("CSS bundle implements both responsive breakpoints", () => {
		expect(THEME_CSS).toMatch(/@media\s*\(\s*max-width:\s*1100px/);
		expect(THEME_CSS).toMatch(/@media\s*\(\s*max-width:\s*780px/);
		expect(THEME_CSS).toMatch(/aside\.toc\s*\{\s*display:\s*none/);
		expect(THEME_CSS).toMatch(/aside\.nav\s*\{\s*display:\s*none/);
	});

	it("CSS uses Newsreader for body/serif and Inter for chrome", () => {
		expect(THEME_CSS).toMatch(/--serif:\s*"Newsreader"/);
		expect(THEME_CSS).toMatch(/--sans:\s*"Inter"/);
		expect(THEME_CSS).toMatch(/--mono:\s*"JetBrains Mono"/);
		expect(THEME_CSS).toMatch(/article p\s*\{[^}]*var\(--serif\)/);
	});

	it("callouts use a circular accent-bg icon (no emoji)", () => {
		expect(THEME_CSS).toMatch(/\.callout-icon\s*\{[\s\S]*border-radius:\s*50%/);
		expect(THEME_CSS).toMatch(/\.callout-icon\s*\{[\s\S]*background:\s*var\(--accent\)/);
	});

	it("home page lists recent notes and a tag cloud", () => {
		const html = homePage(site());
		expect(html).toContain("Recent notes");
		expect(html).toContain("class=\"tagcloud-list\"");
	});
});
