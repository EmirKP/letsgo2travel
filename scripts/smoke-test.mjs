import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const port = Number(process.env.SMOKE_PORT || 3199);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
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
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
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

  const flightResponse = await fetch(`${baseUrl}/api/travelpayouts-search?origin=IST&destination=LHR&departureDate=2026-09-20`);
  const flight = await flightResponse.json();
  assert(flightResponse.ok, "Uçuş arama API'si başarısız.");
  assert(flight.mode === "letsgo2travel-meta-search", "Eski uçuş ucu LetsGo2Travel meta-aramasına taşınmadı.");
  assert(String(flight.url).startsWith("/ucak-bileti-ara?"), "Uyumluluk ucu site içi arama sayfasına gitmiyor.");
  assert(!/google|aviasales|skyscanner|kayak|momondo/i.test(JSON.stringify(flight)), "Yasaklı meta-arama sağlayıcısı yanıta sızdı.");

  const legacyTarget = encodeURIComponent("https://www.aviasales.com/search?origin_iata=IST&destination_iata=LHR&depart_date=2026-09-20");
  const legacyResponse = await fetch(`${baseUrl}/go/aviasales?url=${legacyTarget}`, { redirect: "manual" });
  assert([301, 302, 307, 308].includes(legacyResponse.status), "Eski uçuş bağlantısı yönlendirilmedi.");
  assert(String(legacyResponse.headers.get("location")).startsWith("https://www.letsgo2travel.com.tr/ucak-bileti-ara"), "Eski uçuş bağlantısı site içi meta-aramaya çevrilmedi.");

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

  console.log("Smoke test başarılı: site içi uçuş meta-arama geçişi, haritalar, admin koruması, eski doğrulama ve hesap silme yolu doğrulandı.");
}

try {
  await run();
} finally {
  server.kill("SIGTERM");
}
