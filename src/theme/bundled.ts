// Imports text content of theme assets at bundle time.
// In esbuild we configure { ".css": "text", ".txt": "text" } so these
// resolve to the file's text content. Vitest is configured similarly.
// @ts-ignore - bundler-only import
import themeCss from "./theme.css";
// @ts-ignore - bundler-only import
import clientJs from "./client.js.txt";
// @ts-ignore - bundler-only import
import katexCss from "../../node_modules/katex/dist/katex.min.css";

export const THEME_CSS: string = themeCss as unknown as string;
export const CLIENT_JS: string = clientJs as unknown as string;
export const KATEX_CSS: string = katexCss as unknown as string;
