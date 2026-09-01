import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const port = Number(process.env.SMOKE_PORT || 3199);
const baseUrl = `http://127.0.0.1:${port}`;
const smokeCronSecret = "l2t-smoke-cron-secret";
const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CRON_SECRET: smokeCronSecret },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-6000); });
server.stderr.on("data", (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-6000); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Sunucu erken kapandı.\n${serverLog}`);
    try {
      // Hazirlik kontrolu statik bir yanittan yapilir; /api/health placeholder
      // Supabase ortaminda yavas kalabilir.
      const response = await fetch(`${baseUrl}/manifest.webmanifest`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      // Sunucu henüz dinlemiyor.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Sunucu zamanında hazır olmadı.\n${serverLog}`);
}

async function run() {
  await waitUntilReady();

  // Uçuş arama/karşılaştırma sistemi kalıcı olarak kaldırıldı; eski uçlar 410.
  for (const path of [
    "/ucak-bileti-ara",
    "/kampanyalar",
    "/canli-ucus",
    "/flights",
    "/ucak-bileti/ornek-rota",
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    assert(response.status === 410, `${path} kaldırılmış uçuş sayfası 410 dönmedi (${response.status}).`);
  }

  for (const [path, method] of [
    ["/api/flights/searches", "POST"],
    ["/api/internal/flights/heartbeat", "POST"],
    ["/api/travelpayouts-search?origin=IST&destination=LHR", "GET"],
    ["/api/canli-ucuslar", "GET"],
    ["/api/fiyat-alarmi", "POST"],
    ["/api/firsatlar", "GET"],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { method, redirect: "manual" });
    assert(response.status === 410, `${path} kaldırılmış uçuş API'si 410 dönmedi (${response.status}).`);
  }

  // Bağımsız fiyat alarmı KORUNAN üründür: uçlar 410 DÖNMEZ.
  const alarmPage = await fetch(`${baseUrl}/fiyat-kontrolu`);
  assert(alarmPage.status === 200, `/fiyat-kontrolu 200 dönmedi (${alarmPage.status}).`);

  const alertsList = await fetch(`${baseUrl}/api/flight-alerts`);
  assert(alertsList.status !== 410, "/api/flight-alerts hâlâ 410 dönüyor.");
  assert(alertsList.status === 401, `/api/flight-alerts oturumsuz istekte 401 dönmedi (${alertsList.status}).`);

  const alertsBadPost = await fetch(`${baseUrl}/api/flight-alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(alertsBadPost.status !== 410 && alertsBadPost.status < 500 || alertsBadPost.status === 503, `/api/flight-alerts geçersiz istekte kontrollü hata dönmedi (${alertsBadPost.status}).`);

  const cronNoAuth = await fetch(`${baseUrl}/api/cron/check-price-alerts`);
  assert(cronNoAuth.status === 401 || cronNoAuth.status === 403, `Cron ucu yetkisiz istekte 401/403 dönmedi (${cronNoAuth.status}).`);

  const cronBadBearer = await fetch(`${baseUrl}/api/cron/check-price-alerts`, {
    headers: { Authorization: "Bearer wrong-secret" },
  });
  assert(cronBadBearer.status === 401 || cronBadBearer.status === 403, `Cron ucu yanlış Bearer ile 401/403 dönmedi (${cronBadBearer.status}).`);

  // GÜVENLİK: query parametresiyle gelen DOĞRU secret bile yetki VERMEZ.
  const cronQuerySecret = await fetch(`${baseUrl}/api/cron/check-price-alerts?secret=${encodeURIComponent(smokeCronSecret)}`);
  assert(cronQuerySecret.status === 401 || cronQuerySecret.status === 403, `Cron ucu query secret ile yetki verdi (${cronQuerySecret.status}) — Bearer-only olmalı.`);

  // Doğru Bearer auth katmanını GEÇMELİ (placeholder DB ortamında iş mantığı
  // 500 dönebilir; 401/403 OLMAMASI yeterlidir).
  const cronGoodBearer = await fetch(`${baseUrl}/api/cron/check-price-alerts?limit=1`, {
    headers: { Authorization: `Bearer ${smokeCronSecret}` },
  });
  assert(cronGoodBearer.status !== 401 && cronGoodBearer.status !== 403, `Cron ucu doğru Bearer ile yetkilendirmedi (${cronGoodBearer.status}).`);

  const legacyGo = await fetch(`${baseUrl}/go/aviasales?url=${encodeURIComponent("https://www.aviasales.com/search")}`, { redirect: "manual" });
  assert([301, 302, 307, 308].includes(legacyGo.status), "Bilinmeyen /go sağlayıcısı güvenli şekilde yönlendirilmedi.");
  const legacyGoTarget = String(legacyGo.headers.get("location") || "");
  assert(!legacyGoTarget.includes("aviasales") && !legacyGoTarget.includes("ucak-bileti"), "Eski aviasales bağlantısı uçuş hedefine yönlendirildi.");

  const fakeAdmin = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: "admin_session=true" },
    redirect: "manual",
  });
  assert([301, 302, 307, 308].includes(fakeAdmin.status), "Sahte admin çerezi reddedilmedi.");
  assert(String(fakeAdmin.headers.get("location")).includes("/admin/login"), "Sahte admin çerezi girişe yönlendirilmedi.");

  for (const path of ["/api/admin/kvkk-requests", "/api/admin/visa-center", "/api/admin/visa-appointments"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert(response.status === 401, `${path} oturumsuz isteği 401 ile reddetmedi.`);
  }

  const oldVerification = await fetch(`${baseUrl}/api/verify-travel`, { method: "POST" });
  assert(oldVerification.status === 410, "Eski belge doğrulama ucu kapalı değil.");

  const deletionPage = await fetch(`${baseUrl}/veri-silme-ve-hak-talebi?request=account_deletion&source=google-play`);
  assert(deletionPage.ok, "Google Play hesap silme sayfası açılamadı.");

  for (const path of ["/pasaport-gucu", "/harita"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert(response.ok, `${path} harita sayfası açılamadı.`);
  }

  console.log("Smoke test başarılı: uçuş arama uçları 410, fiyat alarmı uçları canlı, cron auth, admin koruması ve hesap silme yolu doğrulandı.");
}

try {
  await run();
} finally {
  server.kill("SIGTERM");
}
