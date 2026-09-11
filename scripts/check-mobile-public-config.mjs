import { fileURLToPath } from "node:url";
import { loadEnv } from "../mobile/node_modules/vite/dist/node/index.js";
import { resolveMobilePublicConfig } from "./mobile-public-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  resolveMobilePublicConfig(loadEnv("production", root, ""));
  console.log("Mobil genel yapılandırma doğrulandı; anahtar değerleri gösterilmedi.");
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("Mobil yapılandırma:")
    ? error.message : "Mobil yapılandırma yüklenemedi; ortam dosyalarını kontrol edin.");
  process.exitCode = 1;
}
