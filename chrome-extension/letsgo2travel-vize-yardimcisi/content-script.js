const DATE_PATTERNS = [
  /\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/g,
  /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/g,
];

const VERIFICATION_TERMS = [
  "captcha",
  "cloudflare",
  "access denied",
  "forbidden",
  "verify you are human",
  "robot olmadığınızı",
  "güvenlik kontrolü",
  "doğrulama kodu",
  "bestätigungscode",
  "verification code",
  "http 403",
];

const UNAVAILABLE_TERMS = [
  "service unavailable",
  "temporarily unavailable",
  "internal server error",
  "bakım çalışması",
  "şu anda hizmet veremiyoruz",
  "teknik bir hata oluştu",
];

const NO_SLOT_TERMS = [
  "uygun randevu bulunmamaktadır",
  "uygun randevu bulunamadı",
  "müsait randevu bulunmamaktadır",
  "no appointment available",
  "no appointments available",
  "keine termine verfügbar",
  "keine freien termine",
];

const SLOT_CONTEXT_TERMS = [
  "uygun tarih",
  "müsait tarih",
  "randevu tarihi",
  "appointment date",
  "available date",
  "termin datum",
  "freier termin",
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function pageText() {
  return normalizeText(document.body?.innerText || "").slice(0, 120000);
}

function toIsoDate(match) {
  if (match[1]?.length === 4) {
    const [, year, month, day] = match;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const [, day, month, year] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateIsPlausible(value) {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) return false;
  const lower = Date.now() - 24 * 60 * 60 * 1000;
  const upper = Date.now() + 730 * 24 * 60 * 60 * 1000;
  return time >= lower && time <= upper;
}

function collectContextualDates() {
  const selectors = [
    "[data-date]",
    "[aria-label]",
    "button",
    "td",
    "th",
    "option",
    "label",
    "[role='button']",
    "[role='gridcell']",
  ];
  const values = new Set();
  const evidence = [];
  const elements = Array.from(document.querySelectorAll(selectors.join(","))).slice(0, 2500);

  for (const element of elements) {
    const raw = normalizeText([
      element.getAttribute("data-date"),
      element.getAttribute("aria-label"),
      element.textContent,
      element.parentElement?.textContent,
    ].filter(Boolean).join(" ")).slice(0, 500);
    const lower = raw.toLocaleLowerCase("tr-TR");
    if (!SLOT_CONTEXT_TERMS.some((term) => lower.includes(term))) continue;

    for (const pattern of DATE_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of raw.matchAll(pattern)) {
        const iso = toIsoDate(match);
        if (dateIsPlausible(iso)) values.add(iso);
      }
    }
    if (values.size > 0 && evidence.length < 4) evidence.push(raw.slice(0, 240));
  }

  return { dates: Array.from(values).sort().slice(0, 20), evidence };
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function scanPage() {
  const text = pageText();
  const lower = text.toLocaleLowerCase("tr-TR");
  const title = normalizeText(document.title).slice(0, 180);
  const currentUrl = location.href;
  const contextual = collectContextualDates();

  let outcome = "verification_required";
  let message = "iDATA sayfası açık; kesin sonuç için kullanıcı kontrolü gerekiyor.";

  if (VERIFICATION_TERMS.some((term) => lower.includes(term))) {
    outcome = "verification_required";
    message = "iDATA sayfasında doğrulama, güvenlik kontrolü veya giriş kodu gerekiyor.";
  } else if (UNAVAILABLE_TERMS.some((term) => lower.includes(term))) {
    outcome = "provider_unavailable";
    message = "iDATA sayfası geçici teknik hata veya bakım mesajı gösteriyor.";
  } else if (NO_SLOT_TERMS.some((term) => lower.includes(term))) {
    outcome = "no_slots";
    message = "iDATA sayfasında uygun randevu bulunmadığını belirten açık bir mesaj görüldü.";
  } else if (contextual.dates.length > 0) {
    outcome = "slot_found";
    message = `iDATA sayfasında randevu bağlamında ${contextual.dates.length} tarih adayı görüldü: ${contextual.dates.join(", ")}`;
  }

  const fingerprint = simpleHash([
    currentUrl,
    title,
    outcome,
    contextual.dates.join(","),
    message,
  ].join("|"));

  return {
    outcome,
    message,
    availableDates: contextual.dates,
    pageUrl: currentUrl,
    pageTitle: title,
    fingerprint,
    evidence: contextual.evidence,
    scannedAt: new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "L2T_SCAN_PAGE") return false;
  try {
    sendResponse({ ok: true, data: scanPage() });
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Sayfa okunamadı." });
  }
  return true;
});
