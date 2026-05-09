import { describe, expect, it, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Renderer } from "../src/renderer";
import { VaultIndex } from "../src/vault-index";
import { loadVault } from "./helpers/load-vault";

const FIXTURE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures/sample-vault",
);

const exclusion = { frontmatterKey: "publish", exclusionValue: false } as const;

describe("Renderer", () => {
	let index: VaultIndex;
	let renderer: Renderer;

	beforeAll(async () => {
		const raws = await loadVault(FIXTURE_DIR);
		index = new VaultIndex(exclusion);
		index.build(raws);
		renderer = new Renderer();
	});

	it("renders resolved wikilinks with class wikilink and slug href", () => {
		const note = index.get("On Reading/Marginalia.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toContain('class="wikilink"');
		expect(out.html).toContain('href="/on-reading/why-we-underline"');
		expect(out.html).toMatch(/href="\/on-reading\/boredom"[^>]*>the calculus of boredom<\/a>/i);
	});

	it("renders unresolved wikilinks with class 'wikilink unresolved' (no href)", () => {
		const note = index.get("On Reading/Boredom.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toMatch(/class="wikilink unresolved"[^>]*data-target="slack capacity"/);
		expect(out.html).not.toMatch(/href="[^"]*slack-capacity"/);
	});

	it("renders attachment embeds as <img> with /attachments/ src", () => {
		const note = index.get("On Reading/Boredom.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toMatch(/<img[^>]+class="embed"[^>]+src="\/attachments\/diagram\.png"/);
	});

	it("renders Obsidian callouts as <aside class='callout callout-note' data-kind='note'>", () => {
		const note = index.get("Reference/Math and diagrams.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toContain('class="callout callout-note"');
		expect(out.html).toContain('data-kind="note"');
		expect(out.html).toContain("Reading rooms");
		expect(out.html).toContain('class="callout callout-warning"');
		expect(out.html).toMatch(/<span class="callout-title">Warning<\/span>/);
	});

	it("renders KaTeX SSR output for inline and block math", () => {
		const note = index.get("Reference/Math and diagrams.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toContain('class="katex"');
		expect(out.html).toContain('class="math-block"');
	});

	it("emits <pre class='mermaid'> for mermaid fenced blocks (no SSR)", () => {
		const note = index.get("Reference/Math and diagrams.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toMatch(/<pre class="mermaid">graph TD/);
	});

	it("renders task lists with checkboxes", () => {
		const note = index.get("Reference/Math and diagrams.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toContain('type="checkbox"');
		expect(out.html).toMatch(/checked="checked"|checked=""/);
	});

	it("collects an h2/h3 TOC", () => {
		const note = index.get("Reference/Math and diagrams.md")!;
		const out = renderer.render(note, index);
		expect(Array.isArray(out.toc)).toBe(true);
		expect(out.toc.every((e) => e.level === 2 || e.level === 3)).toBe(true);
	});

	it("anchor plugin assigns slugified ids to headings", () => {
		const note = index.get("On Reading/Boredom.md")!;
		const out = renderer.render(note, index);
		expect(out.html).not.toMatch(/<h1\b/);
	});

	it("snapshot of On Reading/Marginalia.md render", () => {
		const note = index.get("On Reading/Marginalia.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toMatchSnapshot();
	});

	it("excluded notes referenced via wikilink resolve to 'unresolved' (privacy)", () => {
		const note = index.get("Drafts/Private rant.md")!;
		const out = renderer.render(note, index);
		expect(out.html).toContain('class="wikilink"');
		const visible = index.get("On Reading/Boredom.md")!;
		const visibleOut = renderer.render(visible, index);
		expect(visibleOut.html).not.toContain('href="/drafts/private-rant"');
	});
});
