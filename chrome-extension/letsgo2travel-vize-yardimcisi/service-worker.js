const API_BASE_URL = "https://www.letsgo2travel.com.tr";
const ALARM_NAME = "letsgo2travel-idata-scan";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

async function getState() {
  return chrome.storage.local.get([
    "extensionToken",
    "tokenExpiresAt",
    "trackId",
    "countryName",
    "applicationCity",
    "officialUrl",
    "monitoringEnabled",
    "lastReport",
    "lastFingerprint",
    "lastFingerprintAt",
  ]);
}

async function claimPairing(code) {
  const response = await fetch(`${API_BASE_URL}/api/visa-appointments/extension/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      browserName: "Google Chrome",
      extensionVersion: EXTENSION_VERSION,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Bağlantı kurulamadı.");
  await chrome.storage.local.set({
    extensionToken: payload.data.token,
    tokenExpiresAt: payload.data.tokenExpiresAt,
    trackId: payload.data.trackId,
    countryName: payload.data.countryName,
    applicationCity: payload.data.applicationCity,
    officialUrl: payload.data.officialUrl,
    monitoringEnabled: false,
    lastReport: null,
    lastFingerprint: null,
    lastFingerprintAt: null,
  });
  return payload.data;
}

async function reportScan(scan, { automatic = false } = {}) {
  const state = await getState();
  if (!state.extensionToken) throw new Error("Önce LetsGo2Travel hesabına bağlan.");

  const now = Date.now();
  const lastAt = state.lastFingerprintAt ? Date.parse(state.lastFingerprintAt) : 0;
  if (automatic && scan.fingerprint === state.lastFingerprint && now - lastAt < 15 * 60 * 1000) {
    return { skipped: true, reason: "Aynı sonuç yakın zamanda gönderildi." };
  }

  const response = await fetch(`${API_BASE_URL}/api/visa-appointments/extension/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.extensionToken}`,
    },
    body: JSON.stringify({
      outcome: scan.outcome,
      message: scan.message,
      availableDates: scan.availableDates,
      pageUrl: scan.pageUrl,
      pageTitle: scan.pageTitle,
      fingerprint: scan.fingerprint,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Sonuç gönderilemedi.");

  const report = {
    outcome: scan.outcome,
    message: scan.message,
    availableDates: scan.availableDates,
    sentAt: new Date().toISOString(),
    automatic,
  };
  await chrome.storage.local.set({
    lastReport: report,
    lastFingerprint: scan.fingerprint,
    lastFingerprintAt: new Date().toISOString(),
  });

  if (scan.outcome === "slot_found") {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#F6C445" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }

  return payload.data;
}

async function scanTab(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "L2T_SCAN_PAGE" });
  if (!response?.ok) throw new Error(response?.error || "iDATA sayfası okunamadı.");
  return response.data;
}

async function runAutomaticScan() {
  const state = await getState();
  if (!state.extensionToken || !state.monitoringEnabled) return;
  if (state.tokenExpiresAt && Date.parse(state.tokenExpiresAt) <= Date.now()) return;

  const tabs = await chrome.tabs.query({ url: "https://de-tr-appointment.idata.com.tr/*" });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const scan = await scanTab(tab.id);
      await reportScan(scan, { automatic: true });
    } catch (error) {
      console.warn("LetsGo2Travel automatic scan", error);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void runAutomaticScan();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "CLAIM_PAIRING") {
      return { ok: true, data: await claimPairing(message.code) };
    }
    if (message?.type === "GET_STATE") {
      return { ok: true, data: await getState() };
    }
    if (message?.type === "REPORT_SCAN") {
      return { ok: true, data: await reportScan(message.scan, { automatic: false }) };
    }
    if (message?.type === "SET_MONITORING") {
      await chrome.storage.local.set({ monitoringEnabled: Boolean(message.enabled) });
      return { ok: true };
    }
    if (message?.type === "DISCONNECT") {
      await chrome.storage.local.clear();
      await chrome.action.setBadgeText({ text: "" });
      return { ok: true };
    }
    throw new Error("Bilinmeyen işlem.");
  })().then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "İşlem başarısız." });
  });
  return true;
});
