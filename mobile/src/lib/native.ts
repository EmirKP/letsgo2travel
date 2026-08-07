import { isNativePlatform, plugin } from "./capacitor";
import { config } from "./config";
import { getMobilePreferences } from "./storage";

export function resolveExternalUrl(url: string) {
  const clean = url.trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean, `${config.apiBaseUrl}/`);
    if (parsed.protocol === "https:") return parsed.toString();
    if (parsed.protocol === "mailto:" && !/[\r\n]/.test(clean)) return parsed.toString();
    return "";
  } catch {
    return "";
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
  if (!getMobilePreferences().haptics) return;
  const haptics = plugin("Haptics");
  if (!isNativePlatform() || !haptics?.impact) return;
  try {
    await haptics.impact({ style: "LIGHT" });
  } catch {
    // Desteklenmeyen cihazlarda sessizce geç.
  }
}

export async function hapticSuccess() {
  if (!getMobilePreferences().haptics) return;
  const haptics = plugin("Haptics");
  if (!isNativePlatform() || !haptics?.notification) return;
  try {
    await haptics.notification({ type: "SUCCESS" });
  } catch {
    // Desteklenmeyen cihazlarda sessizce geç.
  }
}

export async function shareContent(params: { title: string; text: string; url?: string }) {
  const share = plugin("Share");
  if (isNativePlatform() && share?.share) {
    try {
      await share.share(params);
      return true;
    } catch {
      return false;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share(params);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await navigator.clipboard.writeText([params.text, params.url].filter(Boolean).join("\n"));
    return true;
  } catch {
    return false;
  }
}
