export const FORUM_TRANSLATION_LANGUAGES = ["tr", "en", "sq"] as const;
export type ForumTranslationLanguage = typeof FORUM_TRANSLATION_LANGUAGES[number];
export const FORUM_TRANSLATION_MAX_TEXT = 8_000;

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
