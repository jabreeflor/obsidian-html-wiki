import { defineConfig, type Plugin } from "vitest/config";
import { promises as fs } from "node:fs";
import path from "node:path";

const TEXT_EXT = new Set([".css", ".txt"]);

function rawTextLoader(): Plugin {
	return {
		name: "raw-text-loader",
		enforce: "pre",
		async resolveId(source, importer) {
			const ext = path.extname(source);
			if (!TEXT_EXT.has(ext)) return null;
			if (!importer) return null;
			const resolved = path.resolve(path.dirname(importer), source);
			return resolved + "?raw-text";
		},
		async load(id) {
			if (!id.endsWith("?raw-text")) return null;
			const filePath = id.slice(0, -"?raw-text".length);
			const content = await fs.readFile(filePath, "utf-8");
			return `export default ${JSON.stringify(content)};`;
		},
	};
}

export default defineConfig({
	plugins: [rawTextLoader()],
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		testTimeout: 15000,
	},
});
