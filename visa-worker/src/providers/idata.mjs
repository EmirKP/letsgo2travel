import { chromium } from "playwright";

const DEFAULT_URL = "https://de-tr-appointment.idata.com.tr/tr";
const NAVIGATION_TIMEOUT_MS = 45_000;

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

async function captureEvidence(page) {
  try {
    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 48,
      fullPage: false,
      animations: "disabled",
    });
    return {
      evidenceBase64: buffer.toString("base64"),
      evidenceMimeType: "image/jpeg",
    };
  } catch {
    return {};
  }
}

function classifyPublicPage({ bodyText, title, finalUrl, httpStatus }) {
  const combined = normalize(`${title} ${bodyText}`);

  if (!combined || combined.length < 40) {
    return {
      outcome: "provider_unavailable",
      message: `iDATA sayfası boş veya beklenmeyen içerik döndürdü. HTTP ${httpStatus || "?"}.`,
      availableDates: [],
    };
  }

  const protectionSignals = [
    "captcha",
    "doğrulama kodu",
    "robot olmadığınızı",
    "access denied",
    "cloudflare",
    "security check",
    "güvenlik kontrolü",
  ];

  if (includesAny(combined, protectionSignals)) {
    return {
      outcome: "verification_required",
      message: `iDATA erişildi; güvenlik/doğrulama adımı kullanıcı işlemi gerektiriyor. URL: ${finalUrl}`,
      availableDates: [],
    };
  }

  const officialFlowSignals = [
    "randevu bekleme listesine",
    "randevunuzu alın",
    "randevunuzu oluşturun",
    "online randevu",
    "koordinasyon ücreti",
    "başvuru e-mail",
    "pasaport numarası",
    "devam",
  ];

  if (includesAny(combined, officialFlowSignals)) {
    return {
      outcome: "verification_required",
      message: `iDATA Almanya randevu portalına erişildi. Kayıt/kimlik doğrulama gerektiren resmî akış hazır; uygunluk sonucu için kullanıcı oturumu gerekir. URL: ${finalUrl}`,
      availableDates: [],
    };
  }

  return {
    outcome: "verification_required",
    message: `iDATA sayfasına erişildi ancak randevu uygunluğu anonim açılış sayfasından güvenilir biçimde doğrulanamadı. Kullanıcı doğrulaması gerekli. URL: ${finalUrl}`,
    availableDates: [],
  };
}

export async function checkIdataJob() {
  const targetUrl = String(process.env.IDATA_APPOINTMENT_URL || DEFAULT_URL).trim();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      viewport: { width: 1280, height: 760 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 LetsGo2TravelMonitor/0.3",
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(15_000);

    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    await page.waitForTimeout(2_000);

    const httpStatus = response?.status() || 0;
    if (httpStatus >= 500) {
      return {
        outcome: "provider_unavailable",
        message: `iDATA geçici sunucu hatası döndürdü. HTTP ${httpStatus}. Sonraki kontrol 30 dakika sonra yapılacak.`,
        availableDates: [],
        ...(await captureEvidence(page)),
      };
    }

    if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
      return {
        outcome: "verification_required",
        message: `iDATA erişimi kullanıcı doğrulaması veya hız sınırı gerektiriyor. HTTP ${httpStatus}. Otomatik kontrol durduruldu.`,
        availableDates: [],
        ...(await captureEvidence(page)),
      };
    }

    const [title, bodyText] = await Promise.all([
      page.title().catch(() => ""),
      page.locator("body").innerText({ timeout: 10_000 }).catch(() => ""),
    ]);

    const result = classifyPublicPage({
      bodyText,
      title,
      finalUrl: page.url(),
      httpStatus,
    });

    return {
      ...result,
      ...(result.outcome === "verification_required" ? await captureEvidence(page) : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen iDATA bağlantı hatası";
    return {
      outcome: "provider_unavailable",
      message: `iDATA bağlantısı kurulamadı: ${message}. Sonraki kontrol 30 dakika sonra yapılacak.`.slice(0, 1000),
      availableDates: [],
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
