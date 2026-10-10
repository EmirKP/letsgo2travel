export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type ThemeSnapshot = { preference: ThemePreference; resolved: ResolvedTheme };

export const THEME_STORAGE_KEY = "l2t-theme";
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#0877b8", dark: "#101b2d" };
const SYSTEM_QUERY = "(prefers-color-scheme: dark)";
const serverSnapshot: ThemeSnapshot = { preference: "system", resolved: "light" };
let snapshot = serverSnapshot;
let requestedPreference: ThemePreference = serverSnapshot.preference;
let media: MediaQueryList | undefined;
let initializers = 0;
let detach: (() => void) | undefined;
let activeTransition: ViewTransition | undefined;
let appearanceRevision = 0;
const listeners = new Set<() => void>();

function stopColorTransition() {
  appearanceRevision++;
  activeTransition?.skipTransition();
  activeTransition = undefined;
  if (typeof document !== "undefined") delete document.documentElement.dataset.themeTransition;
}

function canAnimateAppearance() {
  if (typeof document === "undefined" || !document.startViewTransition || document.visibilityState === "hidden") return false;
  try { return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}

function preference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function storedPreference(): ThemePreference {
  try { return preference(window.localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { return "system"; }
}

function systemTheme(): ResolvedTheme {
  try { return (media ?? window.matchMedia(SYSTEM_QUERY)).matches ? "dark" : "light"; }
  catch { return "light"; }
}

function apply(nextPreference: ThemePreference, animate = true) {
  requestedPreference = nextPreference;
  const resolved = nextPreference === "system" ? systemTheme() : nextPreference;
  const changesColors = snapshot.resolved !== resolved;
  stopColorTransition();
  const revision = appearanceRevision;
  let committed = false;
  const commit = () => {
    // Skipped transitions may still invoke their callback after a newer choice.
    if (revision !== appearanceRevision || committed) return;
    committed = true;
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolved]);
      document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", resolved);
    }
    if (snapshot.preference === nextPreference && snapshot.resolved === resolved) return;
    snapshot = { preference: nextPreference, resolved };
    listeners.forEach(listener => listener());
  };
  if (!animate || !changesColors || !canAnimateAppearance()) {
    commit();
    return;
  }

  // Composite two page snapshots instead of repainting every text, shadow and
  // translucent surface on every frame. Older webviews switch directly.
  document.documentElement.dataset.themeTransition = "crossfade";
  const cleanup = () => {
    if (revision !== appearanceRevision) return;
    activeTransition = undefined;
    delete document.documentElement.dataset.themeTransition;
  };
  try {
    const transition = document.startViewTransition(commit);
    activeTransition = transition;
    void transition.ready.catch(() => { /* Skips still run the update callback. */ });
    void transition.finished.then(cleanup, () => { commit(); cleanup(); });
  } catch {
    commit();
    cleanup();
  }
}

export const getThemeSnapshot = () => snapshot;
export const getServerThemeSnapshot = () => serverSnapshot;

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setThemePreference(nextPreference: ThemePreference) {
  if (!["system", "light", "dark"].includes(nextPreference)) return;
  // The selection still works for this session when device storage is blocked.
  try { window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference); } catch { /* Storage is optional. */ }
  apply(nextPreference);
}

/** Initialize once above the account/session boundary. Safe for overlapping mounts and HMR. */
export function initializeTheme() {
  initializers++;
  if (initializers === 1) {
    try { media = window.matchMedia(SYSTEM_QUERY); } catch { media = undefined; }
    apply(storedPreference(), false);
    const onSystemChange = () => { if (requestedPreference === "system") apply("system"); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { /* A blocked store still accepts the event value. */ }
      apply(event.key === null ? "system" : preference(event.newValue));
    };
    if (media?.addEventListener) media.addEventListener("change", onSystemChange);
    else media?.addListener(onSystemChange);
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    const observedMedia = media;
    detach = () => {
      stopColorTransition();
      if (observedMedia?.removeEventListener) observedMedia.removeEventListener("change", onSystemChange);
      else observedMedia?.removeListener(onSystemChange);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      media = undefined;
    };
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--initializers === 0) { detach?.(); detach = undefined; }
  };
}
