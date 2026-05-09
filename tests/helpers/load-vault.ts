import { promises as fs } from "node:fs";
import path from "node:path";
import type { RawNote } from "../../src/vault-index";

export async function loadVault(rootDir: string): Promise<RawNote[]> {
	const out: RawNote[] = [];
	await walk(rootDir, rootDir, out);
	out.sort((a, b) => a.path.localeCompare(b.path));
	return out;
}

async function walk(rootDir: string, current: string, out: RawNote[]): Promise<void> {
	const entries = await fs.readdir(current, { withFileTypes: true });
	for (const entry of entries) {
		const abs = path.join(current, entry.name);
		if (entry.isDirectory()) {
			await walk(rootDir, abs, out);
			continue;
		}
		if (!entry.name.endsWith(".md")) continue;
		const content = await fs.readFile(abs, "utf-8");
		const stat = await fs.stat(abs);
		const rel = path.relative(rootDir, abs).split(path.sep).join("/");
		out.push({ path: rel, mtime: stat.mtimeMs, content });
	}
}
