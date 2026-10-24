import { useEffect, useRef, useState } from "react";
import { GUIDE_CARDS } from "../../../lib/travel-assistant/guides";
import { evidenceStatus } from "../../../lib/travel-assistant/evidence";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useI18n } from "../lib/i18n";
import { formatAppDate } from "../lib/localeFormatting";
import { openExternal } from "../lib/native";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import "./country-guide-highlights.css";

type Props = { country: string; onOpenDetails?: () => void; includeLocalAdvice?: boolean };
type SourceState = { url: string; busy: boolean; error: boolean } | null;

/** Only shorten at a sentence boundary; never turn a qualified fact into a fragment. */
function firstSentence(value: string) {
  const sentence = value.trim().match(/^.*?[.!?](?=\s|$)/s)?.[0];
  return sentence || value.trim();
}

export function CountryGuideHighlights(props: Props) {
  return <CountryGuideHighlightsContent key={props.country.trim().toUpperCase()} {...props}/>;
}

function CountryGuideHighlightsContent({ country, onOpenDetails, includeLocalAdvice = true }: Props) {
  const { locale, copy } = useI18n();
  const now = useCurrentTime();
  const [sourceState, setSourceState] = useState<SourceState>(null);
  const sourceRequest = useRef(0);
  useEffect(() => () => { sourceRequest.current++; }, []);
  const code = country.trim().toUpperCase();
  const topics = ["water", "tax-free", "culture", "law", "hours"] as const;
  const cards = topics.flatMap(category => {
    if (!includeLocalAdvice && (category === 'law' || category === 'culture')) return [];
    const card = GUIDE_CARDS.find(item => item.country === code && item.category === category && !["expired", "unverified"].includes(evidenceStatus(item, new Date(now))));
    return card ? [card] : [];
  }).slice(0, 3);
  if (!cards.length) return null;
  const labels = {
    water: copy("Musluk suyu", "Tap water", "Uji i rubinetit"),
    "tax-free": "Tax Free",
    culture: copy("Yerel yaşam", "Local customs", "Zakonet vendase"),
    law: copy("Yerel kurallar", "Local rules", "Rregullat vendase"),
    hours: copy("Günlük saatler", "Daily hours", "Oraret e përditshme"),
  };
  const icons: Record<(typeof topics)[number], IconName> = { water: "info", "tax-free": "wallet", culture: "globe", law: "shield", hours: "clock" };
  const dateLocale = locale === "sq" ? "sq-AL" : locale === "tr" ? "tr-TR" : "en-GB";
  async function openSource(url: string) {
    const request = ++sourceRequest.current;
    setSourceState(previous => ({ url, busy: true, error: previous?.url === url && previous.error }));
    let opened = false;
    try { opened = await openExternal(url); } catch { /* Keep a failed source recoverable. */ }
    if (request === sourceRequest.current) setSourceState({ url, busy: false, error: !opened });
  }

  return <section className="country-guide-highlights" aria-label={copy("Bu ülkede bilmen iyi olur", "Good to know here", "Mirë ta dish për këtë shtet")}>
    <header><p>{copy("KÜÇÜK NOTLAR, RAHAT BİR YOLCULUK", "SMALL DETAILS, EASIER TRAVELS", "DETAJE TË VOGLA, UDHËTIM MË I LEHTË")}</p><h3>{copy("Bu ülkede bilmen iyi olur", "Good to know here", "Mirë ta dish për këtë shtet")}</h3></header>
    <div className="country-guide-highlight-list">{cards.map(card => {
      const language = locale === "tr" ? "tr" : locale === "sq" && card.title.sq && card.text.sq ? "sq" : "en";
      const fallback = locale === "sq" && language === "en";
      const status = evidenceStatus(card, new Date(now));
      const sourceHost = card.sourceUrl.replace(/^https?:\/\//, "").split("/")[0];
      const failed = sourceState?.url === card.sourceUrl && sourceState.error;
      return <article key={`${card.category}:${card.title.en}`} className="country-guide-highlight">
        <span className="country-guide-highlight-icon" aria-hidden="true"><Icon name={icons[card.category]} size={22}/></span>
        <div className="country-guide-highlight-content"><span className="country-guide-highlight-topic">{labels[card.category]}</span>
          <h4 lang={language}>{card.title[language]}</h4>
          {fallback && <p className="country-guide-highlight-language" lang="sq">{copy("", "", "Ky shënim ende shfaqet në anglisht.")}</p>}
          <p className="country-guide-highlight-summary" lang={language}>{firstSentence(card.text[language]!)}</p>
          {status === "review-due" && <p className="country-guide-highlight-review" role="status">{copy("Yeniden kontrol zamanı geldi. Kullanmadan önce kaynağı kontrol et.", "Due for review. Check the source before using this information.", "Ka ardhur koha për rishikim. Kontrollo burimin para përdorimit.")}</p>}
          <div className="country-guide-highlight-meta"><button type="button" disabled={!!sourceState?.busy} onClick={() => void openSource(card.sourceUrl)}>{sourceHost}<Icon name="external" size={13}/></button><span>{copy("Kontrol: ", "Checked: ", "Kontrolluar: ")}<time dateTime={card.verifiedAt}>{formatAppDate(new Date(`${card.verifiedAt}T00:00:00Z`), dateLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time></span></div>
          {card.validUntil && <p className="country-guide-highlight-validity">{copy("Kapsadığı son tarih: ", "Applies through: ", "Vlen deri më: ")}<time dateTime={card.validUntil}>{formatAppDate(new Date(`${card.validUntil}T00:00:00Z`), dateLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time></p>}
          {failed && <div className="country-guide-highlight-error" role="alert"><p>{copy("Kaynak açılamadı. Bağlantını kontrol edip tekrar dene.", "Could not open the source. Check your connection and retry.", "Burimi nuk u hap. Kontrollo lidhjen dhe provo sërish.")}</p><button type="button" disabled={sourceState.busy} onClick={() => void openSource(card.sourceUrl)}>{sourceState.busy ? copy("Açılıyor…", "Opening…", "Duke hapur…") : copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
          {onOpenDetails && <button type="button" className="country-guide-highlight-more" onClick={onOpenDetails}>{copy("Ayrıntıları aç", "Open details", "Hap hollësitë")}<Icon name="chevron" size={15}/></button>}
        </div>
      </article>;
    })}</div>
  </section>;
}
