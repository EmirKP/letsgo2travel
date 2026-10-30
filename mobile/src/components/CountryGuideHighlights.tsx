import { useEffect, useId, useRef, useState } from "react";
import { GUIDE_CARDS } from "../../../lib/travel-assistant/guides";
import { dateStamp, evidenceStatus } from "../../../lib/travel-assistant/evidence";
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

function hasBusinessHoursCaution(value: string, language: 'tr' | 'en' | 'sq') {
  const text=value.toLocaleLowerCase(language);
  if(language==='tr')return /işletm|mağaza/u.test(text)&&/kontrol et|doğrula|gerçekten|göre değiş|tekil/u.test(text);
  if(language==='sq')return /biznes|konkret|secil|dyqan|orarin e bank/u.test(text)&&/kontrollo|verifiko|ndryshojnë|orari real/u.test(text);
  return /business|particular|individual|venue|shop[’']s actual/u.test(text)&&/check|verify|confirm|actual schedule|hours vary/u.test(text);
}

export function CountryGuideHighlights(props: Props) {
  return <CountryGuideHighlightsContent key={props.country.trim().toUpperCase()} {...props}/>;
}

function CountryGuideHighlightsContent({ country, includeLocalAdvice = true }: Props) {
  const { locale, copy } = useI18n();
  const now = useCurrentTime();
  const [sourceState, setSourceState] = useState<SourceState>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const contentId = useId();
  const sourceRequest = useRef(0);
  useEffect(() => () => { sourceRequest.current++; }, []);
  const code = country.trim().toUpperCase();
  const topics = ["water", "tax-free", "culture", "law", "hours"] as const;
  const seen = new Set<string>();
  const cards = topics.flatMap(category => {
    if (!includeLocalAdvice && (category === 'law' || category === 'culture')) return [];
    return GUIDE_CARDS.filter(item => item.country === code && item.category === category).flatMap(card => {
      const key=JSON.stringify([card.country,card.category,card.sourceUrl,card.title,card.text,card.verifiedAt,card.reviewAfter||null,card.validUntil||null,card.status||null]);
      if(seen.has(key))return [];
      seen.add(key);return [{card,key}];
    });
  });
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
  const dateLabel = (value:string) => dateStamp(value) === null
    ? copy("Doğrulanamadı", "Unverified", "E paverifikuar")
    : formatAppDate(new Date(`${value}T00:00:00Z`), dateLocale, {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
  async function openSource(url: string) {
    const request = ++sourceRequest.current;
    setSourceState(previous => ({ url, busy: true, error: previous?.url === url && previous.error }));
    let opened = false;
    try { opened = await openExternal(url); } catch { /* Keep a failed source recoverable. */ }
    if (request === sourceRequest.current) setSourceState({ url, busy: false, error: !opened });
  }

  return <section className="country-guide-highlights" aria-label={copy("Bu ülkede bilmen iyi olur", "Good to know here", "Mirë ta dish për këtë shtet")}>
    <header><p>{copy("KÜÇÜK NOTLAR, RAHAT BİR YOLCULUK", "SMALL DETAILS, EASIER TRAVELS", "DETAJE TË VOGLA, UDHËTIM MË I LEHTË")}</p><h3>{copy("Bu ülkede bilmen iyi olur", "Good to know here", "Mirë ta dish për këtë shtet")}</h3></header>
    <div className="country-guide-highlight-list">{cards.map(({card,key},index) => {
      const language = locale === "tr" ? "tr" : locale === "sq" && card.title.sq && card.text.sq ? "sq" : "en";
      const fallback = locale === "sq" && language === "en";
      const status = evidenceStatus(card, new Date(now));
      const usable = status !== "expired" && status !== "unverified";
      const fullText=card.text[language]!.trim(),preview=firstSentence(fullText);
      const hoursNote=card.category==='hours'&&!hasBusinessHoursCaution(fullText,language);
      const hasDetails=usable&&(fullText!==preview||hoursNote);
      const isExpanded=hasDetails&&expanded.includes(key);
      const textId=`${contentId}-${index}`;
      const sourceHost = card.sourceUrl.replace(/^https?:\/\//, "").split("/")[0];
      const failed = sourceState?.url === card.sourceUrl && sourceState.error;
      return <article key={key} className="country-guide-highlight">
        <span className="country-guide-highlight-icon" aria-hidden="true"><Icon name={icons[card.category]} size={22}/></span>
        <div className="country-guide-highlight-content">{usable&&<span className="country-guide-highlight-topic">{labels[card.category]}</span>}
          <h4 lang={usable?language:locale}>{usable?card.title[language]:labels[card.category]}</h4>
          {usable&&fallback && <p className="country-guide-highlight-language" lang="sq">{copy("", "", "Ky shënim ende shfaqet në anglisht.")}</p>}
          {usable ? <p id={textId} className={isExpanded?"country-guide-highlight-full":"country-guide-highlight-summary"} lang={language}>{isExpanded?fullText:preview}</p>
            : <p className="country-guide-highlight-review" role="status">{status==='expired'
              ? copy("Bu bilginin geçerlilik süresi doldu. Güncel koşulları resmî kaynaktan kontrol et.","This information has expired. Check current conditions with the official source.","Këtij informacioni i ka mbaruar vlefshmëria. Kontrollo kushtet aktuale te burimi zyrtar.")
              : copy("Bu bilgi doğrulanamıyor. Kullanmadan önce resmî kaynağı kontrol et.","This information cannot be verified. Check the official source before use.","Ky informacion nuk mund të verifikohet. Kontrollo burimin zyrtar para përdorimit.")}</p>}
          {isExpanded&&hoursNote&&<small className="country-guide-highlight-hours-note">{copy("Genel saatler, belirli bir işletmenin açık olduğu anlamına gelmez.","General hours do not mean a particular business is open.","Oraret e përgjithshme nuk tregojnë se një biznes i caktuar është i hapur.")}</small>}
          {status === "review-due" && <p className="country-guide-highlight-review" role="status">{copy("Yeniden kontrol zamanı geldi. Kullanmadan önce kaynağı kontrol et.", "Due for review. Check the source before using this information.", "Ka ardhur koha për rishikim. Kontrollo burimin para përdorimit.")}</p>}
          <div className="country-guide-highlight-meta"><button type="button" disabled={!!sourceState?.busy} onClick={() => void openSource(card.sourceUrl)}>{sourceHost}<Icon name="external" size={13}/></button><span>{copy("Kontrol: ", "Checked: ", "Kontrolluar: ")}<time dateTime={dateStamp(card.verifiedAt)===null?undefined:card.verifiedAt}>{dateLabel(card.verifiedAt)}</time></span></div>
          {card.validUntil && <p className="country-guide-highlight-validity">{copy("Kapsadığı son tarih: ", "Applies through: ", "Vlen deri më: ")}<time dateTime={dateStamp(card.validUntil)===null?undefined:card.validUntil}>{dateLabel(card.validUntil)}</time></p>}
          {failed && <div className="country-guide-highlight-error" role="alert"><p>{copy("Kaynak açılamadı. Bağlantını kontrol edip tekrar dene.", "Could not open the source. Check your connection and retry.", "Burimi nuk u hap. Kontrollo lidhjen dhe provo sërish.")}</p><button type="button" disabled={sourceState.busy} onClick={() => void openSource(card.sourceUrl)}>{sourceState.busy ? copy("Açılıyor…", "Opening…", "Duke hapur…") : copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
          {hasDetails&&<button type="button" className="country-guide-highlight-more" aria-expanded={isExpanded} aria-controls={textId} onClick={()=>setExpanded(previous=>previous.includes(key)?previous.filter(item=>item!==key):[...previous,key])}>{isExpanded?copy("Daha az göster","Show less","Shfaq më pak"):copy("Devamını oku","Read more","Lexo më shumë")}<Icon name="chevron" size={15}/></button>}
        </div>
      </article>;
    })}</div>
  </section>;
}
