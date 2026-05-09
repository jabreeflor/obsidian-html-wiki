import esbuild from "esbuild";
import process from "node:process";
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import builtins from "builtin-modules";

const banner = `/*
 * obsidian-html-wiki — auto-generated bundle.
 * Source at https://github.com/ — see manifest.json.
 */`;

const prod = process.argv[2] === "production";

const CLIENT_OUT_DIR = "build/client";
const CLIENT_BUNDLE_FILE = "src/theme/client-bundle.json";

// 1. Build the browser client as ESM with code-splitting so heavy deps
//    (mermaid, d3-force) sit in their own chunks and only load on demand.
async function buildClient() {
	await rm(CLIENT_OUT_DIR, { recursive: true, force: true });
	await mkdir(CLIENT_OUT_DIR, { recursive: true });
	await esbuild.build({
		entryPoints: ["src/client/main.ts"],
		bundle: true,
		format: "esm",
		splitting: true,
		target: "es2019",
		outdir: CLIENT_OUT_DIR,
		entryNames: "[name]",
		chunkNames: "chunk-[name]-[hash]",
		logLevel: "warning",
		sourcemap: false,
		treeShaking: true,
		minify: prod,
	});

	const chunks = {};
	const files = await readdir(CLIENT_OUT_DIR);
	for (const f of files) {
		if (!f.endsWith(".js")) continue;
		const content = await readFile(path.join(CLIENT_OUT_DIR, f), "utf-8");
		chunks[f] = content;
	}
	await writeFile(CLIENT_BUNDLE_FILE, JSON.stringify(chunks));
	const total = Object.values(chunks).reduce((acc, s) => acc + s.length, 0);
	console.log(
		`client: ${Object.keys(chunks).length} chunks, ${(total / 1024).toFixed(1)} KB total`,
	);
}

await buildClient();

// 2. Build the Obsidian plugin (CJS) for desktop.
const ctx = await esbuild.context({
	banner: { js: banner },
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
		...builtins.map((b) => `node:${b}`),
	],
	format: "cjs",
	target: "es2018",
	loader: { ".css": "text", ".txt": "text" },
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

if (prod) {
	await ctx.rebuild();
	await ctx.dispose();
} else {
	await ctx.watch();
}
