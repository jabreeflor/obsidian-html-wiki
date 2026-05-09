import { promises as fs } from "node:fs";
import path from "node:path";
import { VaultIndex } from "../src/vault-index";
import { HtmlWikiServer, loadDefaultAssets } from "../src/server";

interface RawNote {
	path: string;
	mtime: number;
	content: string;
}

async function loadVault(rootDir: string): Promise<RawNote[]> {
	const out: RawNote[] = [];
	async function walk(dir: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const e of entries) {
			const abs = path.join(dir, e.name);
			if (e.isDirectory()) {
				await walk(abs);
			} else if (e.name.endsWith(".md")) {
				const content = await fs.readFile(abs, "utf-8");
				const stat = await fs.stat(abs);
				const rel = path.relative(rootDir, abs).split(path.sep).join("/");
				out.push({ path: rel, mtime: stat.mtimeMs, content });
			}
		}
	}
	await walk(rootDir);
	return out;
}

async function main(): Promise<void> {
	const vaultDir = process.env["WIKI_VAULT"] ?? "tests/fixtures/sample-vault";
	const port = Number(process.env["WIKI_PORT"] ?? 8485);
	const raws = await loadVault(vaultDir);
	const index = new VaultIndex({ frontmatterKey: "publish", exclusionValue: false });
	index.build(raws);
	const server = new HtmlWikiServer({
		vaultName: process.env["WIKI_NAME"] ?? "atlas",
		index,
		attachments: { async read() { return null; } },
		assets: loadDefaultAssets(),
	});
	const result = await server.start({ port, host: "127.0.0.1" });
	process.stdout.write(`dev-server: http://127.0.0.1:${result.port}/\n`);
	const cleanup = async (): Promise<void> => {
		try { await server.stop(); } catch { /* ignore */ }
		process.exit(0);
	};
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
