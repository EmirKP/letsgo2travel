import { APP_TOOLS, appToolId, type AppShortcutId } from "./appTools";

export const DEFAULT_HOME_SHORTCUTS: readonly AppShortcutId[] = ["route", "explore", "passport", "trips", "companion"];
export const HOME_SHORTCUT_LIMIT = 5;
export const HOME_SHORTCUT_EVENT = "l2t:home-shortcuts-change";
const allowed = new Set(APP_TOOLS.map(appToolId));

// Exact, encoded account identities cannot collapse into another account's key.
export function homeShortcutKey(ownerId?: string | null) {
  return `l2t.mobile.home-shortcuts.v1.${ownerId ? `user-${encodeURIComponent(ownerId)}` : "guest"}`;
}

export function normalizeHomeShortcuts(value: unknown): AppShortcutId[] {
  if (!Array.isArray(value)) return [...DEFAULT_HOME_SHORTCUTS];
  const valid = [...new Set(value.filter((item): item is AppShortcutId => typeof item === "string" && allowed.has(item as AppShortcutId)))].slice(0, HOME_SHORTCUT_LIMIT);
  return valid.length ? valid : [...DEFAULT_HOME_SHORTCUTS];
}

export function readHomeShortcuts(ownerId?: string | null): AppShortcutId[] {
  try { return normalizeHomeShortcuts(JSON.parse(window.localStorage.getItem(homeShortcutKey(ownerId)) || "null")); }
  catch { return [...DEFAULT_HOME_SHORTCUTS]; }
}

export function saveHomeShortcuts(ownerId: string | null | undefined, views: readonly AppShortcutId[]): boolean {
  try {
    window.localStorage.setItem(homeShortcutKey(ownerId), JSON.stringify(normalizeHomeShortcuts(views)));
  } catch { return false; }
  window.dispatchEvent(new CustomEvent(HOME_SHORTCUT_EVENT));
  return true;
}
