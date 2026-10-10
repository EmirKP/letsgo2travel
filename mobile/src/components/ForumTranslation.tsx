import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { AppLocale } from "../lib/locale";
import "./forum-translation.css";

type ForumTranslationProps = { text: string; accessToken: string; onSignIn?: () => void; children?: ReactNode };

export function ForumTranslation(props: ForumTranslationProps) {
  const { locale } = useI18n();
  // Reset private translation state on text or session changes, and abort the
  // previous request on unmount. Nothing is persisted across accounts.
  return <TranslationText key={`${locale}\u0000${props.text}\u0000${props.accessToken}`} {...props} />;
}

function TranslationText({ text, accessToken, onSignIn, children }: ForumTranslationProps) {
  const { copy, locale } = useI18n();
  const [target, setTarget] = useState<AppLocale>(locale);
  const [translated, setTranslated] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const cache = useRef(new Map<AppLocale, string>());
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);

  async function translate() {
    if (visible) { setVisible(false); return; }
    if (!accessToken) {
      if (onSignIn) onSignIn();
      else setError(copy("Çeviri için giriş yap.", "Sign in to translate.", "Hyr për të përkthyer."));
      return;
    }
    if (controller.current) return;
    setError("");
    const cached = cache.current.get(target);
    if (cached) { setTranslated(cached); setVisible(true); return; }
    const current = ++generation.current;
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const result = await requestJson<{ translation: string; targetLanguage: AppLocale }>("/api/country-community/translate", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: { text, targetLanguage: target },
        signal: abort.signal, timeoutMs: 32_000,
      });
      if (generation.current !== current) return;
      if (!result.translation?.trim() || result.targetLanguage !== target) throw new Error("invalid-translation");
      cache.current.set(target, result.translation);
      setTranslated(result.translation); setVisible(true);
    } catch (requestError) {
      if (generation.current !== current || abort.signal.aborted) return;
      setError(requestError instanceof ApiError && requestError.status === 429
        ? copy("Çeviri sınırına ulaştın. Bir süre sonra tekrar dene.", "Translation limit reached. Try again later.", "U arrit kufiri i përkthimeve. Provo sërish më vonë.")
        : requestError instanceof ApiError && requestError.status === 401
          ? copy("Oturumun sona erdi. Çeviri için yeniden giriş yap.", "Your session expired. Sign in again to translate.", "Sesioni ka skaduar. Hyr sërish për të përkthyer.")
          : copy("Çeviri şu an yüklenemedi. Orijinal metni okuyabilir veya tekrar deneyebilirsin.", "Translation is unavailable. Read the original or try again.", "Përkthimi nuk është i disponueshëm. Lexo origjinalin ose provo sërish."));
    } finally {
      if (generation.current === current) { controller.current = null; setBusy(false); }
    }
  }

  return <div className="forum-translation">
    {visible ? <p className="forum-translation-text" lang={target}>{translated}</p> : children || <p>{text}</p>}
    {Boolean(text.trim()) && <div className="forum-translation-controls">
      <button type="button" disabled={busy} onClick={event => { event.stopPropagation(); void translate(); }}>
        {busy ? copy("Çevriliyor…", "Translating…", "Duke përkthyer…") : visible ? copy("Orijinali göster", "Show original", "Shfaq origjinalin") : copy("Çevir", "Translate", "Përkthe")}
      </button>
      <select aria-label={copy("Çeviri dili", "Translation language", "Gjuha e përkthimit")} value={target} onClick={event => event.stopPropagation()} onChange={event => {
        generation.current++; controller.current?.abort(); controller.current = null;
        setTarget(event.target.value as AppLocale); setVisible(false); setBusy(false); setError("");
      }}>
        <option value="tr">Türkçe</option><option value="en">English</option><option value="sq">Shqip</option>
      </select>
      {visible && <span>{copy("Otomatik çeviri", "Automatic translation", "Përkthim automatik")}</span>}
    </div>}
    {error && <p className="forum-translation-error" role="alert">{error}</p>}
  </div>;
}
