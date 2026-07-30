import { chromium } from "playwright";

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
      quality: 45,
      fullPage: false,
      animations: "disabled",
    });
    return { evidenceBase64: buffer.toString("base64"), evidenceMimeType: "image/jpeg" };
  } catch {
    return {};
  }
}

function classify({ httpStatus, bodyText, title, finalUrl }) {
  const combined = normalize(`${title} ${bodyText}`);

  if ([401, 403, 429].includes(httpStatus)) {
    return {
      outcome: "blocked",
      message: `Portal erişimi HTTP ${httpStatus} ile sınırlandı. Koruma aşılmadı; sağlayıcı manuel/doğrulamalı akış olarak işaretlendi.`,
    };
  }

  if (httpStatus >= 500) {
    return {
      outcome: "provider_unavailable",
      message: `Portal geçici sunucu hatası döndürdü. HTTP ${httpStatus}.`,
    };
  }

  if (!combined || combined.length < 40) {
    return {
      outcome: "provider_unavailable",
      message: `Portal boş veya beklenmeyen içerik döndürdü. HTTP ${httpStatus || "?"}.`,
    };
  }

  const blockedSignals = [
    "access denied", "request blocked", "forbidden", "temporarily blocked", "ip has been blocked",
    "erişim engellendi", "istek engellendi", "too many requests",
  ];
  if (includesAny(combined, blockedSignals)) {
    return {
      outcome: "blocked",
      message: `Portal erişim koruması gösterdi. Son URL: ${finalUrl}`,
    };
  }

  const verificationSignals = [
    "captcha", "cloudflare", "security check", "verify you are human", "robot olmadığınızı",
    "güvenlik kontrolü", "doğrulama kodu", "sign in", "login", "oturum aç", "giriş yap",
    "register", "kayıt ol", "create account", "one time password", "otp",
  ];
  if (includesAny(combined, verificationSignals)) {
    return {
      outcome: "verification_required",
      message: `Portal açıldı ancak kullanıcı oturumu veya doğrulama gerekiyor. Son URL: ${finalUrl}`,
    };
  }

  return {
    outcome: "accessible",
    message: `Portal VDS üzerinden erişilebilir durumda. Bu sonuç yalnızca erişim testidir; takvim adaptörü ayrıca doğrulanmalıdır. Son URL: ${finalUrl}`,
  };
}

export async function probeProviderTarget(target) {
  const startedAt = Date.now();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      viewport: { width: 1365, height: 768 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 LetsGo2TravelProviderAudit/0.4",
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(15_000);

    const response = await page.goto(String(target.probe_url), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForTimeout(2_000);

    const [title, bodyText] = await Promise.all([
      page.title().catch(() => ""),
      page.locator("body").innerText({ timeout: 10_000 }).catch(() => ""),
    ]);
    const httpStatus = response?.status() || 0;
    const finalUrl = page.url();
    const result = classify({ httpStatus, bodyText, title, finalUrl });

    return {
      ...result,
      httpStatus,
      finalUrl,
      pageTitle: title,
      durationMs: Date.now() - startedAt,
      ...(await captureEvidence(page)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen sağlayıcı bağlantı hatası";
    return {
      outcome: "error",
      httpStatus: 0,
      finalUrl: String(target.probe_url || ""),
      pageTitle: "",
      durationMs: Date.now() - startedAt,
      message: `Sağlayıcı testi tamamlanamadı: ${message}`.slice(0, 1000),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
