import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(mobileDir, "..");
const releaseManifest = JSON.parse(
  readFileSync(path.join(rootDir, "release-manifest.json"), "utf8"),
) as { appVersion: string; buildNumber: number; nativeBuildNumber?: number };
const commitId = (() => { try { return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd:rootDir, encoding:"utf8" }).trim(); } catch { return "unknown"; } })();
const artifactIdentity = { ...releaseManifest, sourceCommit:commitId, builtAt:new Date().toISOString(), updateId:"unified-20260908" };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const apiBaseUrl = (
    env.VITE_API_BASE_URL ||
    "https://www.letsgo2travel.com.tr"
  ).replace(/\/$/, "");

  return {
    base: "./",
    envDir: rootDir,
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
        apiBaseUrl,
        supabaseUrl: env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "",
        supabaseAnonKey:
          env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        supportEmail:
          env.VITE_SUPPORT_EMAIL || env.NEXT_PUBLIC_SUPPORT_EMAIL || env.SUPPORT_EMAIL || "hello@letsgo2travel.com.tr",
        appVersion: releaseManifest.appVersion,
        buildNumber: String(releaseManifest.nativeBuildNumber || releaseManifest.buildNumber),
        sourceCommit: commitId,
        updateId: artifactIdentity.updateId,
        appleAuthEnabled: (env.VITE_APPLE_AUTH_ENABLED || "").trim().toLowerCase() !== "false",
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
          target: apiBaseUrl,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
