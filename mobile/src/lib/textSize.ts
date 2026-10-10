export type TextSize = 'normal' | 'large';
export const TEXT_SIZE_KEY = 'l2t-text-size';
let value: TextSize = 'normal';
const listeners = new Set<() => void>();

function normalize(raw: unknown): TextSize { return raw === 'large' ? 'large' : 'normal'; }
function apply(next: TextSize) {
  document.documentElement.dataset.textSize = next;
  if (value === next) return;
  value = next;
  listeners.forEach(listener => listener());
}
export const getTextSize = () => value;
export const getServerTextSize = () => 'normal' as const;
export function subscribeTextSize(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setTextSize(next: TextSize) {
  if (next !== 'normal' && next !== 'large') return;
  try { window.localStorage.setItem(TEXT_SIZE_KEY, next); } catch { /* Apply even with blocked storage. */ }
  apply(next);
}
export function initializeTextSize() {
  try { apply(normalize(window.localStorage.getItem(TEXT_SIZE_KEY))); } catch { apply('normal'); }
  const storage = (event: StorageEvent) => {
    if (event.key !== TEXT_SIZE_KEY && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { /* Cannot verify this is local storage. */ return; }
    apply(normalize(event.newValue));
  };
  window.addEventListener('storage', storage);
  return () => window.removeEventListener('storage', storage);
}
