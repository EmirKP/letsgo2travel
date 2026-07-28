import { isNativePlatform, plugin } from "./capacitor";
import { config } from "./config";

export function resolveExternalUrl(url: string) {
  const clean = url.trim();
  if (!clean) return "";
  try {
    return new URL(clean, `${config.apiBaseUrl}/`).toString();
  } catch {
    return clean;
  }
}

export async function openExternal(url: string) {
  const resolvedUrl = resolveExternalUrl(url);
  if (!resolvedUrl) return;

  const browser = plugin("Browser");
  if (isNativePlatform() && browser?.open) {
    try {
      await browser.open({ url: resolvedUrl, presentationStyle: "popover" });
      return;
    } catch {
      // Eklenti kullanılamazsa sistem/tarayıcı geri dönüşünü dene.
    }
  }

  const opened = window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  if (!opened && /^https?:/i.test(resolvedUrl)) window.location.assign(resolvedUrl);
  if (!opened && !/^https?:/i.test(resolvedUrl)) window.location.href = resolvedUrl;
}

export async function closeBrowser() {
  const browser = plugin("Browser");
  if (isNativePlatform() && browser?.close) {
    await browser.close().catch(() => undefined);
  }
}

export async function impact() {
  const haptics = plugin("Haptics");
  if (!isNativePlatform() || !haptics?.impact) return;
  try {
    await haptics.impact({ style: "LIGHT" });
  } catch {
    // Desteklenmeyen cihazlarda sessizce geç.
  }
}

export async function hapticSuccess() {
  const haptics = plugin("Haptics");
  if (!isNativePlatform() || !haptics?.notification) return;
  try {
    await haptics.notification({ type: "SUCCESS" });
  } catch {
    // Desteklenmeyen cihazlarda sessizce geç.
  }
}
