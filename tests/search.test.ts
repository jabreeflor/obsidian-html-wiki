import { describe, expect, it, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MiniSearch from "minisearch";
import { VaultIndex } from "../src/vault-index";
import { buildSearchPayload } from "../src/search-index";
import { loadVault } from "./helpers/load-vault";

const FIXTURE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures/sample-vault",
);

const exclusion = { frontmatterKey: "publish", exclusionValue: false } as const;

describe("MiniSearch payload", () => {
	let index: VaultIndex;

	beforeAll(async () => {
		const raws = await loadVault(FIXTURE_DIR);
		index = new VaultIndex(exclusion);
		index.build(raws);
	});

	it("emits docs for every visible note and none of the excluded ones", () => {
		const payload = buildSearchPayload(index);
		const ids = payload.docs.map((d) => d.id);
		expect(ids).toContain("On Reading/Boredom.md");
		expect(ids).toContain("On Working/Notes against productivity.md");
		expect(ids).not.toContain("Drafts/Private rant.md");
		expect(payload.docs.length).toBe(index.count());
	});

	it("declares the search fields and store fields the client needs", () => {
		const payload = buildSearchPayload(index);
		expect(payload.fields).toEqual(["title", "tags", "excerpt"]);
		expect(payload.storeFields).toEqual(["slug", "title", "tags", "excerpt"]);
	});

	it("docs include title, slug, tags, and an excerpt", () => {
		const payload = buildSearchPayload(index);
		const boredom = payload.docs.find((d) => d.id === "On Reading/Boredom.md")!;
		expect(boredom.title).toBe("The Calculus of Boredom");
		expect(boredom.slug).toBe("on-reading/boredom");
		expect(boredom.tags).toContain("attention");
		expect(boredom.excerpt.length).toBeGreaterThan(20);
		expect(boredom.excerpt).not.toContain("[[");
	});

	it("MiniSearch built from the payload returns expected results", () => {
		const payload = buildSearchPayload(index);
		const ms = new MiniSearch({
			fields: payload.fields,
			storeFields: payload.storeFields,
			searchOptions: { boost: { title: 3, tags: 2, excerpt: 1 }, prefix: true, fuzzy: 0.15 },
		});
		ms.addAll(payload.docs);
		const results = ms.search("boredom");
		expect(results.length).toBeGreaterThan(0);
		const top = results[0];
		expect(top["title"]).toBe("The Calculus of Boredom");
		expect(top["slug"]).toBe("on-reading/boredom");

		const tagHits = ms.search("attention");
		const titles = tagHits.map((r) => r["title"]);
		expect(titles).toContain("The Calculus of Boredom");
		expect(titles).toContain("Notes against productivity");

		const privateHits = ms.search("private rant");
		expect(privateHits.find((r) => r["title"] === "A private rant")).toBeUndefined();
	});

	it("excerpts strip frontmatter, embeds, code fences, and wikilink brackets", () => {
		const payload = buildSearchPayload(index);
		for (const d of payload.docs) {
			expect(d.excerpt).not.toMatch(/```/);
			expect(d.excerpt).not.toMatch(/!\[\[/);
			expect(d.excerpt).not.toMatch(/\[\[/);
			expect(d.excerpt).not.toMatch(/^---/);
		}
	});
});
