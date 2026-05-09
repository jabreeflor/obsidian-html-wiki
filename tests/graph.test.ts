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

describe("graphData()", () => {
	let index: VaultIndex;

	beforeAll(async () => {
		const raws = await loadVault(FIXTURE_DIR);
		index = new VaultIndex(exclusion);
		index.build(raws);
	});

	it("returns a payload with parallel nodes/edges arrays", () => {
		const g = index.graphData();
		expect(Array.isArray(g.nodes)).toBe(true);
		expect(Array.isArray(g.edges)).toBe(true);
	});

	it("nodes include id, title, tags for every visible note", () => {
		const g = index.graphData();
		expect(g.nodes.length).toBe(index.count());
		for (const node of g.nodes) {
			expect(typeof node.id).toBe("string");
			expect(typeof node.title).toBe("string");
			expect(Array.isArray(node.tags)).toBe(true);
		}
	});

	it("excludes hidden notes from both nodes and edges", () => {
		const g = index.graphData();
		const ids = g.nodes.map((n) => n.id);
		expect(ids).not.toContain("Drafts/Private rant.md");
		const fromHidden = g.edges.find((e) => e.source === "Drafts/Private rant.md");
		const toHidden = g.edges.find((e) => e.target === "Drafts/Private rant.md");
		expect(fromHidden).toBeUndefined();
		expect(toHidden).toBeUndefined();
	});

	it("emits an edge for each visible-to-visible wikilink", () => {
		const g = index.graphData();
		const expected = g.edges.find(
			(e) =>
				e.source === "On Reading/Boredom.md" &&
				e.target === "On Working/Notes against productivity.md",
		);
		expect(expected).toBeDefined();
	});

	it("does not duplicate parallel edges", () => {
		const g = index.graphData();
		const seen = new Set<string>();
		for (const e of g.edges) {
			const key = `${e.source}->${e.target}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
	});

	it("every edge endpoint is present in nodes", () => {
		const g = index.graphData();
		const nodeIds = new Set(g.nodes.map((n) => n.id));
		for (const e of g.edges) {
			expect(nodeIds.has(e.source)).toBe(true);
			expect(nodeIds.has(e.target)).toBe(true);
		}
	});
});
