import { validateOfflinePack } from "../../../lib/travel-assistant/offline-map";
import type { OfflineMapPack } from "../../../lib/travel-assistant/offline-map";
const KEY = "l2t:offline-street-maps:v1";
export function readOfflineMaps(): OfflineMapPack[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v)
      ? v
          .slice(0, 3)
          .map(validateOfflinePack)
          .filter((p): p is OfflineMapPack => p !== null)
      : [];
  } catch {
    return [];
  }
}
function writablePacks(): OfflineMapPack[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 3 || parsed.some(p => !validateOfflinePack(p))) throw new Error('corrupt');
    return parsed;
  } catch { throw new Error('corrupt'); }
}
export function hasUnreadableOfflineMaps(): boolean {
  try { writablePacks(); return false; }
  catch (error) { return error instanceof Error && error.message === 'corrupt'; }
}
/** Call only after the user explicitly confirms removal of all downloaded maps. */
export function resetOfflineMaps(): void {
  localStorage.removeItem(KEY);
}
export function saveOfflineMap(pack: OfflineMapPack) {
  if (!validateOfflinePack(pack)) throw new Error("Invalid pack");
  const existing = writablePacks().filter((p) => p.id !== pack.id);
  if (existing.length >= 3) throw new Error("full");
  const next = [pack, ...existing];
  const value = JSON.stringify(next);
  if (new Blob([value]).size > 3_000_000) throw new Error("full");
  // setItem is atomic: quota errors leave previously downloaded packs untouched.
  localStorage.setItem(KEY, value);
  return next;
}
export function deleteOfflineMap(id: string) {
  const next = writablePacks().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
