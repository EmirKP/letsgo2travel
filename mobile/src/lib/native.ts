import { isNativePlatform, plugin } from "./capacitor";
import { config } from "./config";
import { getMobilePreferences } from "./storage";
import { handoffMailDraft, type MailDraftResult, type SupportDraft } from "./support";

export function resolveExternalUrl(url: string) {
  const clean = url.trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean, `${config.apiBaseUrl}/`);
    if (parsed.protocol === "https:") return parsed.toString();
    return "";
  } catch {
    return "";
  }
}

export function openMailDraft(draft: SupportDraft): MailDraftResult {
  // Capacitor's installed iOS/Android navigation delegate passes mailto to the
  // operating system. Browser.open only supports HTTP(S) on iOS. Keep the
  // support sheet open: the OS does not report whether a mail account exists.
  return handoffMailDraft(draft, (url) => window.location.assign(url));
}

export async function copySupportText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function openExternal(url: string): Promise<boolean> {
  const resolvedUrl = resolveExternalUrl(url);
  if (!resolvedUrl) return false;

  const browser = plugin("Browser");
  if (isNativePlatform()) {
    if (!browser?.open) return false;
    try {
      await browser.open({ url: resolvedUrl, presentationStyle: "popover" });
      return true;
    } catch {
      // Native uygulamanın ana WebView'ini üçüncü taraf siteye yönlendirme.
      return false;
    }
  }

  try {
    const opened = window.open(resolvedUrl, "_blank", "noopener,noreferrer");
    if (opened) return true;
    window.location.assign(resolvedUrl);
    return true;
  } catch {
    return false;
  }
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
