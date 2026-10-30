export const FORUM_TRANSLATION_LANGUAGES = ["tr", "en", "sq", "ro"] as const;
export type ForumTranslationLanguage = typeof FORUM_TRANSLATION_LANGUAGES[number];
export const FORUM_TRANSLATION_MAX_TEXT = 8_000;
export type ForumTranslationItem = { id: string; text: string; title?: string };

/** Legacy single text stays compatible with installed clients; new clients batch visible rows. */
export function parseForumTranslationRequest(input: unknown) {
  const legacy = parseForumTranslation(input);
  if (legacy) return { items: [{ id: "0", text: legacy.text }], targetLanguage: legacy.targetLanguage, legacy: true };
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { items, targetLanguage } = input as Record<string, unknown>;
  if (!Array.isArray(items) || !items.length || items.length > 6 || !FORUM_TRANSLATION_LANGUAGES.includes(targetLanguage as ForumTranslationLanguage)) return null;
  const parsed: ForumTranslationItem[] = [];
  let length = 0;
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const { id, text, title } = item as Record<string, unknown>;
    const source = parseForumTranslation({ text, targetLanguage });
    if (!source || typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(id) || parsed.some(row => row.id === id)) return null;
    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title))) return null;
    length += source.text.length + (typeof title === "string" ? title.length : 0);
    if (length > FORUM_TRANSLATION_MAX_TEXT) return null;
    parsed.push({ id, text: source.text, ...(typeof title === "string" ? { title: title.trim() } : {}) });
  }
  return { items: parsed, targetLanguage: targetLanguage as ForumTranslationLanguage, legacy: false };
}

export function parseForumTranslationBatchResult(input: unknown, items: ForumTranslationItem[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { translations } = input as Record<string, unknown>;
  if (!Array.isArray(translations) || translations.length !== items.length) return null;
  const parsed: Array<{ id: string; translation: string; title?: string }> = [];
  for (const item of items) {
    const matches = translations.filter(row => row && typeof row === "object" && row.id === item.id);
    if (matches.length !== 1) return null;
    const row = matches[0];
    const translation = parseForumTranslationResult(row);
    const title = item.title === undefined ? undefined : parseForumTranslationResult({ translation: row.title });
    if (!translation || item.title !== undefined && !title) return null;
    parsed.push({ id: item.id, translation, ...(title ? { title } : {}) });
  }
  return parsed;
}

export function parseForumTranslation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { text, targetLanguage } = input as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim() || text.length > FORUM_TRANSLATION_MAX_TEXT
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)
    || !FORUM_TRANSLATION_LANGUAGES.includes(targetLanguage as ForumTranslationLanguage)) return null;
  return { text: text.trim(), targetLanguage: targetLanguage as ForumTranslationLanguage };
}

export function parseForumTranslationResult(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { translation } = input as Record<string, unknown>;
  return typeof translation === "string" && Boolean(translation.trim()) && translation.length <= 16_000
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(translation)
    ? translation.trim() : null;
}

/** Read only retry metadata from the SDK error. Never return provider messages,
 * quota identities or the supplied forum content to clients or logs. */
export function forumTranslationProviderRetryAfter(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { status?: unknown; message?: unknown };
  if (record.status !== 429) return null;
  let seconds = 60;
  if (typeof record.message === "string" && record.message.length <= 32_000) {
    try {
      const parsed = JSON.parse(record.message);
      const details = parsed?.error?.details;
      if (Array.isArray(details)) {
        const retry = details.find(item => item && item["@type"] === "type.googleapis.com/google.rpc.RetryInfo");
        if (typeof retry?.retryDelay === "string" && /^\d+(?:\.\d+)?s$/.test(retry.retryDelay)) {
          const value = Number(retry.retryDelay.slice(0, -1));
          if (Number.isFinite(value) && value > 0) seconds = Math.ceil(value);
        }
      }
    } catch { /* Missing/malformed RetryInfo uses the conservative default. */ }
  }
  return Math.min(86_400, Math.max(1, seconds));
}

/** SDK/auth/database clients also receive deadlines. This outer bound ensures
 * a dependency that ignores its abort signal cannot keep the route open. */
export async function translationWait<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("translation-timeout"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
