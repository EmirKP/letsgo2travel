import { useEffect, useId, useRef, useState } from "react";
import { countryPracticalInfo, countryTimeDifference } from "../../../lib/travel-assistant/country-practical";
import { evidenceStatus } from "../../../lib/travel-assistant/evidence";
import { CURRENCIES } from "../../../lib/travel-assistant/money";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useI18n } from "../lib/i18n";
import { appCurrencyName, formatAppDate } from "../lib/localeFormatting";
import { openExternal } from "../lib/native";
import { Icon } from "./Icon";
import { CountryFactDiagram } from "./CountryFactDiagram";
import { countryFactClockTime } from "../lib/countryFactClock";
import { CountryGuideHighlights } from "./CountryGuideHighlights";
import "./country-quick-facts.css";

type FactId = "currency" | "plugs" | "emergency" | "driving" | "internet" | "time";
type Source = { label: string; url: string; checkedAt?: string };
type CountryQuickFactsProps = { country: string; countryLabel?: string; onOpenAll?: () => void; onOpenMoney?: (currency: string) => void; onOpenSafety?: () => void; includeLocalAdvice?: boolean };

function FactPictogram({ kind }: {kind:FactId}) {
  return <svg className="country-fact-pictogram" viewBox="0 0 40 40" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "currency" && <><path d="m9 11 18-4v9H9z" fill="var(--fact-icon-soft)"/><rect x="6" y="12" width="27" height="20" rx="5" fill="var(--fact-icon-soft)"/><path d="M27 19h7v8h-7a4 4 0 0 1 0-8Z" fill="var(--fact-icon-accent)"/><path d="M28 23h.01M11 17h9"/></>}
    {kind === "plugs" && <><path d="M14 5v9M25 5v9"/><path d="M10 14h19v6a9.5 9.5 0 0 1-19 0z" fill="var(--fact-icon-soft)"/><path d="M19.5 29v6"/><path d="M16 20h7" stroke="var(--fact-icon-accent)" strokeWidth="3"/></>}
    {kind === "emergency" && <><path d="M13 7 8 10c-3 7 10 22 18 21l5-5-7-6-4 4a25 25 0 0 1-7-8l4-3z" fill="var(--fact-icon-soft)"/><circle cx="29" cy="11" r="7" fill="var(--fact-icon-accent)" stroke="none"/><path d="M29 8v6m-3-3h6"/></>}
    {kind === "driving" && <><path d="m10 17 3-8h14l3 8" fill="var(--fact-icon-soft)"/><rect x="7" y="17" width="26" height="14" rx="4" fill="var(--fact-icon-soft)"/><path d="M11 31v4m18-4v4M16 26h8"/><path d="M11 22h3m12 0h3" stroke="var(--fact-icon-accent)" strokeWidth="3"/></>}
    {kind === "internet" && <><path d="M11 5h14l6 6v22a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="var(--fact-icon-soft)"/><rect x="14" y="18" width="12" height="12" rx="2" fill="var(--fact-icon-accent)"/><path d="M20 18v12m-6-6h12M14 11h6"/></>}
    {kind === "time" && <><circle cx="20" cy="20" r="14" fill="var(--fact-icon-soft)"/><path d="M20 11v9l6 4M20 6v2m14 12h-2M20 34v-2M6 20h2"/><circle cx="20" cy="20" r="2.7" fill="var(--fact-icon-accent)" stroke="none"/></>}
  </svg>;
}

/** A new country starts a fresh disclosure, including its source-opening state. */
export function CountryQuickFacts(props: CountryQuickFactsProps) {
  return <CountryQuickFactsContent key={props.country.trim().toUpperCase()} {...props}/>;
}

