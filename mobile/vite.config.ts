import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveMobilePublicConfig } from "../scripts/mobile-public-config.mjs";

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(mobileDir, "..");
const releaseManifest = JSON.parse(
  readFileSync(path.join(rootDir, "release-manifest.json"), "utf8"),
) as { appVersion: string; buildNumber: number; nativeBuildNumber?: number };
const commitId = (() => { try { return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd:rootDir, encoding:"utf8" }).trim(); } catch { return "unknown"; } })();
const artifactIdentity = { ...releaseManifest, sourceCommit:commitId, builtAt:new Date().toISOString(), updateId:"unified-20260908" };

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, rootDir, "");
  const publicConfig = resolveMobilePublicConfig(env, { production: command === "build" });

  return {
    base: "./",
    envDir: rootDir,
    // VITE_ names are not automatically public. __L2T_CONFIG__ below is the
    // sole allowlist; Vite's built-in MODE/DEV/PROD values remain available.
    envPrefix: [],
    plugins: [
      react(),
      {
        name: "letsgo2travel-release-manifest",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "release.json",
            source: `${JSON.stringify(artifactIdentity)}\n`,
          });
        },
      },
    ],
    define: {
      __L2T_CONFIG__: JSON.stringify({
        ...publicConfig,
        appVersion: releaseManifest.appVersion,
        buildNumber: String(releaseManifest.nativeBuildNumber || releaseManifest.buildNumber),
        sourceCommit: commitId,
        updateId: artifactIdentity.updateId,
      }),
    },
    build: {
      target: "es2022",
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      cssCodeSplit: true,
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      port: 5173,
      proxy: {
        "/api": {
          target: publicConfig.apiBaseUrl,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
