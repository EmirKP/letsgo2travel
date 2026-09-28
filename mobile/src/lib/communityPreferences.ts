import { ISO_3166 } from "../data/countries";

const PREFIX = "l2t.mobile.community-follows.v1.";
const VALID_COUNTRIES = new Set(ISO_3166.map(country => country.alpha2));
const MAX_FOLLOWS = VALID_COUNTRIES.size;

function storageKey(ownerId: string | null): string | null {
  if (ownerId === null) return `${PREFIX}guest`;
  // An invalid account identity must never fall back to guest preferences.
  if (typeof ownerId !== "string" || !ownerId || ownerId.length > 200 || ownerId !== ownerId.trim()) return null;
  return `${PREFIX}user-${encodeURIComponent(ownerId)}`;
}

function normalizedCodes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const codes = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    const code = item.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || !VALID_COUNTRIES.has(code)) return null;
    codes.add(code);
    if (codes.size > MAX_FOLLOWS) return null;
  }
  return [...codes];
}

/** Device-local followed country groups only; no account or guest fallback. */
export function readCommunityFollows(ownerId: string | null): string[] {
  try {
    const key = storageKey(ownerId);
    if (!key) return [];
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 8192) return [];
    return normalizedCodes(JSON.parse(raw)) || [];
  } catch {
    return [];
  }
}

/** False means the previous preference was not replaced; callers can retry. */
export function writeCommunityFollows(ownerId: string | null, codes: readonly string[]): boolean {
  try {
    const key = storageKey(ownerId);
    const normalized = normalizedCodes(codes);
    if (!key || !normalized) return false;
    window.localStorage.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

/** Explicit account cleanup only; an absent identity must never erase guest follows. */
export function clearCommunityFollows(ownerId: string): boolean {
  try {
    if (typeof ownerId !== "string" || !ownerId) return false;
    const key = storageKey(ownerId);
    if (!key) return false;
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