function CountryQuickFactsContent({ country, countryLabel, onOpenAll, onOpenMoney, onOpenSafety, includeLocalAdvice = true }: CountryQuickFactsProps) {
  const { locale, copy, dateLocale } = useI18n();
  const noteCopy = (note: {tr:string;en:string;sq?:string} | undefined) => note ? copy(note.tr, note.en, note.sq) : "";
  const info = countryPracticalInfo(country);
  const [selected, setSelected] = useState<FactId | null>(null);
  const [selectedTimeZone, setSelectedTimeZone] = useState("");
  const now = useCurrentTime();
  const [sourceState, setSourceState] = useState<{ url: string; busy: boolean; error: boolean } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cards = useRef<Partial<Record<FactId, HTMLButtonElement>>>({});
  const sourceRequest = useRef(0);
  const id = `country-facts-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const detailId = `${id}-detail`;

  useEffect(() => () => { sourceRequest.current++; }, []);
  useEffect(() => { if (selected) headingRef.current?.focus(); }, [selected]);

  let deviceZone = "";
  try { deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* No guessed device location. */ }
  const timeZones = info.time?.zones || info.availableTimeZones || [];
  const chosenZone = timeZones.includes(selectedTimeZone) ? selectedTimeZone : info.time?.zone;
  const zoneCity = (value: string) => value.split("/").at(-1)?.replaceAll("_", " ") || value;
  const chosenTime = chosenZone ? chosenZone === info.time?.zone ? info.time : {zone:chosenZone,referenceCity:{tr:zoneCity(chosenZone),en:zoneCity(chosenZone),sq:zoneCity(chosenZone)},multipleZones:true,sourceUrl:"https://www.iana.org/time-zones"} : null;
  const difference = deviceZone ? countryTimeDifference({time:chosenTime || null}, deviceZone, now) : null;
  const unknown = copy("Kontrol et", "Check details", "Kontrollo");
  const unknownBody = copy("Bu ülke için doğrulanmış kayıt yok. Seyahatinden önce ülkenin resmî bilgilerini kontrol et.", "There is no verified record for this country. Check official country information before travelling.", "Nuk ka të dhëna të verifikuara për këtë shtet. Kontrollo informacionin zyrtar përpara udhëtimit.");
  const noDate = copy("Kontrol tarihi belirtilmemiş", "Check date not provided", "Data e kontrollit nuk është dhënë");
  const reviewNotice = copy("Bu bilgi için yeniden kontrol zamanı geldi. Kullanmadan önce kaynağını kontrol et.", "This information is due for review. Check the source before using it.", "Ka ardhur koha për rishikimin e informacionit. Kontrollo burimin para përdorimit.");
  const unavailableNotice = copy("Kayıt güncelliği doğrulanamadığı için değer gösterilmiyor. Güncel bilgiyi kaynağından kontrol et.", "The value is hidden because its verification is no longer valid. Check the source for current information.", "Vlera është fshehur sepse verifikimi nuk është i vlefshëm. Kontrollo burimin për informacionin aktual.");
  const sourceStatus = (source: Source) => evidenceStatus({ sourceUrl: source.url, verifiedAt: source.checkedAt || "" }, new Date(now));
  const fieldNote = (field:FactId) => noteCopy(info.context?.[field]?.note);
  const missingBody = (field:FactId) => fieldNote(field) || unknownBody;
  const missingValue = (field:FactId) => {
    const status = info.context?.[field]?.status;
    if (status === "no-universal") return copy("Tek para birimi yok", "No single currency", "Pa monedhë të vetme");
    if (status === "station-specific") return copy("İstasyona göre", "By station", "Sipas stacionit");
    if (status === "site-specific" || status === "local-assistance") return copy("Yerel bilgiye bak", "Local arrangements", "Kushtet lokale");
    if (status === "uninhabited") return copy("Yerleşim yok", "Uninhabited", "Pa banim");
    return unknown;
  };
  const power = info.plugs?.sources.some(source => !["expired", "unverified"].includes(sourceStatus(source))) ? info.plugs : null;
  const driving = info.driving?.sources.some(source => !["expired", "unverified"].includes(sourceStatus(source))) ? info.driving : null;
  const contacts = info.emergency.filter(item => !["expired", "unverified"].includes(evidenceStatus(item, new Date(now))));
  function dateLabel(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? formatAppDate(date, dateLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : noDate;
  }
  function localTime(zone: string) {
    try { return formatAppDate(new Date(now), dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: zone }); } catch { return unknown; }
  }
  function differenceLabel(minutes: number) {
    if (!minutes) return copy("Aynı saat", "Same time", "E njëjta orë");
    const absolute = Math.abs(minutes), hours = Math.floor(absolute / 60), rest = absolute % 60;
    return `${minutes > 0 ? "+" : "−"}${hours ? `${hours} ${copy("sa", "h", "orë")}` : ""}${hours && rest ? " " : ""}${rest ? `${rest} ${copy("dk", "min", "min")}` : ""}`;
  }
  function emergencyLabel(category: string) {
    return ({ general: copy("Genel acil", "General emergency", "Urgjenca e përgjithshme"), police: copy("Polis", "Police", "Policia"), ambulance: copy("Ambulans", "Ambulance", "Ambulanca"), fire: copy("İtfaiye", "Fire", "Zjarrfikësit"), "tourist-police": copy("Turist polisi", "Tourist police", "Policia turistike"), coastguard: copy("Sahil güvenlik", "Coastguard", "Roja bregdetare"), gendarmerie: copy("Jandarma", "Gendarmerie", "Xhandarmëria") } as Record<string, string>)[category] || category;
  }
  function emergencyNote(note: { tr: string; en: string; sq?:string } | undefined) {
    if (!note) return "";
    const albanian: Record<string, string> = {
      "Official guidance recommends 112 if you do not have a Saudi SIM card.": "Udhëzimi zyrtar rekomandon 112 nëse nuk ke kartë SIM saudite.",
      "Use 112 if you do not have a Saudi SIM card.": "Përdor 112 nëse nuk ke kartë SIM saudite.",
      "Police in towns and cities.": "Policia në qytete.",
      "National Guard in rural areas and small villages.": "Garda Kombëtare në zonat rurale dhe fshatrat e vogla.",
      "Emergency lines operate in Vietnamese; language assistance may be needed.": "Linjat e urgjencës shërbejnë në vietnamisht; mund të nevojitet ndihmë gjuhësore.",
      "Number for calls from a mobile phone.": "Numri për telefonata nga telefoni celular.",
    };
    return copy(note.tr, note.en, note.sq || albanian[note.en]);
  }
  const emergency = contacts.find(item => item.category === "general") || contacts[0];
  const mainEmergency = contacts.find(item => item.category === "general");
  const emergencyNumbers = [...new Set(contacts.map(item => item.number))];
  const emergencyValue = mainEmergency?.number || emergencyNumbers.slice(0, 2).join(" / ") || missingValue("emergency");
  const emergencyHint = mainEmergency ? emergencyLabel("general") : emergencyNumbers.slice(0, 2).map(number => contacts.filter(item => item.number === number).map(item => emergencyLabel(item.category)).join(" / ")).join(" · ");
  const internet = info.internet.kind === "operator-options" ? info.internet : null;
  const currencyName = info.currency ? locale === "ro" ? appCurrencyName(info.currency.code, locale) : noteCopy(info.currency.name) || appCurrencyName(info.currency.code, locale) : "";
  const currencyCodes = info.currency?.codes?.length ? info.currency.codes : info.currency ? [info.currency.code] : [];
  const convertibleCurrency = currencyCodes.find(code => CURRENCIES.includes(code));
  const currencySymbol = info.currency?.symbol || "";
  const targetClock = difference ? countryFactClockTime(difference.timeZone, now) : null;
  const deviceClock = deviceZone ? countryFactClockTime(deviceZone, now) : null;
  const emergencySources: Source[] = Array.from(new Map([...info.emergency.map(item => ({ label: copy("Acil numara kaynağı", "Emergency number source", "Burimi i numrit të urgjencës"), url: item.sourceUrl, checkedAt: item.verifiedAt })),...(!info.emergency.length ? info.context?.emergency?.sources || [] : [])].map(source=>[source.url,source])).values());
  const timeCity = noteCopy(difference?.referenceCity) || noteCopy(info.time?.referenceCity) || "";
  const communication = info.communication;
  const powerHint = power ? `${(power.voltages || [power.voltage]).join(" / ")} V · ${power.frequency.join(" / ")} Hz` : copy("Adaptörünü kontrol et", "Check your adapter", "Kontrollo përshtatësin");
  const internetBody = copy("Cihazının eSIM desteğini, SIM kilidini ve operatörünün bu ülkedeki paketini kontrol et. Şebeke kapsaması ve dolaşım ücretleri bölgeye ve operatöre göre değişir.", "Check your device’s eSIM support, SIM lock and your operator’s plan for this country. Coverage and roaming fees vary by area and operator.", "Kontrollo mbështetjen eSIM, kyçjen e SIM-it dhe paketën e operatorit për këtë shtet. Mbulimi dhe tarifat roaming ndryshojnë sipas zonës dhe operatorit.");
  const facts: { id: FactId; label: string; value: string; hint: string; body: string; sources: Source[]; provenance?: string; notice?: string }[] = [
    {
      id: "currency", label: copy("Para birimi", "Currency", "Monedha"), value: currencyCodes.join(" / ") || missingValue("currency"),
      hint: info.currency ? `${currencyName} · ${currencySymbol}` : copy("Yerel ödeme koşulları", "Local payment arrangements", "Kushtet lokale të pagesës"),
      body: info.currency ? copy(`Kayıtlı para birimi: ${currencyCodes.join(" / ")}. Banka ve kartının döviz işlemi ücretlerini ayrıca kontrol et.`, `Listed currency: ${currencyCodes.join(" / ")}. Check exchange and card fees with your bank.`, `Monedha e regjistruar: ${currencyCodes.join(" / ")}. Kontrollo veçmas tarifat e këmbimit dhe të kartës me bankën.`) : missingBody("currency"),
      sources: info.currency ? [...info.currency.sources] : info.context?.currency?.sources || [],
      provenance: fieldNote("currency") || (info.currency && !info.currency.sources.length ? copy("Para birimi ülke kataloğundan alınmıştır. Son kontrol tarihi belirtilmemiş.", "Currency from the country catalogue. Last check date not provided.", "Monedha nga katalogu i shteteve. Data e kontrollit nuk është dhënë.") : undefined),
    },
    {
      id: "plugs", label: copy("Priz ve elektrik", "Plugs & power", "Prizat dhe rryma"), value: power?.types.join(" · ") || missingValue("plugs"), hint: powerHint,
      body: power ? copy("Kayıtlı priz tiplerini ve elektrik değerlerini adaptörünle karşılaştır. Adaptör fiş şeklini değiştirir; voltaj dönüştürücü değildir. Cihazının etiketini kontrol et.", "Compare the listed plug types and power values with your adapter. A plug adapter does not convert voltage. Check your device label.", "Krahaso llojet e prizave dhe vlerat elektrike me përshtatësin. Përshtatësi nuk e ndryshon tensionin. Kontrollo etiketën e pajisjes.") : missingBody("plugs"),
      sources: info.plugs ? [...info.plugs.sources] : info.context?.plugs?.sources || [], provenance: power ? fieldNote("plugs") : undefined,
      notice: info.plugs && !power ? unavailableNotice : info.plugs?.sources.some(source => sourceStatus(source) === "review-due") ? reviewNotice : undefined,
    },
    {
      id: "emergency", label: copy("Acil numaralar", "Emergency", "Urgjenca"), value: emergencyValue,
      hint: emergency ? emergencyHint : copy("Yerel yardım bilgisi", "Local help information", "Informacion lokal për ndihmën"),
      body: emergency ? copy("Numaralar hizmete göre değişebilir. Aşağıda kayıtlı hizmetleri ve kaynaklarını görebilirsin.", "Numbers may differ by service. The listed services and their sources are below.", "Numrat mund të ndryshojnë sipas shërbimit. Shërbimet e regjistruara dhe burimet janë më poshtë.") : missingBody("emergency"),
      sources: emergencySources, provenance: emergency ? fieldNote("emergency") : undefined,
      notice: info.emergency.length && !contacts.length ? unavailableNotice : contacts.some(item => evidenceStatus(item, new Date(now)) === "review-due") ? reviewNotice : undefined,
    },
    {
      id: "driving", label: copy("Trafik yönü", "Driving side", "Ana e drejtimit"), value: driving ? driving.side === "left" ? copy("Soldan", "Left", "Majtas") : copy("Sağdan", "Right", "Djathtas") : missingValue("driving"),
      hint: driving ? driving.side === "left" ? copy("Araçlar yolun solunu kullanır", "Vehicles keep to the left", "Mjetet qëndrojnë majtas") : copy("Araçlar yolun sağını kullanır", "Vehicles keep to the right", "Mjetet qëndrojnë djathtas") : copy("Yerel ulaşım düzeni", "Local transport arrangements", "Rregullat e transportit lokal"),
      body: driving ? (driving.side === "left" ? copy("Trafik yolun solundan akar.", "Traffic drives on the left.", "Trafiku lëviz në anën e majtë.") : copy("Trafik yolun sağından akar.", "Traffic drives on the right.", "Trafiku lëviz në anën e djathtë.")) + " " + copy("Araç kiralamadan önce ehliyet, sigorta ve yerel yol kurallarını ayrıca kontrol et.", "Check licence, insurance and local road rules before hiring a vehicle.", "Kontrollo lejen, sigurimin dhe rregullat vendase para marrjes së një makine.") : missingBody("driving"),
      sources: info.driving ? [...info.driving.sources] : info.context?.driving?.sources || [],
      notice: info.driving && !driving ? unavailableNotice : info.driving?.sources.some(source => sourceStatus(source) === "review-due") ? reviewNotice : undefined,
    },
    {
      id: "internet", label: communication && !internet ? copy("İnternet ve iletişim", "Internet & calling", "Interneti dhe telefonatat") : copy("İnternet", "Internet", "Interneti"),
      value: internet ? internet.operators.slice(0, 2).map(operator => operator.name).join(" · ") : communication?.callingCodes.length ? communication.callingCodes.join(" / ") : communication ? copy("Sefer bağlantısı", "Local arrangements", "Kushtet lokale") : "SIM / eSIM",
      hint: internet ? internet.operators.slice(2).map(operator => operator.name).join(" · ") || copy("Yerel operatör seçenekleri", "Local operator options", "Operatorë vendas") : communication?.callingCodes.length ? copy("Uluslararası arama kodu", "International calling code", "Kodi ndërkombëtar telefonik") : copy("Cihaz ve paket kontrolü", "Check device & plan", "Pajisja dhe paketa"),
      body: noteCopy(communication?.note) || internetBody,
      sources: internet ? [...internet.sources, ...(communication?.sources || [])] : communication?.sources || [],
      provenance: internet ? copy("Yerel operatör örnekleri. Paket, eSIM desteği ve cihaz uyumluluğunu operatörün resmî sayfasından karşılaştır.", "Examples of local operators. Compare plans, eSIM support and device compatibility on their official sites.", "Shembuj operatorësh vendas. Krahaso paketat, eSIM dhe përputhshmërinë në faqet e tyre zyrtare.") : communication ? copy("Arama kodu bir operatör veya eSIM paket önerisi değildir. Bu ülke için operatör örnekleri henüz doğrulanmadı. Paket ve kapsama bilgisini sağlayıcından kontrol et.", "A calling code is not a carrier or eSIM plan recommendation. Operator examples have not yet been verified here. Check plans and coverage with your provider.", "Kodi telefonik nuk është rekomandim operatori ose pakete eSIM. Shembujt e operatorëve këtu ende nuk janë verifikuar. Kontrollo paketën dhe mbulimin me ofruesin.") : copy("Genel kontrol listesi · Ülkeye özel kapsama veya operatör uyumluluğu doğrulanmadı.", "General checklist · Country coverage and operator compatibility have not been verified.", "Listë e përgjithshme kontrolli · Mbulimi dhe përputhshmëria e operatorit nuk janë verifikuar."),
    },
    {
      id: "time", label: copy("Saat farkı", "Time difference", "Diferenca e orës"), value: difference ? differenceLabel(difference.minutes) : missingValue("time"),
      hint: difference ? `${timeCity} ${localTime(difference.timeZone)}` : copy("Yerel saat düzeni", "Local time arrangements", "Kushtet e orës lokale"),
      body: difference ? copy(`${timeCity}: ${localTime(difference.timeZone)}. Bu cihaz: ${localTime(deviceZone)}. Fark, bu cihazın saat dilimine göre ve güncel yaz/kış saatiyle hesaplanır.`, `${timeCity}: ${localTime(difference.timeZone)}. This device: ${localTime(deviceZone)}. The difference uses this device’s time zone and current daylight-saving rules.`, `${timeCity}: ${localTime(difference.timeZone)}. Kjo pajisje: ${localTime(deviceZone)}. Diferenca llogaritet me zonën e pajisjes dhe rregullat aktuale të orës verore.`) : missingBody("time"),
      provenance: difference?.multipleZones ? fieldNote("time") || copy("Ülkede birden fazla saat dilimi var; gideceğin şehri ayrıca kontrol et.", "This country has several time zones; check your destination city separately.", "Ky shtet ka disa zona orare; kontrollo veçmas qytetin ku do të shkosh.") : undefined,
      sources: info.context?.time?.sources || (info.time ? [{ label: "IANA / Intl", url: info.time.sourceUrl }] : []),
    },
  ];
  const detail = facts.find(fact => fact.id === selected);

  function closeDetail() {
    sourceRequest.current++; setSourceState(null); setSelected(null);
    if (selected) cards.current[selected]?.focus();
  }
  function toggleDetail(fact: FactId) {
    if (selected === fact) { closeDetail(); return; }
    sourceRequest.current++; setSourceState(null); setSelected(fact);
  }
  async function openSource(url: string) {
    const request = ++sourceRequest.current;
    setSourceState(previous => ({ url, busy: true, error: previous?.url === url && previous.error }));
    let opened = false;
    try { opened = await openExternal(url); } catch { /* A source failure must remain recoverable. */ }
    if (request === sourceRequest.current) setSourceState({ url, busy: false, error: !opened });
  }

  return <section className="country-quick-facts country-quick-facts--compact" aria-labelledby={`${id}-heading`}>
    <header className="country-quick-facts-heading"><span className="country-guide-marker" aria-hidden="true"><Icon name="compass" size={24}/></span><div><span className="country-guide-eyebrow">{copy("Seyahat bilgileri", "Travel essentials", "Informacione udhëtimi")}</span><h3 id={`${id}-heading`}>{countryLabel || country.toUpperCase()}</h3></div></header>
    <div className="country-quick-facts-grid">{facts.map(fact => <button key={fact.id} ref={node => { if (node) cards.current[fact.id] = node; else delete cards.current[fact.id]; }} type="button" className={`country-fact-card country-fact-${fact.id}`} aria-expanded={selected === fact.id} aria-controls={detailId} onClick={() => toggleDetail(fact.id)}>
      <span className="country-fact-art" aria-hidden="true"><FactPictogram kind={fact.id}/></span>
      <span className="country-fact-label">{fact.label}</span>
      <strong className={fact.value.length > 18 ? "country-fact-value-long" : undefined}>{fact.value}</strong><small>{fact.hint}</small><span className="country-fact-chevron" aria-hidden="true"><Icon name="chevron" size={14}/></span>
    </button>)}</div>
    <section className="country-fact-detail" id={detailId} hidden={!detail} aria-labelledby={`${detailId}-heading`} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeDetail(); } }}>
      {detail && <><div className="country-fact-detail-heading"><h4 id={`${detailId}-heading`} ref={headingRef} tabIndex={-1}>{detail.label}</h4><button type="button" onClick={closeDetail} aria-label={copy("Bilgi ayrıntısını kapat", "Close fact details", "Mbyll hollësitë")}><Icon name="close" size={18}/></button></div>{detail.id === "plugs" && power && <div className="country-fact-detail-visual"><CountryFactDiagram kind="plugs" plugTypes={power.types}/></div>}{detail.id === "driving" && driving && <div className="country-fact-detail-visual"><CountryFactDiagram kind="driving" drivingSide={driving.side}/></div>}{detail.id === "time" && difference && <div className="country-fact-detail-visual"><CountryFactDiagram kind="time" targetClock={targetClock || undefined} deviceClock={deviceClock || undefined} targetLabel={timeCity} deviceLabel={copy("Sen", "You", "Ti")}/></div>}<p>{detail.body}</p>{detail.notice && <p className="country-fact-provenance" role="status">{detail.notice}</p>}
        {detail.id === "emergency" && contacts.length > 0 && <ul className="country-fact-numbers">{contacts.map(item => <li key={`${item.category}-${item.number}`}><div><span>{emergencyLabel(item.category)}</span>{item.note && <small>{emergencyNote(item.note)}</small>}</div><strong>{item.number}</strong></li>)}</ul>}
        {detail.provenance && <p className="country-fact-provenance">{detail.provenance}</p>}
        {detail.id === "time" && difference && <p className="country-fact-provenance">{copy("Hesaplandı: ", "Calculated: ", "Llogaritur: ")}<time dateTime={new Date(now).toISOString()}>{formatAppDate(new Date(now), dateLocale, {day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</time></p>}
        {detail.id === "currency" && onOpenMoney && convertibleCurrency && <button type="button" className="country-fact-action" onClick={() => onOpenMoney(convertibleCurrency)}>{copy("Döviz hesabı yap", "Convert currency", "Konverto monedhën")}{currencyCodes.length > 1 ? ` · ${convertibleCurrency}` : ""}<Icon name="chevron" size={16}/></button>}
        {detail.id === "currency" && info.currency && !convertibleCurrency && <p className="country-fact-provenance" role="status">{copy("Bu para birimi döviz hesaplayıcımızda henüz desteklenmiyor. Başka bir para birimiyle hesap açmıyoruz.", "This currency is not yet supported by our converter. We will not open a different currency instead.", "Kjo monedhë ende nuk mbështetet nga konvertuesi. Nuk hapim një monedhë tjetër në vend të saj.")}</p>}
        {detail.id === "time" && timeZones.length > 1 && <label className="country-fact-zone-select">{copy("Şehir / saat dilimi", "Location / time zone", "Vendi / zona orare")}<select value={chosenZone || ""} onChange={event => setSelectedTimeZone(event.target.value)}>{!chosenZone && <option value="" disabled>{copy("İstasyonunu seç", "Choose your station", "Zgjidh stacionin")}</option>}{timeZones.map(zone=><option key={zone} value={zone}>{zoneCity(zone)} · {zone}</option>)}</select></label>}
        {detail.id === "emergency" && onOpenSafety && <button type="button" className="country-fact-action" onClick={onOpenSafety}>{copy("Acil yardımı aç", "Open emergency help", "Hap ndihmën e urgjencës")}<Icon name="chevron" size={16}/></button>}
        {detail.sources.length > 0 ? <ul className="country-fact-sources">{detail.sources.map(source => <li key={source.url}><button type="button" disabled={!!sourceState?.busy} onClick={() => void openSource(source.url)}>{source.label}<Icon name="external" size={15}/></button><small>{source.checkedAt ? <>{copy("Kontrol: ", "Checked: ", "Kontrolluar: ")}<time dateTime={source.checkedAt}>{dateLabel(source.checkedAt)}</time></> : detail.id === "time" && difference ? <>{copy("Hesaplandı: ", "Calculated: ", "Llogaritur: ")}<time dateTime={new Date(now).toISOString()}>{formatAppDate(new Date(now), dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></> : noDate}</small></li>)}</ul> : !detail.provenance && <p className="country-fact-provenance">{copy("Kaynak ve kontrol tarihi mevcut değil.", "Source and check date are unavailable.", "Burimi dhe data e kontrollit nuk janë të disponueshme.")}</p>}
        {sourceState?.error && <div className="country-fact-source-error" role="alert"><p>{copy("Kaynak açılamadı. İnternet bağlantını kontrol edip tekrar dene.", "Could not open the source. Check your connection and retry.", "Burimi nuk u hap. Kontrollo lidhjen dhe provo sërish.")}</p><button type="button" disabled={sourceState.busy} onClick={() => void openSource(sourceState.url)}><Icon name="refresh" size={16}/>{sourceState.busy ? copy("Açılıyor…", "Opening…", "Duke hapur…") : copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
      </>}
    </section>
    <CountryGuideHighlights country={country} includeLocalAdvice={includeLocalAdvice}/>
    {onOpenAll && <button type="button" className="country-quick-facts-all" onClick={onOpenAll}>{copy("Tüm ülke bilgilerini gör", "See all country information", "Shiko të gjitha informacionet e shtetit")}<Icon name="chevron" size={17}/></button>}
  </section>;
}
