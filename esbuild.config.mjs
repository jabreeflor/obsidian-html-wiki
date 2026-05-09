import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const banner = `/*
 * obsidian-html-wiki — auto-generated bundle.
 * Source at https://github.com/ — see manifest.json.
 */`;

const prod = process.argv[2] === "production";

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
