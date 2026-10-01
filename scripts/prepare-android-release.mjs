import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function validateAndroidVersion(value, minimum) {
  if (!Number.isSafeInteger(minimum) || minimum < 1 || minimum > 2100000000) throw new Error("Kaynak Android sürüm tabanı geçersiz.");
  if (!/^[1-9][0-9]*$/.test(value || "")) throw new Error("L2T_ANDROID_VERSION_CODE pozitif tam sayı olmalı.");
  const code = Number(value);
  if (!Number.isSafeInteger(code) || code > 2100000000 || code < minimum) {
    throw new Error("Android versionCode kaynak sürümünden küçük veya Play sınırının üzerinde olamaz.");
  }
  return code;
}

export function validateGoogleServices(config, expectedProject) {
  if (!expectedProject || config?.project_info?.project_id !== expectedProject) {
    throw new Error("Firebase projesi L2T_FIREBASE_PROJECT_ID ile eşleşmiyor.");
  }
  if (!/^\d+$/.test(String(config.project_info.project_number || ""))) throw new Error("Firebase proje numarası eksik.");
  const clients = Array.isArray(config.client) ? config.client.filter(client => client?.client_info?.android_client_info?.package_name === "tr.com.letsgo2travel.app") : [];
  const sdkIdentity = clients[0]?.client_info?.mobilesdk_app_id?.match(/^1:(\d+):android:[0-9a-f]{16,64}$/);
  if (clients.length !== 1 || sdkIdentity?.[1] !== String(config.project_info.project_number) || !Array.isArray(clients[0].api_key) || !clients[0].api_key.some(key => /^AIza[0-9A-Za-z_-]{35}$/.test(key?.current_key || ""))) {
    throw new Error("Firebase Android istemcisi veya paket kimliği geçersiz.");
  }
  if (config.private_key || config.type === "service_account") throw new Error("Sunucu hesabı mobil pakete eklenemez.");
  return config;
}

export async function prepareAndroidRelease(root, env) {
  const manifestPath = path.join(root, "release-manifest.json");
  const gradlePath = path.join(root, "android/app/build.gradle");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const gradle = await readFile(gradlePath, "utf8");
  if (!/^\d+\.\d+\.\d+$/.test(manifest.appVersion)) throw new Error("Yayın manifesti sürümü geçersiz.");
  if ((gradle.match(/\bversionCode\s+\d+/g) || []).length !== 1 || (gradle.match(/\bversionName\s+"[^"]+"/g) || []).length !== 1) {
    throw new Error("Android sürüm alanları tekil değil; sürüm damgalanmadı.");
  }
  const manifestMinimum = manifest.nativeBuildNumber ?? manifest.buildNumber;
  validateAndroidVersion(String(manifestMinimum), manifestMinimum);
  const gradleMinimum = Number(gradle.match(/\bversionCode\s+(\d+)/)[1]);
  const versionCode = validateAndroidVersion(env.L2T_ANDROID_VERSION_CODE, Math.max(manifestMinimum, gradleMinimum));
  let googleServices;
  try {
    const raw = env.L2T_GOOGLE_SERVICES_JSON_BASE64;
    if (!raw || raw.length > 500000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new Error();
    googleServices = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch { throw new Error("L2T_GOOGLE_SERVICES_JSON_BASE64 geçerli Firebase istemci dosyası olmalı."); }
  validateGoogleServices(googleServices, env.L2T_FIREBASE_PROJECT_ID);
  // All validations precede writes. These mutations occur only in the Android
  // release checkout; the iOS project and currently submitted binary are untouched.
  await writeFile(path.join(root, "android/app/google-services.json"), JSON.stringify(googleServices), { mode: 0o600 });
  await writeFile(gradlePath, gradle.replace(/\bversionCode\s+\d+/, `versionCode ${versionCode}`).replace(/\bversionName\s+"[^"]+"/, `versionName "${manifest.appVersion}"`));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, nativeBuildNumber: versionCode }, null, 2) + "\n");
  return versionCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const code = await prepareAndroidRelease(process.cwd(), process.env);
    console.log(`Android release yapılandırması doğrulandı; versionCode ${code}. Gizli değerler gösterilmedi.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Android release yapılandırması hazırlanamadı.");
    process.exitCode = 1;
  }
}
