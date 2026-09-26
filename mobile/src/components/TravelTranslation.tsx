import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import {
  TRANSLATION_LANGUAGES,
  prepareTranslation,
  translationStatus,
  translateOffline,
} from "../lib/offlineTranslation";
import type { TranslationStatus } from "../lib/offlineTranslation";
import { isIOSNative } from "../lib/capacitor";

export function TravelTranslation({ onPhrases }: { onPhrases: () => void }) {
  const { copy, locale } = useI18n();
  const [source, setSource] = useState("tr");
  const [target, setTarget] = useState("en");
  // A separate keyed editor prevents a late translation from appearing for a new pair.
  return (
    <section className="ta-panel ta-form">
      <h2>{copy("Çevrimdışı çeviri", "Offline translation")}</h2>
      <p>
        {copy(
          "Önce dil paketlerini internet bağlantısıyla hazırla. Sonraki metin çevirileri cihazında yapılır; metnin sunucuya gönderilmez.",
          "Prepare language packs while connected. Subsequent translations run on your device; your text is not sent to a server.",
        )}
      </p>
      <div className="ta-field-pair">
        {(["source", "target"] as const).map((kind) => (
          <label key={kind}>
            {kind === "source"
              ? copy("Kaynak dil", "From")
              : copy("Hedef dil", "To")}
            <select
              value={kind === "source" ? source : target}
              onChange={(e) =>
                (kind === "source" ? setSource : setTarget)(e.target.value)
              }
            >
              {TRANSLATION_LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="secondary-wide"
        onClick={() => {
          setSource(target);
          setTarget(source);
        }}
      >
        {copy("Dilleri değiştir", "Swap languages")}
      </button>
      <TranslationEditor
        key={`${source}:${target}:${locale}`}
        source={source}
        target={target}
      />
      {isIOSNative() && (
        <p className="ta-muted">
          {copy(
            "iOS 18 veya üzeri gerekir. Dil desteği cihazın sistemine bağlıdır. Paketleri Ayarlar → Uygulamalar → Çeviri bölümünden yönetebilirsin.",
            "Requires iOS 18 or later. Language support depends on your system. Manage packs in Settings → Apps → Translate.",
          )}
        </p>
      )}
      <button type="button" className="secondary-wide" onClick={onPhrases}>
        {copy("Hazır seyahat ifadelerini aç", "Open travel phrase cards")}
      </button>
    </section>
  );
}
function TranslationEditor({
  source,
  target,
}: {
  source: string;
  target: string;
}) {
  const { copy, locale } = useI18n();
  const [status, setStatus] = useState<TranslationStatus | "checking">(
    "checking",
  );
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void translationStatus(source, target)
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        if (active) setStatus("unsupported");
      });
    return () => {
      active = false;
    };
  }, [source, target]);
  async function run(prepare: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      if (prepare) setStatus(await prepareTranslation(source, target, locale));
      else setResult(await translateOffline(source, target, text, locale));
    } catch {
      setError(
        copy(
          "İşlem tamamlanamadı. Paket indirmek için Wi-Fi bağlantını, çeviri için paketlerin hazır olduğunu kontrol et.",
          "Could not complete. Check Wi-Fi for downloads and make sure the language packs are ready before translating.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p role="status">
        {status === "checking"
          ? copy("Dil desteği kontrol ediliyor…", "Checking language support…")
          : status === "installed"
            ? copy(
                "Dil paketleri hazır. İnternetsiz çevirebilirsin.",
                "Language packs ready. You can translate offline.",
              )
            : status === "supported"
              ? copy(
                  "Bu dil çifti için paket indirmek gerekiyor. Wi-Fi kullan; indirme birkaç dakika sürebilir.",
                  "This language pair needs a download. Use Wi-Fi; this can take several minutes.",
                )
              : copy(
                  "Bu cihazda bu dil çifti için çevrimdışı çeviri kullanılamıyor. Hazır ifadeleri kullanabilir veya başka bir dil çifti seçebilirsin.",
                  "Offline translation is unavailable for this language pair on this device. Use phrase cards or choose another pair.",
                )}
      </p>
      {status === "supported" && (
        <button
          className="primary-wide"
          disabled={busy}
          onClick={() => void run(true)}
        >
          {busy
            ? copy("Paket hazırlanıyor…", "Preparing pack…")
            : copy("Dil paketlerini indir", "Download language packs")}
        </button>
      )}
      <label>
        {copy("Çevrilecek metin", "Text to translate")}
        <textarea
          rows={4}
          maxLength={2000}
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setResult("");
          }}
        />
      </label>
      <small>{text.length}/2000</small>
      <button
        className="primary-wide"
        disabled={busy || status !== "installed" || !text.trim()}
        onClick={() => void run(false)}
      >
        {busy
          ? copy("İşleniyor…", "Working…")
          : copy("Cihazda çevir", "Translate on device")}
      </button>
      {error && (
        <p role="alert" className="ta-warning">
          {error}
        </p>
      )}
      {result && (
        <article className="ta-card" aria-live="polite">
          <h3>{copy("Çeviri", "Translation")}</h3>
          <p className="ta-preserve" lang={target}>
            {result}
          </p>
          <small>
            {copy(
              "Otomatik çeviri hata içerebilir.",
              "Automatic translations may contain errors.",
            )}
          </small>
        </article>
      )}
    </>
  );
}
