// Imports text content of theme assets at bundle time.
// In esbuild we configure { ".css": "text", ".txt": "text", ".json": "json" }
// so these resolve to the file's content. Vitest is configured similarly.
// @ts-ignore - bundler-only import
import themeCss from "./theme.css.txt";
// @ts-ignore - bundler-only import
import katexCss from "../../node_modules/katex/dist/katex.min.css";
import clientChunks from "./client-bundle.json";

export const THEME_CSS: string = themeCss as unknown as string;
export const KATEX_CSS: string = katexCss as unknown as string;
export const CLIENT_CHUNKS: Record<string, string> = clientChunks as Record<string, string>;
export const CLIENT_ENTRY = "main.js";
