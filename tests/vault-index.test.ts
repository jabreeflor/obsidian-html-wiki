import { describe, expect, it, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VaultIndex } from "../src/vault-index";
import { loadVault } from "./helpers/load-vault";

const FIXTURE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures/sample-vault",
);

const exclusion = { frontmatterKey: "publish", exclusionValue: false } as const;

describe("VaultIndex", () => {
	let raw: Awaited<ReturnType<typeof loadVault>>;

	beforeAll(async () => {
		raw = await loadVault(FIXTURE_DIR);
	});

	it("indexes all markdown files in the fixture", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		expect(idx.totalCount()).toBe(9);
	});

	it("flags notes with publish: false as excluded", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const priv = idx.get("Drafts/Private rant.md");
		expect(priv).toBeDefined();
		expect(priv!.excluded).toBe(true);
		expect(idx.excludedCount()).toBe(1);
		expect(idx.count()).toBe(8);
	});

	it("computes slug from path with .md stripped and spaces normalized", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const note = idx.get("On Reading/Boredom.md")!;
		expect(note.slug).toBe("on-reading/boredom");
		const fg = idx.get("Reference/A field guide to attention.md")!;
		expect(fg.slug).toBe("reference/a-field-guide-to-attention");
	});

	it("uses the H1 as title and falls back to filename", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		expect(idx.get("On Reading/Boredom.md")!.title).toBe("The Calculus of Boredom");
		expect(idx.get("Reference/Csikszentmihalyi.md")!.title).toBe("Csikszentmihalyi, M.");
	});

	it("falls back to filename when the H1 is suspiciously long (Apple-Notes-style single-line bodies)", () => {
		const idx = new VaultIndex(exclusion);
		const longBody = "# " + "🔥 GitHub Trending Skills — 2026-04-09 ".repeat(20);
		idx.build([
			{ path: "Apple Notes/GitHub Trending.md", mtime: 1, content: longBody },
		]);
		expect(idx.get("Apple Notes/GitHub Trending.md")!.title).toBe("GitHub Trending");
	});

	it("strips markdown formatting from the H1 (bold, italics, HTML, em-dash runs)", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([
			{ path: "a.md", mtime: 1, content: "# **Bankara** Akihabara" },
			{ path: "b.md", mtime: 1, content: "# <b><u>Parents — 250</u></b>" },
			{ path: "c.md", mtime: 1, content: "# ——————————————" },
		]);
		expect(idx.get("a.md")!.title).toBe("Bankara Akihabara");
		expect(idx.get("b.md")!.title).toBe("Parents — 250");
		expect(idx.get("c.md")!.title).toBe("c");
	});

	it("prefers frontmatter title when present", () => {
		const idx = new VaultIndex(exclusion);
		idx.build([
			{
				path: "ny/note.md",
				mtime: 1,
				content: "---\ntitle: My Custom Title\n---\n# Different H1",
			},
		]);
		expect(idx.get("ny/note.md")!.title).toBe("My Custom Title");
	});

	it("resolves wikilinks across folders, with aliases and headings", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const boredom = idx.get("On Reading/Boredom.md")!;
		expect(boredom.outlinks).toContain("On Working/Notes against productivity.md");
		expect(boredom.outlinks).toContain("Reference/Csikszentmihalyi.md");
		expect(boredom.outlinks).not.toContain("slack capacity");
		const marg = idx.get("On Reading/Marginalia.md")!;
		expect(marg.outlinks).toContain("On Reading/Boredom.md");
		expect(marg.outlinks).toContain("On Reading/Why we underline.md");
	});

	it("captures embedded attachments separately from outlinks", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const boredom = idx.get("On Reading/Boredom.md")!;
		expect(boredom.embeddedAttachments).toEqual(["diagram.png"]);
		expect(boredom.outlinks).not.toContain("diagram.png");
	});

	it("aggregates frontmatter and inline tags, ignoring code-fenced hashes", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const boredom = idx.get("On Reading/Boredom.md")!;
		expect(boredom.tags.sort()).toEqual(["attention", "essays", "reading"]);
		const slow = idx.get("On Working/Slow software.md")!;
		expect(slow.tags).toContain("tools");
		expect(slow.tags).not.toContain("fakehash");
		const tags = idx.allTags();
		const tagNames = tags.map((t) => t.tag);
		expect(tagNames).toContain("attention");
		expect(tagNames).not.toContain("private");
	});

	it("computes backlinks as the inverse of outlinks, excluding hidden notes", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const back = idx.backlinksFor("On Reading/Boredom.md").map((n) => n.path);
		expect(back).toContain("On Working/Notes against productivity.md");
		expect(back).toContain("Reference/Csikszentmihalyi.md");
		expect(back).toContain("On Reading/Marginalia.md");
		expect(back).toContain("Reference/A field guide to attention.md");
		expect(back).not.toContain("Drafts/Private rant.md");
	});

	it("update() refreshes a note's outlinks and tags", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		idx.update({
			path: "On Reading/Marginalia.md",
			mtime: Date.now(),
			content: "# Marginalia, defended\n\nNow links only to [[Why we underline]].\n\n#newtag\n",
		});
		const marg = idx.get("On Reading/Marginalia.md")!;
		expect(marg.outlinks).toEqual(["On Reading/Why we underline.md"]);
		expect(marg.tags).toContain("newtag");
		const back = idx.backlinksFor("On Reading/Boredom.md").map((n) => n.path);
		expect(back).not.toContain("On Reading/Marginalia.md");
	});

	it("remove() drops the note and refreshes derived caches", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		idx.remove("On Reading/Marginalia.md");
		expect(idx.get("On Reading/Marginalia.md")).toBeUndefined();
		const back = idx.backlinksFor("On Reading/Boredom.md").map((n) => n.path);
		expect(back).not.toContain("On Reading/Marginalia.md");
	});

	it("rename() moves the entry to the new path and updates lookups", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		idx.rename(
			"On Reading/Marginalia.md",
			"On Reading/Marginalia, defended.md",
			{
				path: "On Reading/Marginalia, defended.md",
				mtime: Date.now(),
				content: "# Marginalia, defended\n\nLinks to [[Boredom]].\n",
			},
		);
		expect(idx.get("On Reading/Marginalia.md")).toBeUndefined();
		expect(idx.get("On Reading/Marginalia, defended.md")).toBeDefined();
		const back = idx.backlinksFor("On Reading/Boredom.md").map((n) => n.path);
		expect(back).toContain("On Reading/Marginalia, defended.md");
	});

	it("graphData() emits nodes and edges only for visible notes", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const g = idx.graphData();
		const nodeIds = g.nodes.map((n) => n.id);
		expect(nodeIds).not.toContain("Drafts/Private rant.md");
		const hasEdgeFromPrivate = g.edges.some((e) => e.source === "Drafts/Private rant.md");
		expect(hasEdgeFromPrivate).toBe(false);
		const expectedEdge = g.edges.find(
			(e) =>
				e.source === "On Reading/Boredom.md" &&
				e.target === "On Working/Notes against productivity.md",
		);
		expect(expectedEdge).toBeDefined();
	});

	it("notesByTag returns visible notes carrying a tag", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const attentionNotes = idx.notesByTag("attention").map((n) => n.path);
		expect(attentionNotes).toContain("On Reading/Boredom.md");
		expect(attentionNotes).toContain("On Working/Notes against productivity.md");
	});

	it("bySlug looks up a visible note by url-style slug", () => {
		const idx = new VaultIndex(exclusion);
		idx.build(raw);
		const boredom = idx.bySlug("on-reading/boredom");
		expect(boredom?.path).toBe("On Reading/Boredom.md");
		expect(idx.bySlug("drafts/private-rant")).toBeUndefined();
	});
});
