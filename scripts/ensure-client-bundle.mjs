// Ensures src/theme/client-bundle.json exists before tsc/vitest tries to import it.
// On first build (or after a clean), the actual bundle is written by esbuild.config.mjs;
// this only seeds an empty stub so module resolution works.
import { existsSync, writeFileSync } from "node:fs";

const PATH = "src/theme/client-bundle.json";

if (!existsSync(PATH)) {
	writeFileSync(PATH, "{}");
}
