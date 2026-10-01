import { addPluginListener, isNativePlatform } from "./capacitor";

/** Re-read account data after returning from another device or reconnecting.
 * Native resume does not always produce a document visibility event, and can
 * arrive while Android still reports the WebView as hidden. */
export function onAccountResume(refresh: () => void) {
  let stopped = false;
  let queued: ReturnType<typeof setTimeout> | undefined;
  let nativeListener: { remove: () => Promise<void> } | null = null;
  const schedule = () => {
    if (stopped || queued !== undefined) return;
    // Native and document callbacks may arrive in adjacent bridge tasks.
    queued = setTimeout(() => {
      queued = undefined;
      if (!stopped) refresh();
    }, 50);
  };
  const visible = () => { if (document.visibilityState === "visible") schedule(); };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", visible);
  if (isNativePlatform()) {
    void addPluginListener("App", "appStateChange", event => {
      if (event.isActive === true) schedule();
    }).then(listener => {
      if (stopped) void listener?.remove().catch(() => undefined);
      else nativeListener = listener;
    });
  }
  return () => {
    stopped = true;
    clearTimeout(queued);
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("online", visible);
    void nativeListener?.remove().catch(() => undefined);
  };
}
