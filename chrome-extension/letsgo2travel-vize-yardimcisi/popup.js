const connectView = document.getElementById("connectView");
const connectedView = document.getElementById("connectedView");
const pairingCode = document.getElementById("pairingCode");
const connectButton = document.getElementById("connectButton");
const trackTitle = document.getElementById("trackTitle");
const trackDetail = document.getElementById("trackDetail");
const openIdataButton = document.getElementById("openIdataButton");
const scanButton = document.getElementById("scanButton");
const scanResult = document.getElementById("scanResult");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const resultDates = document.getElementById("resultDates");
const sendButton = document.getElementById("sendButton");
const monitoringToggle = document.getElementById("monitoringToggle");
const disconnectButton = document.getElementById("disconnectButton");
const lastReport = document.getElementById("lastReport");
const messageBox = document.getElementById("message");

let currentScan = null;
let state = null;

const OUTCOME_LABELS = {
  no_slots: "Uygun randevu görünmüyor",
  slot_found: "Tarih adayı bulundu",
  verification_required: "Kullanıcı kontrolü gerekiyor",
  provider_unavailable: "iDATA geçici olarak erişilemiyor",
  error: "Kontrol sırasında hata oluştu",
};

function showMessage(value, isError = false) {
  messageBox.textContent = value || "";
  messageBox.classList.toggle("error", isError);
}

async function workerMessage(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok) throw new Error(response?.error || "İşlem başarısız.");
  return response.data;
}

function renderState() {
  const connected = Boolean(state?.extensionToken);
  connectView.classList.toggle("hidden", connected);
  connectedView.classList.toggle("hidden", !connected);
  if (!connected) return;

  trackTitle.textContent = `${state.countryName || "Vize"} takibi bağlı`;
  trackDetail.textContent = [state.applicationCity, state.trackId ? `Takip: ${state.trackId.slice(0, 8)}` : ""].filter(Boolean).join(" · ");
  monitoringToggle.checked = Boolean(state.monitoringEnabled);

  if (state.lastReport) {
    lastReport.classList.remove("hidden");
    const sentAt = new Date(state.lastReport.sentAt).toLocaleString("tr-TR");
    lastReport.textContent = `Son gönderim: ${OUTCOME_LABELS[state.lastReport.outcome] || state.lastReport.outcome} · ${sentAt}`;
  } else {
    lastReport.classList.add("hidden");
  }
}

async function refreshState() {
  state = await workerMessage({ type: "GET_STATE" });
  renderState();
}

pairingCode.addEventListener("input", () => {
  const raw = pairingCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  pairingCode.value = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
});

connectButton.addEventListener("click", async () => {
  const code = pairingCode.value.trim();
  if (code.replace(/[^A-Z0-9]/gi, "").length !== 10) {
    showMessage("Sitedeki 10 karakterli bağlantı kodunu gir.", true);
    return;
  }
  connectButton.disabled = true;
  showMessage("Bağlanıyor...");
  try {
    await workerMessage({ type: "CLAIM_PAIRING", code });
    await refreshState();
    showMessage("Chrome yardımcısı bağlandı.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    connectButton.disabled = false;
  }
});

openIdataButton.addEventListener("click", async () => {
  const url = state?.officialUrl || "https://de-tr-appointment.idata.com.tr/tr";
  await chrome.tabs.create({ url });
});

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;
  showMessage("Açık sekme kontrol ediliyor...");
  scanResult.classList.add("hidden");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://de-tr-appointment.idata.com.tr/")) {
      throw new Error("Önce aktif sekmede resmî iDATA sayfasını aç.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "L2T_SCAN_PAGE" });
    if (!response?.ok) throw new Error(response?.error || "Sayfa okunamadı.");
    currentScan = response.data;
    resultTitle.textContent = OUTCOME_LABELS[currentScan.outcome] || currentScan.outcome;
    resultMessage.textContent = currentScan.message;
    resultDates.innerHTML = "";
    if (currentScan.availableDates?.length) {
      for (const date of currentScan.availableDates) {
        const item = document.createElement("span");
        item.textContent = date;
        resultDates.appendChild(item);
      }
      resultDates.classList.remove("hidden");
    } else {
      resultDates.classList.add("hidden");
    }
    scanResult.classList.remove("hidden");
    showMessage("Sonucu kontrol et ve gönder.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    scanButton.disabled = false;
  }
});

sendButton.addEventListener("click", async () => {
  if (!currentScan) return;
  sendButton.disabled = true;
  showMessage("Sonuç gönderiliyor...");
  try {
    await workerMessage({ type: "REPORT_SCAN", scan: currentScan });
    showMessage("Sonuç LetsGo2Travel takip paneline gönderildi.");
    await refreshState();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    sendButton.disabled = false;
  }
});

monitoringToggle.addEventListener("change", async () => {
  try {
    await workerMessage({ type: "SET_MONITORING", enabled: monitoringToggle.checked });
    state.monitoringEnabled = monitoringToggle.checked;
    showMessage(monitoringToggle.checked ? "5 dakikalık açık sekme izlemesi açıldı." : "Otomatik izleme kapatıldı.");
  } catch (error) {
    monitoringToggle.checked = !monitoringToggle.checked;
    showMessage(error.message, true);
  }
});

disconnectButton.addEventListener("click", async () => {
  await workerMessage({ type: "DISCONNECT" });
  currentScan = null;
  await refreshState();
  showMessage("Bu Chrome tarayıcısındaki yerel bağlantı kaldırıldı.");
});

void refreshState().catch((error) => showMessage(error.message, true));
