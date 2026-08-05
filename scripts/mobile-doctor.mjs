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
await exists("android/app/src/main/res/xml/backup_rules.xml", "Android yedekleme kuralları");
await exists("android/app/src/main/res/xml/data_extraction_rules.xml", "Android veri aktarım kuralları");
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
if (manifest && !manifest.includes('android:allowBackup="false"')) errors.push("Android uygulama yedeklemesi kapalı değil.");
if (manifest && !manifest.includes('android:dataExtractionRules="@xml/data_extraction_rules"')) errors.push("Android veri aktarım kuralları bağlı değil.");

const androidBuild = await text("android/app/build.gradle");
if (androidBuild && !androidBuild.includes("versionCode 3")) errors.push("Android versionCode 3 değil.");
if (androidBuild && !androidBuild.includes('versionName "1.3.0"')) errors.push("Android versionName 1.3.0 değil.");
for (const key of ["L2T_UPLOAD_STORE_FILE", "L2T_UPLOAD_STORE_PASSWORD", "L2T_UPLOAD_KEY_ALIAS", "L2T_UPLOAD_KEY_PASSWORD"]) {
  if (androidBuild && !androidBuild.includes(key)) errors.push(`Android release imza ayarı eksik: ${key}`);
}

const androidVariables = await text("android/variables.gradle");
if (androidVariables && !/compileSdkVersion\s*=\s*36/.test(androidVariables)) errors.push("Android compileSdk API 36 değil.");
if (androidVariables && !/targetSdkVersion\s*=\s*36/.test(androidVariables)) errors.push("Android targetSdk API 36 değil.");

const mobilePackage = await text("mobile/package.json");
if (mobilePackage && !mobilePackage.includes('"version": "1.3.0"')) errors.push("Mobil uygulama sürümü 1.3.0 değil.");
const rootPackage = await text("package.json");
if (rootPackage && rootPackage.includes("@capacitor/push-notifications")) errors.push("Yapılandırılmamış push eklentisi pakette kalmış.");
const generatedPlugins = await optionalText("android/app/src/main/assets/capacitor.plugins.json");
if (generatedPlugins.includes("@capacitor/push-notifications")) errors.push("Android yerel projede eski push eklentisi kalmış; cap sync çalıştırılmalı.");

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
