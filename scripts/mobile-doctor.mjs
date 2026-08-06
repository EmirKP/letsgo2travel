import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const warnings = [];
const ok = [];
const platformOption = process.argv.find((value) => value.startsWith("--platform="))?.split("=")[1];
const platform = platformOption === "ios" || platformOption === "android" ? platformOption : "all";
const checkIos = platform === "all" || platform === "ios";
const checkAndroid = platform === "all" || platform === "android";

async function read(relative, { required = true, label = relative } = {}) {
  try {
    return await readFile(path.join(root, relative));
  } catch {
    if (required) errors.push(`Eksik dosya: ${label} (${relative})`);
    return null;
  }
}

async function text(relative, options) {
  const data = await read(relative, options);
  return data?.toString("utf8") || "";
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

function expect(source, pattern, success, failure) {
  if (pattern.test(source)) ok.push(success);
  else errors.push(failure);
}

function expectAbsent(source, pattern, success, failure) {
  if (!pattern.test(source)) ok.push(success);
  else errors.push(failure);
}

function pngDimensions(buffer) {
  if (!buffer || buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function hash(buffer) {
  return buffer ? createHash("sha256").update(buffer).digest("hex") : "";
}

async function checkReferencedAssets(index) {
  const refs = [...index.matchAll(/(?:src|href)=["']\.\/([^"'#?]+)["']/g)].map((match) => match[1]);
  for (const ref of new Set(refs)) await exists(path.posix.join("mobile-dist", ref), `mobil varlık: ${ref}`);
}

const mobileIndexBuffer = await read("mobile-dist/index.html", { label: "mobil web paketi" });
const mobileIndex = mobileIndexBuffer?.toString("utf8") || "";
await exists("mobile-dist/error.html", "mobil hata sayfası");
await exists("mobile-dist/.mobile-build-ok", "mobil build doğrulama işareti");

if (mobileIndex) {
  expectAbsent(mobileIndex, /(?:src|href)=["']\/assets\//, "Capacitor uyumlu göreli varlık yolları", "Mobil paket kök-relative /assets yolu içeriyor.");
  expect(mobileIndex, /id=["']root["']/, "mobil #root elementi", "Mobil index.html içinde #root yok.");
  await checkReferencedAssets(mobileIndex);
}

const cap = await text("capacitor.config.ts");
expect(cap, /appId:\s*["']tr\.com\.letsgo2travel\.app["']/, "Capacitor bundle kimliği", "Capacitor appId beklenen değerle eşleşmiyor.");
expect(cap, /webDir:\s*["']mobile-dist["']/, "Capacitor yerel web paketi", "Capacitor webDir mobile-dist değil.");
expect(cap, /CapacitorHttp/, "yerel HTTP köprüsü", "CapacitorHttp etkin değil; canlı API çağrıları CORS nedeniyle bozulabilir.");
expectAbsent(cap, /server\s*:\s*\{[\s\S]*?\burl\s*:/, "uzak WebView adresi kullanılmıyor", "Capacitor ayarı uzak server.url içeriyor; yayın paketi yerel istemciyi kullanmalı.");

const mobilePackage = await text("mobile/package.json");
expect(mobilePackage, /"version"\s*:\s*"1\.3\.0"/, "mobil uygulama sürümü 1.3.0", "Mobil uygulama sürümü 1.3.0 değil.");
const rootPackage = await text("package.json");
expectAbsent(rootPackage, /@capacitor\/push-notifications/, "yapılandırılmamış push eklentisi yok", "Yapılandırılmamış push eklentisi pakette kalmış.");

const env = await text(".env.local", { required: false });
if (env) {
  if (!/^NEXT_PUBLIC_SUPABASE_URL=.+/m.test(env) && !/^VITE_SUPABASE_URL=.+/m.test(env)) warnings.push("Supabase genel URL değeri yok; mobil hesap girişi kapalı olur.");
  if (!/^NEXT_PUBLIC_SUPABASE_ANON_KEY=.+/m.test(env) && !/^VITE_SUPABASE_ANON_KEY=.+/m.test(env)) warnings.push("Supabase anon anahtarı yok; mobil hesap girişi kapalı olur.");
} else {
  warnings.push(".env.local bulunamadı; hesap ve backend özellikleri için dosyayı geri koyup yeniden derle.");
}

if (checkIos) {
  const plist = await text("ios/App/App/Info.plist", { label: "iOS Info.plist" });
  const privacy = await text("ios/App/App/PrivacyInfo.xcprivacy", { label: "iOS gizlilik manifesti" });
  const project = await text("ios/App/App.xcodeproj/project.pbxproj", { label: "Xcode proje ayarı" });
  const appDelegate = await text("ios/App/App/AppDelegate.swift", { label: "iOS AppDelegate" });
  const swiftPackage = await text("ios/App/CapApp-SPM/Package.swift", { label: "Capacitor Swift paketi" });
  const iosIndexBuffer = await read("ios/App/App/public/index.html", { label: "iOS içine kopyalanmış mobil paket" });
  const iosConfigText = await text("ios/App/App/capacitor.config.json", { label: "iOS Capacitor ayarı" });

  expect(plist, /<string>tr\.com\.letsgo2travel\.app<\/string>/, "iOS OAuth URL şeması", "iOS OAuth özel URL şeması eksik.");
  expect(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/, "iOS şifreleme ihracat beyanı", "ITSAppUsesNonExemptEncryption beyanı eksik veya yanlış.");
  expectAbsent(plist, /<string>armv7<\/string>/, "modern iOS cihaz uyumluluğu", "Info.plist eski armv7 cihaz şartı içeriyor.");
  expect(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/, "izleme yapılmadığına ilişkin gizlilik beyanı", "Gizlilik manifestinde NSPrivacyTracking=false yok.");
  expect(privacy, /NSPrivacyCollectedDataTypeEmailAddress/, "e-posta veri beyanı", "Gizlilik manifestinde e-posta veri beyanı eksik.");
  expect(privacy, /NSPrivacyCollectedDataTypeUserID/, "kullanıcı kimliği veri beyanı", "Gizlilik manifestinde kullanıcı kimliği beyanı eksik.");
  expect(project, /PRODUCT_BUNDLE_IDENTIFIER = tr\.com\.letsgo2travel\.app;/, "Xcode bundle kimliği", "Xcode bundle kimliği beklenen değerle eşleşmiyor.");
  expect(project, /MARKETING_VERSION = 1\.3\.0;/, "iOS pazarlama sürümü 1.3.0", "Xcode MARKETING_VERSION 1.3.0 değil.");
  expect(project, /CURRENT_PROJECT_VERSION = 3;/, "iOS build numarası 3", "Xcode CURRENT_PROJECT_VERSION 3 değil.");
  expect(project, /PrivacyInfo\.xcprivacy in Resources/, "gizlilik manifesti Xcode hedefine bağlı", "PrivacyInfo.xcprivacy Xcode Resources aşamasına bağlı değil.");
  expect(appDelegate, /ApplicationDelegateProxy\.shared\.application\(app, open: url/, "özel URL yönlendirmesi", "AppDelegate özel URL dönüşünü Capacitor'a aktarmıyor.");
  expect(appDelegate, /continue userActivity/, "Universal Link yönlendirme köprüsü", "AppDelegate Universal Link yönlendirmesini desteklemiyor.");
  for (const pluginName of ["CapacitorApp", "CapacitorBrowser", "CapacitorNetwork", "CapacitorSplashScreen", "CapacitorStatusBar"]) {
    expect(swiftPackage, new RegExp(`product\\(name: ["']${pluginName}["']`), `iOS eklentisi: ${pluginName}`, `iOS Swift paketinde ${pluginName} eksik.`);
  }
  expect(cap, /contentInset:\s*["']never["']/, "iOS güvenli alanı CSS tarafından yönetiliyor", "iOS contentInset 'never' değil; güvenli alan iki kez uygulanabilir.");
  expect(cap, /preferredContentMode:\s*["']mobile["']/, "iOS mobil içerik modu", "iOS preferredContentMode mobile değil.");
  expect(cap, /webContentsDebuggingEnabled:\s*false/, "iOS yayın WebView debug kapalı", "iOS WebView debug yayın ayarında kapalı değil.");

  try {
    const iosConfig = JSON.parse(iosConfigText);
    if (iosConfig.appId === "tr.com.letsgo2travel.app") ok.push("kopyalanmış iOS bundle kimliği");
    else errors.push("Kopyalanmış iOS capacitor.config.json appId değeri yanlış.");
    if (!iosConfig.server?.url) ok.push("kopyalanmış iOS ayarında uzak server.url yok");
    else errors.push("Kopyalanmış iOS ayarı uzak server.url içeriyor.");
  } catch {
    errors.push("ios/App/App/capacitor.config.json geçerli JSON değil.");
  }

  if (mobileIndexBuffer && iosIndexBuffer) {
    if (hash(mobileIndexBuffer) === hash(iosIndexBuffer)) ok.push("iOS web paketi güncel");
    else errors.push("iOS public/index.html güncel mobil build ile eşleşmiyor; npx cap sync ios çalıştır.");
  }

  const appIcon = pngDimensions(await read("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", { label: "iOS 1024px uygulama ikonu" }));
  if (appIcon?.width === 1024 && appIcon.height === 1024) ok.push("iOS uygulama ikonu 1024×1024");
  else errors.push("iOS uygulama ikonu 1024×1024 PNG değil.");
  const splash = pngDimensions(await read("ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", { label: "iOS açılış görseli" }));
  if (splash?.width === 2732 && splash.height === 2732) ok.push("iOS açılış görseli 2732×2732");
  else errors.push("iOS açılış görseli 2732×2732 PNG değil.");

  if (/CapacitorPushNotifications/.test(swiftPackage) && !/\.entitlements/.test(project)) {
    warnings.push("Push Notifications paketi hazır fakat APNs entitlement/capability Apple hesabıyla henüz bağlanmamış.");
  }
}

if (checkAndroid) {
  const manifest = await text("android/app/src/main/AndroidManifest.xml", { label: "Android manifest" });
  await exists("android/app/src/main/assets/capacitor.config.json", "Android Capacitor ayarı");
  await exists("android/app/src/main/res/xml/backup_rules.xml", "Android yedekleme kuralları");
  await exists("android/app/src/main/res/xml/data_extraction_rules.xml", "Android veri aktarım kuralları");
  expect(manifest, /android\.permission\.INTERNET/, "Android internet izni", "Android INTERNET izni eksik.");
  expect(manifest, /android:scheme=["']tr\.com\.letsgo2travel\.app["']/, "Android OAuth URL şeması", "Android OAuth özel URL şeması eksik.");
  expect(manifest, /android:allowBackup=["']false["']/, "Android uygulama yedeklemesi kapalı", "Android uygulama yedeklemesi kapalı değil.");
  expect(manifest, /android:dataExtractionRules=["']@xml\/data_extraction_rules["']/, "Android veri aktarım kuralları bağlı", "Android veri aktarım kuralları bağlı değil.");

  const androidBuild = await text("android/app/build.gradle");
  expect(androidBuild, /versionCode\s+3\b/, "Android versionCode 3", "Android versionCode 3 değil.");
  expect(androidBuild, /versionName\s+["']1\.3\.0["']/, "Android versionName 1.3.0", "Android versionName 1.3.0 değil.");
  for (const key of ["L2T_UPLOAD_STORE_FILE", "L2T_UPLOAD_STORE_PASSWORD", "L2T_UPLOAD_KEY_ALIAS", "L2T_UPLOAD_KEY_PASSWORD"]) {
    expect(androidBuild, new RegExp(key), `Android release imza ayarı: ${key}`, `Android release imza ayarı eksik: ${key}`);
  }

  const androidVariables = await text("android/variables.gradle");
  expect(androidVariables, /compileSdkVersion\s*=\s*36/, "Android compileSdk API 36", "Android compileSdk API 36 değil.");
  expect(androidVariables, /targetSdkVersion\s*=\s*36/, "Android targetSdk API 36", "Android targetSdk API 36 değil.");

  const generatedPlugins = await text("android/app/src/main/assets/capacitor.plugins.json", { required: false });
  expectAbsent(generatedPlugins, /@capacitor\/push-notifications/, "Android yerel projede eski push eklentisi yok", "Android yerel projede eski push eklentisi kalmış; cap sync çalıştırılmalı.");
}

console.log(`\nLetsGo2Travel Mobil Kontrolü (${platform})`);
console.log("────────────────────────────────");
for (const item of ok) console.log(`✓ ${item}`);
for (const item of warnings) console.log(`⚠ ${item}`);
for (const item of errors) console.log(`✗ ${item}`);
console.log("");

if (errors.length) {
  console.error(`${errors.length} kritik sorun bulundu.`);
  process.exit(1);
}
console.log(warnings.length ? `Kontrol tamamlandı: ${warnings.length} uyarı var, kritik hata yok.` : "Kontrol tamamlandı: kritik hata veya uyarı yok.");
