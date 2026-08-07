import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, "..");
const mobileDistDir = path.join(rootDir, "mobile", "dist");

// Vite/Rolldown may leave older hash-named bundles behind in an existing
// output directory. Remove only the generated mobile build directory before
// compiling so stale code can never reach the native applications.
await rm(mobileDistDir, { recursive: true, force: true });
