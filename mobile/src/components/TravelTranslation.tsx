import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { TRANSLATION_LANGUAGES, prepareTranslation, translationStatus, translateOffline } from "../lib/offlineTranslation";
import type { TranslationStatus } from "../lib/offlineTranslation";
import { isIOSNative } from "../lib/capacitor";
import { copySupportText } from "../lib/native";
import { deleteSavedTranslation, MAX_SAVED_TRANSLATIONS, readSavedTranslations, saveTranslation } from "../lib/savedTranslations";
import type { TranslationCard } from "../lib/savedTranslations";
import { Sheet } from "./Sheet";
import "./travel-translation.css";

const languageName = (code: string) => TRANSLATION_LANGUAGES.find(([value]) => value === code)?.[1] || code;

export function TravelTranslation({ onPhrases }: { onPhrases: () => void }) {
  const { copy, locale } = useI18n();
  const [source, setSource] = useState("tr");
  const [target, setTarget] = useState("en");
  const [saved, setSaved] = useState(readSavedTranslations);
  const [reuse, setReuse] = useState<{ card: TranslationCard; revision: number } | null>(null);
  const [shown, setShown] = useState<TranslationCard | null>(null);
  const [notice, setNotice] = useState("");
  const [pendingDelete, setPendingDelete] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  function save(card: TranslationCard) {
    try {
      setSaved(saveTranslation(card));
      setNotice(copy("Çeviri bu cihaza kaydedildi.", "Translation saved on this device."));
    } catch (error) {
      setNotice(error instanceof Error && error.message === "full"
        ? copy("Kayıt sınırına ulaştın. Yeni çeviri eklemek için bir kaydı sil.", "Your saved cards are full. Delete one before adding another.")
        : copy("Çeviri kaydedilemedi. Cihaz depolamasını kontrol et; önceki kayıtların korunuyor.", "Could not save. Check device storage; your previous cards are preserved."));
    }
  }
  function remove(id: string) {
    try {
      setSaved(deleteSavedTranslation(id));
      setPendingDelete("");
      setNotice(copy("Kaydedilen çeviri silindi.", "Saved translation deleted."));
    } catch {
      setNotice(copy("Kayıt silinemedi. Tekrar dene.", "Could not delete the card. Try again."));
    }
  }
  function reuseCard(card: TranslationCard) {
    setSource(card.source);
    setTarget(card.target);
    setReuse((previous) => ({ card, revision: (previous?.revision || 0) + 1 }));
    editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  return (
    <section className="ta-panel ta-form ta-translation">
      <h2>{copy("Çevrimdışı çeviri", "Offline translation")}</h2>
      <p>{copy("Önce dil paketlerini internet bağlantısıyla hazırla. Sonraki metin çevirileri cihazında yapılır; metnin sunucuya gönderilmez.", "Prepare language packs while connected. Subsequent translations run on your device; your text is not sent to a server.")}</p>
      <div className="ta-field-pair">
        {(["source", "target"] as const).map((kind) => (
          <label key={kind}>
            {kind === "source" ? copy("Kaynak dil", "From") : copy("Hedef dil", "To")}
            <select value={kind === "source" ? source : target} onChange={(event) => {
              (kind === "source" ? setSource : setTarget)(event.target.value);
              setReuse(null);
            }}>
              {TRANSLATION_LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="secondary-wide" onClick={() => { setSource(target); setTarget(source); setReuse(null); }}>
        {copy("Dilleri değiştir", "Swap languages")}
      </button>
      <div ref={editorRef} className="ta-form ta-translation-editor">
        <TranslationEditor key={`${source}:${target}:${locale}:${reuse?.revision || 0}`} source={source} target={target} initial={reuse?.card} onSave={save} onShow={setShown} />
      </div>
      {notice && <p className="ta-translation-notice" role="status">{notice}</p>}
      {isIOSNative() && <p className="ta-muted">{copy("iOS 18 veya üzeri gerekir. Dil desteği cihazın sistemine bağlıdır. Paketleri Ayarlar → Uygulamalar → Çeviri bölümünden yönetebilirsin.", "Requires iOS 18 or later. Language support depends on your system. Manage packs in Settings → Apps → Translate.")}</p>}
      <button type="button" className="secondary-wide" onClick={onPhrases}>{copy("Hazır seyahat ifadelerini aç", "Open travel phrase cards")}</button>
      <section className="ta-translation-saved" aria-label={copy("Kaydedilen çeviriler", "Saved translations")}>
        <h3>{copy("Kaydedilen çeviriler", "Saved translations")} <small>{saved.length}/{MAX_SAVED_TRANSLATIONS}</small></h3>
        <p className="ta-muted">{copy("Yalnız Kaydet dediğin çeviriler bu cihazda kalır. Hesabına aktarılmaz; uygulama verilerini temizlemek kayıtları siler.", "Only translations you choose to save stay on this device. They do not sync to your account; clearing app data removes them.")}</p>
        {!saved.length && <p className="ta-empty">{copy("Tekrar kullanacağın bir çeviriyi kaydet. Yolculukta internetsiz açıp büyük yazıyla gösterebilirsin.", "Save a translation you will use again. Open it offline and show it in large text while travelling.")}</p>}
        {saved.map((card) => (
          <article className="ta-card" key={card.id}>
            <small>{languageName(card.source)} → {languageName(card.target)}</small>
            <p className="ta-preserve ta-translation-original" lang={card.source} dir="auto">{card.text}</p>
            <p className="ta-preserve" lang={card.target} dir="auto"><strong>{card.translation}</strong></p>
            <div className="ta-actions">
              <button type="button" onClick={() => setShown(card)}>{copy("Büyük göster", "Show large")}</button>
              <button type="button" onClick={() => reuseCard(card)}>{copy("Tekrar kullan", "Use again")}</button>
              <button type="button" onClick={() => setPendingDelete(card.id)}>{copy("Sil", "Delete")}</button>
            </div>
            {pendingDelete === card.id && <div className="ta-translation-confirm">
              <p>{copy("Bu çeviri cihazından silinsin mi?", "Delete this translation from your device?")}</p>
              <div className="ta-actions">
                <button type="button" onClick={() => setPendingDelete("")}>{copy("Vazgeç", "Cancel")}</button>
                <button type="button" onClick={() => remove(card.id)}>{copy("Evet, sil", "Yes, delete")}</button>
              </div>
            </div>}
          </article>
        ))}
      </section>
      <Sheet open={!!shown} title={copy("Çeviriyi göster", "Show translation")} onClose={() => setShown(null)} size="large">
        {shown && <LargeTranslation key={`${shown.source}:${shown.target}:${shown.text}:${shown.translation}`} card={shown} />}
      </Sheet>
    </section>
  );
}

function TranslationEditor({ source, target, initial, onSave, onShow }: {
  source: string; target: string; initial?: TranslationCard;
  onSave: (card: TranslationCard) => void; onShow: (card: TranslationCard) => void;
}) {
  const { copy, locale } = useI18n();
  const [status, setStatus] = useState<TranslationStatus | "checking">("checking");
  const [text, setText] = useState(initial?.text || "");
  const [result, setResult] = useState<TranslationCard | null>(initial || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const running = useRef(false);
  const revision = useRef(0);
  // Results retain the exact text/pair that produced them. Never save against a changed draft.
  const current = result?.source === source && result.target === target && result.text === text.trim() ? result : null;
  useEffect(() => {
    active.current = true;
    void translationStatus(source, target).then((s) => { if (active.current) setStatus(s); }).catch(() => { if (active.current) setStatus("unsupported"); });
    return () => { active.current = false; revision.current++; };
  }, [source, target]);
  async function run(prepare: boolean) {
    if (running.current) return;
    running.current = true;
    const operation = ++revision.current;
    const input = text.trim();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (prepare) {
        const next = await prepareTranslation(source, target, locale);
        if (active.current && operation === revision.current) setStatus(next);
      } else {
        const translation = await translateOffline(source, target, input, locale);
        if (active.current && operation === revision.current) setResult({ source, target, text: input, translation });
      }
    } catch {
      if (active.current && operation === revision.current) setError(copy("İşlem tamamlanamadı. Paket indirmek için Wi-Fi bağlantını, çeviri için paketlerin hazır olduğunu kontrol et.", "Could not complete. Check Wi-Fi for downloads and make sure the language packs are ready before translating."));
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  return <>
    <p role="status">{status === "checking" ? copy("Dil desteği kontrol ediliyor…", "Checking language support…") : status === "installed" ? copy("Dil paketleri hazır. İnternetsiz çevirebilirsin.", "Language packs ready. You can translate offline.") : status === "supported" ? copy("Bu dil çifti için paket indirmek gerekiyor. Wi-Fi kullan; indirme birkaç dakika sürebilir.", "This language pair needs a download. Use Wi-Fi; this can take several minutes.") : copy("Bu cihazda bu dil çifti için çevrimdışı çeviri kullanılamıyor. Hazır ifadeleri veya kayıtlı çevirilerini kullanabilir ya da başka bir dil çifti seçebilirsin.", "Offline translation is unavailable for this language pair on this device. Use phrase cards or saved translations, or choose another pair.")}</p>
    {status === "supported" && <button className="primary-wide" disabled={busy} onClick={() => void run(true)}>{busy ? copy("Paket hazırlanıyor…", "Preparing pack…") : copy("Dil paketlerini indir", "Download language packs")}</button>}
    <label>{copy("Çevrilecek metin", "Text to translate")}
      <textarea rows={4} maxLength={2000} value={text} disabled={busy} lang={source} dir="auto" onChange={(event) => { revision.current++; setText(event.target.value); setResult(null); setError(""); }} />
    </label>
    <small>{text.length}/2000</small>
    <button className="primary-wide" disabled={busy || status !== "installed" || !text.trim() || source === target} onClick={() => void run(false)}>{busy ? copy("İşleniyor…", "Working…") : copy("Cihazda çevir", "Translate on device")}</button>
    {error && <p role="alert" className="ta-warning">{error}</p>}
    {current && <article className="ta-card" aria-live="polite">
      <h3>{copy("Çeviri", "Translation")}</h3>
      <p className="ta-preserve" lang={target} dir="auto">{current.translation}</p>
      <small>{copy("Otomatik çeviri hata içerebilir.", "Automatic translations may contain errors.")}</small>
      <div className="ta-actions">
        <button type="button" onClick={() => onSave(current)}>{copy("Cihaza kaydet", "Save on device")}</button>
        <button type="button" onClick={() => onShow(current)}>{copy("Büyük göster / kopyala", "Show large / copy")}</button>
      </div>
    </article>}
  </>;
}

function LargeTranslation({ card }: { card: TranslationCard }) {
  const { copy } = useI18n();
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState(false);
  return <div className="ta-translation-large">
    <p className="ta-translation-language">{languageName(card.target)}</p>
    <p className="ta-translation-display" lang={card.target} dir="auto">{card.translation}</p>
    <p className="ta-translation-original" lang={card.source} dir="auto">{card.text}</p>
    <p className="ta-muted">{copy("Otomatik çeviri hata içerebilir.", "Automatic translations may contain errors.")}</p>
    <button type="button" className="primary-wide" onClick={() => void copySupportText(card.translation).then((copied) => {
      setManual(!copied);
      setNotice(copied ? copy("Çeviri kopyalandı.", "Translation copied.") : copy("Aşağıdaki metne dokunup seçerek kopyalayabilirsin.", "Tap and select the text below to copy it."));
    })}>{copy("Çeviriyi kopyala", "Copy translation")}</button>
    {notice && <p role="status">{notice}</p>}
    {manual && <label>{copy("Kopyalanacak çeviri", "Translation to copy")}<textarea readOnly value={card.translation} lang={card.target} dir="auto" onFocus={(event) => event.currentTarget.select()} /></label>}
  </div>;
}
