import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

const commitPattern = /^[a-f\d]{40}$/i;
const canonicalPath = value => {
  const resolved = realpathSync(path.resolve(value));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

/**
 * Clean archives can carry an explicit provenance SHA. Never inherit the Git
 * identity of a surrounding checkout, and never disguise a real HEAD mismatch.
 * @param {string} rootDir
 * @param {Record<string, string | undefined>} env
 * @returns {string} Twelve lowercase hexadecimal characters, or "unknown".
 */
export function resolveMobileSourceIdentity(rootDir, env = process.env) {
  const supplied = ["L2T_SOURCE_COMMIT", "CM_COMMIT"].flatMap(name => {
    if (env[name] === undefined || env[name] === "") return [];
    const value = String(env[name]).trim();
    if (!commitPattern.test(value)) throw new Error(`Mobil kaynak kimliği: ${name} tam 40 karakterli Git SHA olmalı.`);
    return [value.toLowerCase()];
  });
  if (new Set(supplied).size > 1) throw new Error("Mobil kaynak kimliği: L2T_SOURCE_COMMIT ile CM_COMMIT uyuşmuyor.");

  let head = "";
  try {
    // Build hosts may set Git environment overrides. Provenance must come from
    // the actual checkout at rootDir, not a redirected index or work tree.
    const gitEnv = { ...process.env };
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE"]) delete gitEnv[name];
    const git = args => execFileSync("git", ["-C", rootDir, "rev-parse", ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
    if (canonicalPath(git(["--show-toplevel"])) === canonicalPath(rootDir)) {
      const candidate = git(["--verify", "HEAD"]);
      if (commitPattern.test(candidate)) head = candidate.toLowerCase();
    }
  } catch { /* An archive or a checkout without HEAD has no local identity. */ }
  if (head && supplied[0] && supplied[0] !== head) throw new Error("Mobil kaynak kimliği: verilen commit mevcut kaynak HEAD kaydıyla uyuşmuyor.");
  return (head || supplied[0] || "").slice(0, 12) || "unknown";
}
