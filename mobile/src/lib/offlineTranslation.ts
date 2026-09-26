import { plugin } from "./capacitor";

// Availability is checked on the device; this list does not promise model support.
export const TRANSLATION_LANGUAGES = [
  ["tr", "Türkçe"],
  ["en", "English"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["es", "Español"],
  ["it", "Italiano"],
  ["pt", "Português"],
  ["ar", "العربية"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["zh", "中文"],
  ["ru", "Русский"],
  ["nl", "Nederlands"],
  ["pl", "Polski"],
  ["uk", "Українська"],
  ["hi", "हिन्दी"],
  ["th", "ไทย"],
  ["vi", "Tiếng Việt"],
  ["id", "Bahasa Indonesia"],
  ["el", "Ελληνικά"],
] as const;
export type TranslationStatus = "installed" | "supported" | "unsupported";
export async function translationStatus(
  source: string,
  target: string,
): Promise<TranslationStatus> {
  const bridge = plugin("OfflineTranslation");
  if (!bridge?.status) return "unsupported";
  const result = (await bridge.status({ source, target })) as {
    status?: string;
  };
  return result.status === "installed" || result.status === "supported"
    ? result.status
    : "unsupported";
}
export async function prepareTranslation(
  source: string,
  target: string,
  locale: string,
) {
  const bridge = plugin("OfflineTranslation");
  if (!bridge?.prepare) throw new Error("unsupported");
  await bridge.prepare({ source, target, locale });
  return translationStatus(source, target);
}
export async function translateOffline(
  source: string,
  target: string,
  text: string,
  locale: string,
) {
  const bridge = plugin("OfflineTranslation");
  if (!bridge?.translate || !text.trim() || text.length > 2000)
    throw new Error("unavailable");
  const result = (await bridge.translate({
    source,
    target,
    text: text.trim(),
    locale,
  })) as { text?: unknown };
  if (
    typeof result.text !== "string" ||
    !result.text.trim() ||
    result.text.length > 12000
  )
    throw new Error("invalid");
  return result.text;
}
