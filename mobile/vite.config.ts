import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(mobileDir, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const apiBaseUrl = (
    env.VITE_API_BASE_URL ||
    "https://www.letsgo2travel.com.tr"
  ).replace(/\/$/, "");

  return {
    base: "./",
    envDir: rootDir,
    plugins: [react()],
    define: {
      __L2T_CONFIG__: JSON.stringify({
        apiBaseUrl,
        supabaseUrl: env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "",
        supabaseAnonKey:
          env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        supportEmail:
          env.VITE_SUPPORT_EMAIL || env.NEXT_PUBLIC_SUPPORT_EMAIL || env.SUPPORT_EMAIL || "hello@letsgo2travel.com.tr",
        appVersion: env.VITE_APP_VERSION || "1.2.0",
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
      host: true,
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
