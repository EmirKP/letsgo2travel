import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const warnings = [];
const ok = [];

async function text(relative) {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch {
    errors.push(`Eksik dosya: ${relative}`);
    return "";
  }
}

async function optionalText(relative) {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch {
    return "";
  }
}

async function exists(relative, label = relative) {
  try {
    await access(path.join(root, relative));
    ok.push(label);
    return true;
  } catch {
    errors.push(`Eksik: ${label} (${relative})`);
    return false;
  }
}

await exists("mobile-dist/index.html", "mobil web paketi");
await exists("mobile-dist/error.html", "mobil hata sayfası");
await exists("android/app/src/main/AndroidManifest.xml", "Android manifest");
await exists("android/app/src/main/assets/capacitor.config.json", "Android Capacitor ayarı");
await exists("ios/App/App/Info.plist", "iOS Info.plist");

const index = await text("mobile-dist/index.html");
if (index && /(?:src|href)=["']\/assets\//.test(index)) errors.push("Mobil paket kök-relative /assets yolu içeriyor.");
else if (index) ok.push("Capacitor uyumlu göreli varlık yolları");
if (index && !index.includes('id="root"')) errors.push("Mobil index.html içinde #root yok.");

const cap = await text("capacitor.config.ts");
if (cap && !cap.includes('appId: "tr.com.letsgo2travel.app"')) errors.push("Capacitor appId beklenen değerle eşleşmiyor.");
if (cap && !cap.includes('webDir: "mobile-dist"')) errors.push("Capacitor webDir mobile-dist değil.");
if (cap && !cap.includes("CapacitorHttp")) errors.push("CapacitorHttp etkin değil; canlı API çağrıları CORS nedeniyle bozulabilir.");

const manifest = await text("android/app/src/main/AndroidManifest.xml");
if (manifest && !manifest.includes('android.permission.INTERNET')) errors.push("Android INTERNET izni eksik.");
if (manifest && !manifest.includes('android:scheme="tr.com.letsgo2travel.app"')) errors.push("Android OAuth özel URL şeması eksik.");

const plist = await text("ios/App/App/Info.plist");
if (plist && !plist.includes("tr.com.letsgo2travel.app")) errors.push("iOS OAuth özel URL şeması eksik.");

const env = await optionalText(".env.local");
if (env) {
  if (!/^NEXT_PUBLIC_SUPABASE_URL=.+/m.test(env) && !/^VITE_SUPABASE_URL=.+/m.test(env)) warnings.push("Supabase genel URL değeri yok; mobil hesap girişi kapalı olur.");
  if (!/^NEXT_PUBLIC_SUPABASE_ANON_KEY=.+/m.test(env) && !/^VITE_SUPABASE_ANON_KEY=.+/m.test(env)) warnings.push("Supabase anon anahtarı yok; mobil hesap girişi kapalı olur.");
} else {
  warnings.push(".env.local bulunamadı; kendi dosyanı geri koymadan hesap ve backend özelliklerini derleme.");
}

console.log("\nLetsGo2Travel Mobil Kontrolü");
console.log("──────────────────────────");
for (const item of ok) console.log(`✓ ${item}`);
for (const item of warnings) console.log(`⚠ ${item}`);
for (const item of errors) console.log(`✗ ${item}`);
console.log("");

if (errors.length) {
  console.error(`${errors.length} kritik sorun bulundu.`);
  process.exit(1);
}
console.log(warnings.length ? `Kontrol tamamlandı: ${warnings.length} uyarı var, kritik hata yok.` : "Kontrol tamamlandı: kritik hata veya uyarı yok.");
