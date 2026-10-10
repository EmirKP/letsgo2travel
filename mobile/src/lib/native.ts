import { isIOSNative, isNativePlatform, plugin } from "./capacitor";
import { config } from "./config";
import { getMobilePreferences } from "./storage";
import { handoffMailDraft, type MailDraftResult, type SupportDraft } from "./support";
import { getThemeSnapshot } from "./theme";

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
      await browser.open({
        url: resolvedUrl,
        presentationStyle: "popover",
        toolbarColor: getThemeSnapshot().resolved === "dark" ? "#101b2d" : "#0877b8",
      });
      return true;
    } catch {
      // Native uygulamanın ana WebView'ini üçüncü taraf siteye yönlendirme.
      return false;
    }
  }

  try {
    // noopener deliberately returns null even when the new tab opens. It is
    // not evidence of a blocked popup, and must never replace the app tab.
    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

export async function openOAuthSession(url: string): Promise<string | null> {
  if (!isIOSNative()) {
    if (!await openExternal(url)) throw new Error("Sign-in window could not be opened");
    return null;
  }
  const auth = plugin("WebAuthentication");
  // Fail visibly on an outdated native shell; never return to the broken popover.
  if (!auth?.authenticate) throw new Error("System authentication is unavailable");
  const result = await auth.authenticate({ url });
  const callback = result && typeof result === "object" && "callbackUrl" in result
    ? String(result.callbackUrl) : "";
  const parsed = new URL(callback);
  if (parsed.protocol !== "tr.com.letsgo2travel.app:" || parsed.hostname !== "auth"
    || parsed.pathname !== "/callback" || parsed.username || parsed.password || parsed.port) {
    throw new Error("Invalid authentication callback");
  }
  return callback;
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
