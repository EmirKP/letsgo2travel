import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "mobile", "dist");
const targetDir = path.join(rootDir, "mobile-dist");
const sourceIndex = path.join(sourceDir, "index.html");
const generatedNativeWebDirs = [
  path.join(rootDir, "ios", "App", "App", "public"),
  path.join(rootDir, "android", "app", "src", "main", "assets", "public"),
];

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

const referencedEntryAssets = new Set(
  [...html.matchAll(/(?:src|href)=["']\.\/([^"'#?]+)["']/g)].map((match) => match[1]),
);
const sourceAssetNames = await readdir(path.join(sourceDir, "assets"));
const staleEntryAssets = sourceAssetNames.filter(
  (name) => /^index-.*\.(?:js|css)$/.test(name) && !referencedEntryAssets.has(`assets/${name}`),
);
if (staleEntryAssets.length) {
  throw new Error(
    `Mobil dist eski hash'li giriş varlıkları içeriyor: ${staleEntryAssets.join(", ")}`,
  );
}

// Capacitor kopyalama işlemi dosyaları eklerken eski hash'li paketleri her
// durumda temizlemeyebilir. Yalnızca üretilmiş web klasörlerini sil; native
// kaynaklara, imzalama ayarlarına veya platform projelerine dokunma.
for (const generatedDir of generatedNativeWebDirs) {
  await rm(generatedDir, { recursive: true, force: true });
}
await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
const buildHash = createHash("sha256").update(html).digest("hex");
await writeFile(path.join(targetDir, ".mobile-build-ok"), `sha256:${buildHash}\n`, "utf8");

console.log(`Mobil üretim dosyaları kopyalandı: ${targetDir}`);
