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
	buildLeftNav,
	renderNavFolderBody,
} from "../src/theme/templates";
import type { RawNote } from "../src/vault-index";
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
		expect(html).toContain('src="/assets/main.js"');
		expect(html).toContain('type="module"');
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

function makeRaw(p: string, mtime: number, opts?: { exclude?: boolean; title?: string }): RawNote {
	const fm: string[] = [];
	if (opts?.exclude) fm.push("publish: false");
	if (opts?.title) fm.push(`title: ${opts.title}`);
	const frontmatter = fm.length ? `---\n${fm.join("\n")}\n---\n` : "";
	const heading = opts?.title ?? p.split("/").pop()!.replace(/\.md$/, "");
	const body = `${frontmatter}# ${heading}\n\nbody`;
	return { path: p, mtime, content: body };
}

describe("buildLeftNav (hierarchical)", () => {
	it("renders nested folders along the open chain", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([
			makeRaw("Reference/Frameworks/React.md", 100),
			makeRaw("Reference/Frameworks/Vue.md", 200),
			makeRaw("Reference/Languages/Go.md", 300),
		]);
		const html = buildLeftNav(idx, "Reference/Frameworks/React.md");
		expect(html).toContain('data-folder="Reference"');
		expect(html).toContain('data-folder="Reference/Frameworks"');
		// sibling subfolder is a closed stub but still rendered as a <details>
		expect(html).toContain('data-folder="Reference/Languages"');
		expect(html).toContain(">React<");
		expect(html).toContain(">Vue<");
	});

	it("ships closed folders as stubs without a body div (lazy-load)", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([
			makeRaw("Closed/Inside.md", 100, { title: "Inside" }),
			makeRaw("Other/Marker.md", 200, { title: "Marker" }),
		]);
		const html = buildLeftNav(idx, "Other/Marker.md");
		const closedMatch = /<details[^>]*data-folder="Closed"[^>]*>([\s\S]*?)<\/details>/.exec(html);
		expect(closedMatch).not.toBeNull();
		expect(closedMatch![1]).not.toContain("nav-folder-body");
		expect(closedMatch![1]).not.toContain("Inside");
		expect(html).toContain('data-count="1"');
	});

	it("emits a single shared <symbol> for the folder chevron (not inline per folder)", () => {
		const idx = new VaultIndex(exclusion);
		const raws: RawNote[] = [];
		for (let i = 0; i < 10; i++) raws.push(makeRaw(`F${i}/N.md`, 100 + i));
		idx.build(raws);
		const html = buildLeftNav(idx);
		const symbolCount = (html.match(/<symbol id="nav-folder-chevron"/g) ?? []).length;
		expect(symbolCount).toBe(1);
		expect(html).toContain('<use href="#nav-folder-chevron"');
		expect(html).not.toContain('<path d="M3 2 L7 5 L3 8"/></svg><span class="folder-name"');
	});

	it("opens the chain of folders containing the current note and collapses siblings", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([
			makeRaw("Reference/Frameworks/React.md", 100),
			makeRaw("Reference/Languages/Go.md", 200),
			makeRaw("Drafts/Idea.md", 300),
		]);
		const html = buildLeftNav(idx, "Reference/Frameworks/React.md");
		expect(html).toMatch(/<details[^>]*open[^>]*data-folder="Reference"/);
		expect(html).toMatch(/<details[^>]*open[^>]*data-folder="Reference\/Frameworks"/);
		expect(html).toMatch(/<details(?![^>]*open)[^>]*data-folder="Reference\/Languages"/);
		expect(html).toMatch(/<details(?![^>]*open)[^>]*data-folder="Drafts"/);
	});

	it("truncates folders with more than 40 notes to 20 plus a 'more' link", () => {
		const idx = new VaultIndex(exclusion);
		const raws: RawNote[] = [];
		for (let i = 0; i < 45; i++) {
			const num = String(i).padStart(2, "0");
			raws.push(makeRaw(`Big/Note ${num}.md`, 100 + i));
		}
		idx.build(raws);
		const html = buildLeftNav(idx, "Big/Note 00.md");
		const folderMatch = /<details[^>]*data-folder="Big"[^>]*>([\s\S]*?)<\/details>/.exec(html);
		expect(folderMatch).not.toBeNull();
		const folderHtml = folderMatch![1];
		const liCount = (folderHtml.match(/<li>/g) ?? []).length;
		expect(liCount).toBe(20);
		expect(folderHtml).toContain('class="more"');
		expect(folderHtml).toContain("+ 25 more in Big");
		expect(folderHtml).toContain('href="/folder/Big"');
	});

	it("does not truncate folders with 40 or fewer notes", () => {
		const idx = new VaultIndex(exclusion);
		const raws: RawNote[] = [];
		for (let i = 0; i < 40; i++) {
			raws.push(makeRaw(`Edge/Note ${i}.md`, 100 + i));
		}
		idx.build(raws);
		const html = buildLeftNav(idx, "Edge/Note 0.md");
		const folderMatch = /<details[^>]*data-folder="Edge"[^>]*>([\s\S]*?)<\/details>/.exec(html);
		expect(folderMatch).not.toBeNull();
		expect(folderMatch![1]).not.toContain('class="more"');
	});

	it("renders a Recent section with up to 10 most-recent visible notes", () => {
		const idx = new VaultIndex(exclusion);
		const raws: RawNote[] = [];
		for (let i = 0; i < 15; i++) {
			raws.push(makeRaw(`F/N${i}.md`, 1000 + i, { title: `Title ${i}` }));
		}
		idx.build(raws);
		const html = buildLeftNav(idx);
		const recentMatch = /<div class="nav-recent">([\s\S]*?)<\/ul>\s*<\/div>/.exec(html);
		expect(recentMatch).not.toBeNull();
		const recentHtml = recentMatch![1];
		const liCount = (recentHtml.match(/<li/g) ?? []).length;
		expect(liCount).toBe(10);
		expect(recentHtml).toContain("Title 14");
		expect(recentHtml).toContain("Title 5");
		expect(recentHtml).not.toContain("Title 4");
	});

	it("excludes notes flagged via exclusion frontmatter from both Recent and tree", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([
			makeRaw("Public/Visible.md", 100, { title: "Visible Note" }),
			makeRaw("Private/Hidden.md", 200, { title: "Hidden Note", exclude: true }),
		]);
		const html = buildLeftNav(idx);
		expect(html).toContain("Visible Note");
		expect(html).not.toContain("Hidden Note");
		expect(html).not.toContain('data-folder="Private"');
	});

	it("includes the filter input and Recent / tree containers", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([makeRaw("F/N.md", 100)]);
		const html = buildLeftNav(idx);
		expect(html).toContain('id="nav-filter"');
		expect(html).toContain('class="nav-filter"');
		expect(html).toContain('class="nav-recent"');
		expect(html).toContain('class="nav-tree"');
		expect(html).toContain('<hr class="nav-divider">');
	});

	it("preserves white-space:nowrap + ellipsis truncation on nav links", () => {
		expect(THEME_CSS).toMatch(/aside\.nav li a\s*\{[\s\S]*white-space:\s*nowrap[\s\S]*text-overflow:\s*ellipsis/);
	});
});

describe("renderNavFolderBody (lazy-load endpoint)", () => {
	it("returns the children of a folder with subfolders rendered as fully-stubbed details", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([
			makeRaw("Reference/Frameworks/React.md", 100),
			makeRaw("Reference/Languages/Go.md", 200),
			makeRaw("Reference/note.md", 300, { title: "Top" }),
		]);
		const html = renderNavFolderBody(idx, "Reference");
		expect(html).not.toBeNull();
		// Reference body should include both subfolder stubs and a UL of leaf notes
		expect(html).toContain('data-folder="Reference/Frameworks"');
		expect(html).toContain('data-folder="Reference/Languages"');
		expect(html).toContain(">Top<");
		// Stubs do NOT include their grand-children
		expect(html).not.toContain(">React<");
	});

	it("returns null for unknown folders", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([makeRaw("F/N.md", 100)]);
		expect(renderNavFolderBody(idx, "Bogus")).toBeNull();
	});
});
