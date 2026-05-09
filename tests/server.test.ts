import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { request } from "undici";
import { HtmlWikiServer, AssetBundle, AttachmentSource } from "../src/server";
import { VaultIndex } from "../src/vault-index";
import { loadVault } from "./helpers/load-vault";

const FIXTURE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures/sample-vault",
);

const exclusion = { frontmatterKey: "publish", exclusionValue: false } as const;

let server: HtmlWikiServer;
let baseUrl: string;
let index: VaultIndex;
const attachmentBytes = new TextEncoder().encode("fake-image");

const fakeAssets: AssetBundle = {
	"theme.css": "/* theme placeholder */ body.theme-quiet-reference { color: #000 }",
	"client.js": "/* client placeholder */",
	"katex.css": "/* katex placeholder */",
};

const fakeAttachments: AttachmentSource = {
	async read(rel: string): Promise<Uint8Array | null> {
		if (rel === "diagram.png") return attachmentBytes;
		return null;
	},
};

beforeAll(async () => {
	const raws = await loadVault(FIXTURE_DIR);
	index = new VaultIndex(exclusion);
	index.build(raws);
	server = new HtmlWikiServer({
		vaultName: "sample-vault",
		index,
		attachments: fakeAttachments,
		assets: fakeAssets,
	});
	const result = await server.start({ port: 0, host: "127.0.0.1" });
	baseUrl = `http://127.0.0.1:${result.port}`;
});

afterAll(async () => {
	await server.stop();
});

async function get(path_: string) {
	const r = await request(`${baseUrl}${path_}`);
	const body = await r.body.text();
	return { status: r.statusCode, headers: r.headers, body };
}

describe("HtmlWikiServer", () => {
	it("GET / returns 200 HTML with theme class", async () => {
		const r = await get("/");
		expect(r.status).toBe(200);
		expect(String(r.headers["content-type"])).toMatch(/text\/html/);
		expect(r.body).toContain('class="theme-quiet-reference');
		expect(r.body).toContain("<title>");
		expect(r.body).toContain("sample-vault");
	});

	it("GET /<slug> renders an indexed note", async () => {
		const r = await get("/on-reading/boredom");
		expect(r.status).toBe(200);
		expect(r.body).toContain("The Calculus of Boredom");
		expect(r.body).toContain('class="wikilink"');
	});

	it("GET excluded slug returns 404", async () => {
		const r = await get("/drafts/private-rant");
		expect(r.status).toBe(404);
		expect(r.body).toContain("Not found");
	});

	it("GET unknown slug returns 404 styled page", async () => {
		const r = await get("/no-such-note");
		expect(r.status).toBe(404);
		expect(r.body).toContain('class="theme-quiet-reference');
	});

	it("GET /tags/ lists tags", async () => {
		const r = await get("/tags/");
		expect(r.status).toBe(200);
		expect(r.body).toContain("Tags");
		expect(r.body).toContain("attention");
	});

	it("GET /tags/<tag> lists notes for that tag", async () => {
		const r = await get("/tags/attention");
		expect(r.status).toBe(200);
		expect(r.body).toContain("#attention");
		expect(r.body).toContain("The Calculus of Boredom");
	});

	it("GET /graph/ returns the graph shell", async () => {
		const r = await get("/graph/");
		expect(r.status).toBe(200);
		expect(r.body).toContain('id="graph-root"');
	});

	it("GET /search/ returns the search shell", async () => {
		const r = await get("/search/");
		expect(r.status).toBe(200);
		expect(r.body).toContain('id="search-input"');
	});

	it("GET /api/search-index.json returns JSON docs", async () => {
		const r = await get("/api/search-index.json");
		expect(r.status).toBe(200);
		expect(String(r.headers["content-type"])).toMatch(/application\/json/);
		const json = JSON.parse(r.body) as { docs: { title: string }[] };
		expect(json.docs.length).toBeGreaterThan(0);
		const titles = json.docs.map((d) => d.title);
		expect(titles).toContain("The Calculus of Boredom");
		expect(titles).not.toContain("A private rant");
	});

	it("GET /api/graph.json returns nodes and edges (visible only)", async () => {
		const r = await get("/api/graph.json");
		expect(r.status).toBe(200);
		const json = JSON.parse(r.body) as { nodes: { id: string }[]; edges: unknown[] };
		expect(Array.isArray(json.nodes)).toBe(true);
		expect(Array.isArray(json.edges)).toBe(true);
		const ids = json.nodes.map((n) => n.id);
		expect(ids).not.toContain("Drafts/Private rant.md");
	});

	it("GET /assets/theme.css returns CSS", async () => {
		const r = await get("/assets/theme.css");
		expect(r.status).toBe(200);
		expect(String(r.headers["content-type"])).toMatch(/text\/css/);
		expect(r.body).toContain("theme-quiet-reference");
	});

	it("GET /assets/client.js returns JS", async () => {
		const r = await get("/assets/client.js");
		expect(r.status).toBe(200);
		expect(String(r.headers["content-type"])).toMatch(/javascript/);
	});

	it("GET /attachments/diagram.png returns the file with image mime", async () => {
		const r = await request(`${baseUrl}/attachments/diagram.png`);
		expect(r.statusCode).toBe(200);
		expect(String(r.headers["content-type"])).toContain("image/png");
		const buf = Buffer.from(await r.body.arrayBuffer());
		expect(buf.toString("utf-8")).toBe("fake-image");
	});

	it("GET /attachments/missing returns 404", async () => {
		const r = await get("/attachments/missing.png");
		expect(r.status).toBe(404);
	});

	it("disallowed methods return 405", async () => {
		const r = await request(`${baseUrl}/`, { method: "POST" });
		expect(r.statusCode).toBe(405);
	});

	it("server can stop and rebind on a different port", async () => {
		await server.stop();
		const result = await server.start({ port: 0, host: "127.0.0.1" });
		baseUrl = `http://127.0.0.1:${result.port}`;
		const r = await get("/");
		expect(r.status).toBe(200);
	});
});

describe("HtmlWikiServer port retry", () => {
	it("falls through to a free port within maxRetries when target is taken", async () => {
		const blocker = await new Promise<{ port: number; close: () => Promise<void> }>(
			(resolve, reject) => {
				const http = require("node:http");
				const srv = http.createServer((_: unknown, r: { end: () => void }) => r.end());
				srv.once("error", reject);
				srv.listen(0, "127.0.0.1", () => {
					const addr = srv.address();
					const port = typeof addr === "object" && addr ? addr.port : 0;
					resolve({
						port,
						close: () => new Promise<void>((res) => srv.close(() => res())),
					});
				});
			},
		);

		const tmpVault = new VaultIndex(exclusion);
		tmpVault.build([]);
		const tmp = new HtmlWikiServer({
			vaultName: "x",
			index: tmpVault,
			attachments: { async read() { return null; } },
			assets: fakeAssets,
		});
		const result = await tmp.start({ port: blocker.port, host: "127.0.0.1", maxRetries: 5 });
		expect(result.port).not.toBe(blocker.port);
		expect(result.port).toBeGreaterThan(blocker.port);
		await tmp.stop();
		await blocker.close();

		void fs.access; // touch the import so it's not flagged as unused in CI lint
	});
});
