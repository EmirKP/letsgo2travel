import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "mobile", "dist");
const targetDir = path.join(rootDir, "mobile-dist");
const sourceIndex = path.join(sourceDir, "index.html");

await access(sourceIndex);
const html = await readFile(sourceIndex, "utf8");

if (/\b(?:src|href)=["']\/assets\//.test(html)) {
  throw new Error(
    "Mobil build kök-relative /assets yolları üretti. mobile/vite.config.ts içindeki base: './' ayarını kontrol edin.",
  );
}

if (!html.includes("<div id=\"root\"></div>")) {
  throw new Error("Mobil index.html içinde #root elementi bulunamadı.");
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
const buildHash = createHash("sha256").update(html).digest("hex");
await writeFile(path.join(targetDir, ".mobile-build-ok"), `sha256:${buildHash}\n`, "utf8");

console.log(`Mobil üretim dosyaları kopyalandı: ${targetDir}`);
