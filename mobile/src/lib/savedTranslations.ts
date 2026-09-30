import { TRANSLATION_LANGUAGES } from "./offlineTranslation";

const KEY = "l2t:saved-translations:v1";
export const MAX_SAVED_TRANSLATIONS = 30;
const MAX_BYTES = 500_000;
const languageCodes = new Set<string>(TRANSLATION_LANGUAGES.map(([code]) => code));

export type TranslationCard = {
  source: string;
  target: string;
  text: string;
  translation: string;
};
export type SavedTranslation = TranslationCard & { id: string; savedAt: string };

function validCard(value: unknown): value is TranslationCard {
  if (!value || typeof value !== "object") return false;
  const p = value as TranslationCard;
  return languageCodes.has(p.source) && languageCodes.has(p.target) && p.source !== p.target &&
    typeof p.text === "string" && !!p.text.trim() && p.text.length <= 2000 &&
    typeof p.translation === "string" && !!p.translation.trim() && p.translation.length <= 12000;
}

export type SavedTranslationState = { items: SavedTranslation[]; error: "corrupt" | "unavailable" | null };
export function readSavedTranslationState(): SavedTranslationState {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); }
  catch { return { items: [], error: "unavailable" }; }
  try {
    if (!raw) return { items: [], error: null };
    if (new Blob([raw]).size > MAX_BYTES) return { items: [], error: "corrupt" };
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return { items: [], error: "corrupt" };
    let corrupt = values.length > MAX_SAVED_TRANSLATIONS;
    const seen = new Set<string>();
    const result: SavedTranslation[] = [];
    for (const value of values.slice(0, MAX_SAVED_TRANSLATIONS)) {
      if (!validCard(value)) { corrupt = true; continue; }
      const p = value as SavedTranslation;
      if (typeof p.id !== "string" || !/^[a-z\d-]{10,80}$/i.test(p.id) || seen.has(p.id) ||
        typeof p.savedAt !== "string" || !Number.isFinite(Date.parse(p.savedAt)) || Date.parse(p.savedAt) > Date.now() + 60000) { corrupt = true; continue; }
      seen.add(p.id);
      result.push({ id: p.id, savedAt: p.savedAt, source: p.source, target: p.target, text: p.text, translation: p.translation });
    }
    return { items: result, error: corrupt ? "corrupt" : null };
  } catch {
    return { items: [], error: "corrupt" };
  }
}
export function readSavedTranslations(): SavedTranslation[] {
  return readSavedTranslationState().items;
}
function writableTranslations() {
  const state = readSavedTranslationState();
  if (state.error) throw new Error(state.error);
  return state.items;
}
/** Invoke only after the user confirms removal of all translation cards. */
export function resetSavedTranslations() {
  localStorage.removeItem(KEY);
}

export function saveTranslation(card: TranslationCard): SavedTranslation[] {
  if (!validCard(card)) throw new Error("invalid");
  const clean = { source: card.source, target: card.target, text: card.text.trim(), translation: card.translation.trim() };
  const existing = writableTranslations();
  const duplicate = existing.find((p) => p.source === clean.source && p.target === clean.target && p.text === clean.text && p.translation === clean.translation);
  const remaining = existing.filter((p) => p.id !== duplicate?.id);
  if (remaining.length >= MAX_SAVED_TRANSLATIONS) throw new Error("full");
  const next = [{ ...clean, id: duplicate?.id || crypto.randomUUID(), savedAt: new Date().toISOString() }, ...remaining];
  const raw = JSON.stringify(next);
  if (new Blob([raw]).size > MAX_BYTES) throw new Error("full");
  // Writes are explicit and atomic. Storage failures preserve the previous cards.
  localStorage.setItem(KEY, raw);
  return next;
}

export function deleteSavedTranslation(id: string): SavedTranslation[] {
  const next = writableTranslations().filter((card) => card.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
