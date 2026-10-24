import { createHash } from "node:crypto";

/** Vite may emit several assets with the same city prefix. Check each source's
 * exact bytes instead of assuming a filename count identifies the route art. */
export async function missingPackagedArtwork(sourceFiles, assetFiles, readAsset) {
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  const packaged = new Set();
  for (const file of assetFiles) {
    if (!file.endsWith(".webp")) continue;
    const bytes = await readAsset(file);
    if (bytes) packaged.add(digest(bytes));
  }
  const missing = [];
  for (const file of sourceFiles) {
    const bytes = await readAsset(file);
    if (!bytes || !packaged.has(digest(bytes))) missing.push(file);
  }
  return missing;
}
