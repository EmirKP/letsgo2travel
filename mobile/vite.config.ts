import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveMobilePublicConfig } from "../scripts/mobile-public-config.mjs";
import { resolveMobileSourceIdentity } from "../scripts/mobile-source-identity.mjs";
import { mobileTextScaling } from "../scripts/mobile-text-scaling.mjs";

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(mobileDir, "..");
const releaseManifest = JSON.parse(
  readFileSync(path.join(rootDir, "release-manifest.json"), "utf8"),
) as { appVersion: string; buildNumber: number; nativeBuildNumber?: number };
const commitId = resolveMobileSourceIdentity(rootDir);
const artifactIdentity = { ...releaseManifest, sourceCommit:commitId, builtAt:new Date().toISOString(), updateId:"unified-20260908" };

function mapsDevApiOrigin(value: string | undefined, settingName = "L2T_MAPS_DEV_API_URL") {
  const raw = value?.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && url.origin === raw) return url.origin;
  } catch { /* Report the setting name only; never echo environment values. */ }
  throw new Error(`${settingName} must be a canonical HTTP loopback origin.`);
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, rootDir, "");
  const publicConfig = resolveMobilePublicConfig(env, { production: command === "build" });
  const mapsDevApiUrl = command === "serve" ? mapsDevApiOrigin(env.L2T_MAPS_DEV_API_URL) : "";
  const eventsDevApiUrl = command === "serve" ? mapsDevApiOrigin(env.L2T_EVENTS_DEV_API_URL, "L2T_EVENTS_DEV_API_URL") : "";
  const eventCommunityDevApiUrl = command === "serve" ? mapsDevApiOrigin(env.L2T_EVENT_COMMUNITY_DEV_API_URL || env.L2T_MAPS_DEV_API_URL, env.L2T_EVENT_COMMUNITY_DEV_API_URL ? "L2T_EVENT_COMMUNITY_DEV_API_URL" : "L2T_MAPS_DEV_API_URL") : "";
  // Only the public-data assistant endpoints can use a separate test host.
  // Browser development keeps them same-origin through this dedicated proxy.
  const travelProxyPrefix = "/__travel-assistant";

  return {
    base: "./",
    envDir: rootDir,
    // VITE_ names are not automatically public. __L2T_CONFIG__ below is the
    // sole allowlist; Vite's built-in MODE/DEV/PROD values remain available.
    envPrefix: [],
    css: { postcss: { plugins: [mobileTextScaling()] } },
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
        apiBaseUrl: command === "serve" ? "" : publicConfig.apiBaseUrl,
        travelAssistantApiBaseUrl: command === "serve"
          ? (publicConfig.travelAssistantApiBaseUrl ? travelProxyPrefix : "")
          : publicConfig.travelAssistantApiBaseUrl,
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
        // Exact development-only routes use the local development server.
        // Existing assistant tools and account APIs retain their configured hosts.
        ...(eventCommunityDevApiUrl ? {
          "^/api/event-community(?:\\?|$)": {
            target: eventCommunityDevApiUrl,
            changeOrigin: true,
          },
        } : {}),
        // Local map testing must not replace the configured live event source.
        // Opt into a local Events handler separately when testing that source.
        ...(eventsDevApiUrl ? {
          "^/api/events(?:\\?|$)": {
            target: eventsDevApiUrl,
            changeOrigin: true,
          },
        } : {}),
        ...(mapsDevApiUrl ? {
          "^/api/maps/(?:resource|places|directions|search)(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
          "^/api/country-community/social(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
          "^/api/maps/token(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
          "^/api/travel-assistant/journey-route(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
          "^/api/travel-assistant/discover(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
          "^/api/travel-assistant/journey-plan(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
          "^/api/travel-assistant/journey-photos(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
          "^/api/travel-assistant/journey-search(?:\\?|$)": {
            target: mapsDevApiUrl,
            changeOrigin: true,
          },
        } : {}),
        ...(publicConfig.travelAssistantApiBaseUrl ? {
          [travelProxyPrefix]: {
            target: publicConfig.travelAssistantApiBaseUrl,
            changeOrigin: true,
            secure: true,
            rewrite: (requestPath: string) => requestPath.replace(/^\/__travel-assistant/, ""),
          },
        } : {}),
        "/api": {
          target: publicConfig.apiBaseUrl,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
