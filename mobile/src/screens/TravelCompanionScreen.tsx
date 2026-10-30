import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { CompanionShortcutArtwork } from "../components/CompanionShortcutArtwork";
import { CountryPicker } from "../components/CountryPicker";
import type { Coordinates, PointCategory } from "../../../lib/travel-assistant/types";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import { TRAVEL_ESSENTIALS, essentialProfile, fallbackEssentialProfile } from "../data/travelEssentials";
import { useI18n } from "../lib/i18n";
import { readTravelCountry, selectTravelCountry } from "../lib/travelSelection";
import { type EventSearchContext } from "../lib/eventSearchContext";
import { EvidenceLine } from "../components/TravelSafety";
import type { ViewId } from "../types";
import type { TravelAssistantTool } from "../lib/appTools";
import "./companion-usability.css";
import "../components/feature-entry-artwork.css";

const TravelAssistant = lazy(() => import("../components/TravelAssistant").then(m => ({ default: m.TravelAssistant })));

const MapNearbyIdeas=lazy(()=>import('../components/MapNearbyIdeas').then(m=>({default:m.MapNearbyIdeas})));

type CompanionTab = "assistant" | "now" | "phrases" | "etiquette";

const SPEECH_LANG: Record<string, string> = {
  XK: "sq-AL", AL: "sq-AL", BA: "bs-BA", RS: "sr-RS", DE: "de-DE", IT: "it-IT", FR: "fr-FR",
  ES: "es-ES", PT: "pt-PT", NL: "nl-NL", GR: "el-GR", JP: "ja-JP", KR: "ko-KR", TH: "th-TH",
  AE: "ar-AE", GE: "ka-GE", AZ: "az-AZ", BR: "pt-BR", GB: "en-GB",
};

const LANGUAGE_NAMES_SQ: Record<string, string> = {"Albanian": "Shqip", "German": "Gjermanisht", "Italian": "Italisht", "French": "Frëngjisht", "Spanish": "Spanjisht", "Japanese": "Japonisht", "Thai": "Tajlandisht", "English": "Anglisht", "Bosnian": "Boshnjakisht", "Serbian": "Serbisht", "Portuguese": "Portugalisht", "Dutch": "Holandisht", "Greek": "Greqisht", "Korean": "Koreanisht", "Arabic": "Arabisht", "Georgian": "Gjeorgjisht", "Azerbaijani": "Azerbajxhanisht", "English emergency fallback": "Fraza urgjence në anglisht"};
const PHRASE_MEANINGS_SQ: Record<string, string> = {"help": "Kam nevojë për ndihmë.", "hospital": "Duhet të shkoj në spital.", "allergy": "A ka alergjenë në këtë ushqim?", "airport": "Dua të shkoj në aeroport.", "bill": "A mund ta marr faturën, ju lutem?", "hello": "Përshëndetje.", "police": "Telefononi policinë.", "directions": "Si mund të shkoj këtu?", "price": "Sa kushton kjo?"};

export function TravelCompanionScreen({ initialTab = "assistant", initialTool, initialCountry = '', onOpenEvents, onNavigate, onNotice, accessToken, onSignIn, ownerId }: {
  initialTab?: CompanionTab;
  initialTool?: TravelAssistantTool;
  initialCountry?: string;
  accessToken: string;
  ownerId?: string | null;
  onSignIn: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenEvents?: (context: EventSearchContext) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, copy, countryName } = useI18n();
  const [tab, setTab] = useState<CompanionTab>(initialTab);
  const [countryCode, setCountryCode] = useState(() => initialCountry || readTravelCountry());
  const [requestedTool,setRequestedTool]=useState<{tool:TravelAssistantTool|undefined;id:number}|null>(null);
  const toolRequestId=useRef(0);
  const [activeTool,setActiveTool]=useState<TravelAssistantTool|null>(initialTool||null);
  const [nearbySearch,setNearbySearch]=useState<{id:number;query:string;center:Coordinates;category?:PointCategory}>();
  const nearbySearchId=useRef(0);
  const supportedProfiles = useMemo(() => new Map(TRAVEL_ESSENTIALS.map((item) => [item.code, item])), []);
  const countryOptions = useMemo(() => COUNTRY_LIST.map((country) => {
    const code = alpha2FromAlpha3(country.alpha3);
    const supported = supportedProfiles.get(code);
    return {
      code,
      flagCode: code,
      name: countryName(country.alpha3, country.name),
      meta: supported
        ? copy(supported.languageTr, supported.languageEn, LANGUAGE_NAMES_SQ[supported.languageEn])
        : copy("İngilizce acil kart", "English emergency fallback"),
      supported: Boolean(supported),
    };
  }).filter((country) => country.code).sort((a, b) => Number(b.supported) - Number(a.supported) || a.name.localeCompare(b.name, locale)), [copy, countryName, locale, supportedProfiles]);
  const selectedCountry = useMemo(() => countryOptions.find((country) => country.code === countryCode), [countryCode, countryOptions]);
  const profile = useMemo(() => essentialProfile(countryCode)
    || fallbackEssentialProfile(countryCode, selectedCountry?.name || countryCode, flagEmoji(countryCode)), [countryCode, selectedCountry?.name]);

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(()=>setRequestedTool(null),[initialTool,initialTab]);
  useEffect(() => {
    if (!initialCountry) return;
    setCountryCode(initialCountry);
    selectTravelCountry(initialCountry);
  }, [initialCountry]);
  const focusSection = (item: CompanionTab) => {
    // Only a deliberate section click moves focus. Reactivating a retained
    // screen, changing country or changing language must keep its scroll.
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const screen = document.querySelector<HTMLElement>(".companion-screen");
      if (screen?.dataset.section !== item) return;
      const heading = screen.querySelector<HTMLElement>(item === "assistant" ? ".ta-directory-title" : "#companion-section-title") || screen;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };

  const openSection = (item: CompanionTab) => {
    const selected = readTravelCountry();
    if (selected) setCountryCode(selected);
    if(item==='assistant')setRequestedTool({tool:undefined,id:++toolRequestId.current});
    setTab(item);
    focusSection(item);
  };
  const openCountryGuide=()=>{
    const selected=readTravelCountry();
    if(selected)setCountryCode(selected);
    setRequestedTool({tool:'guide',id:++toolRequestId.current});
    setTab('assistant');
  };

  const tabLabel = (value: CompanionTab) => ({
    assistant: copy("Araçlar", "Tools"),
    now: copy("Yakınımda", "Around me"),
    phrases: copy("Hazır ifadeler", "Useful phrases"),
    etiquette: copy("Yerel ipuçları", "Local tips"),
  })[value];
  const tabDescription = (value: CompanionTab) => ({
    assistant: copy("Harita, çeviri ve yolculukta gerekenler.", "Maps, translation and travel essentials."),
    now: copy("Havaya ve sana uyan bir sonraki molayı bul.", "Find your next stop to suit you and the weather."),
    phrases: copy("Konuş, kopyala veya dinlet. İfadeler internetsiz de yanında.", "Read, copy or play a phrase. The cards work offline too."),
    etiquette: copy("Yerel alışkanlıkları ve dikkat etmen gerekenleri öğren.", "Get to know local customs and useful guidance."),
  })[value];

  const copyPhrase = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(copy("İfade kopyalandı.", "Phrase copied."));
    } catch {
      onNotice(copy("İfade kopyalanamadı.", "Phrase could not be copied."));
    }
  };

  const speak = (value: string) => {
    if (!("speechSynthesis" in window)) {
      onNotice(copy("Sesli okuma bu cihazda desteklenmiyor.", "Speech playback is not supported on this device."));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = SPEECH_LANG[profile.code] || "en-US";
    utterance.rate = .78;
    window.speechSynthesis.speak(utterance);
  };

  const nearbyIdeas=<MapNearbyIdeas countryCode={countryCode} onOpenEvents={onOpenEvents} onNotice={onNotice} onSearch={(query,center,category)=>setNearbySearch({id:++nearbySearchId.current,query,center,category})}/>;

  return <div className="screen companion-screen" data-section={tab} tabIndex={-1}>
    {tab !== "assistant" && tab !== "now" && <header className="companion-section-header">
        <button type="button" onClick={() => openSection("assistant")}><Icon name="back" size={18} />{tabLabel("assistant")}</button>
        <span className="companion-section-symbol" aria-hidden="true"><CompanionShortcutArtwork kind={tab === 'phrases' ? 'phrases' : 'etiquette'} size={56} /></span>
        <h1 id="companion-section-title" tabIndex={-1}>{tabLabel(tab)}</h1><p>{tabDescription(tab)}</p>
      </header>}

    {(tab === "assistant" || tab === "now") && <Suspense fallback={<p role="status">{copy("Asistan açılıyor…", "Opening assistant…")}</p>}><TravelAssistant initialCountry={countryCode} initialTool={tab === "now" ? "nearby" : requestedTool ? requestedTool.tool : initialTool} toolRequestId={requestedTool?.id||0} onToolChange={setActiveTool} nearbyIdeas={nearbyIdeas} nearbySearch={nearbySearch} onNearbySearchHandled={id=>setNearbySearch(current=>current?.id===id?undefined:current)} ownerId={ownerId} accessToken={accessToken} onSignIn={onSignIn} onNavigate={onNavigate} onNotice={onNotice} onPhrases={code => { if (code) { setCountryCode(code); selectTravelCountry(code); } setTab("phrases"); focusSection("phrases"); }} onLocalTips={code => { if (code) { setCountryCode(code); selectTravelCountry(code); } setTab("etiquette"); focusSection("etiquette"); }} /></Suspense>}


    {(tab === "phrases" || tab === "etiquette") && <section className="companion-panel" aria-label={tabLabel(tab)}>
      <CountryPicker value={countryCode} options={countryOptions} onChange={code => { setCountryCode(code); selectTravelCountry(code); }} label={copy("Gideceğin ülke", "Destination")} placeholder={copy("Ülke seç", "Choose a country")} />
      {!countryCode && <p className="ta-muted">{copy('İfadeleri ve yerel bilgileri görmek için gideceğin ülkeyi seç.', 'Choose your destination to see its phrases and local guidance.', 'Zgjidh destinacionin për të parë shprehjet dhe këshillat vendase.')}</p>}
      {countryCode && <>
      {supportedProfiles.has(countryCode) && <p className="essential-language-note"><Icon name="offline" size={15} /> {tab === "phrases"
        ? copy(`${profile.languageTr} ifadeler cihazda hazır`, `${profile.languageEn} phrases ready offline`, `Fraza gati pa internet: ${LANGUAGE_NAMES_SQ[profile.languageEn] || profile.languageEn}`)
        : copy("Yerel kurallar cihazda hazır", "Local guidance ready offline")}</p>}
      {!supportedProfiles.has(countryCode) && <div className="essential-fallback-note" role="status"><Icon name="info" size={16} /><p>{tab === 'phrases' ? copy("Bu ülke seçilebilir ve kartlar çevrimdışı çalışır; yerel çeviri hazır olana kadar İngilizce acil ifadeler gösterilir.", "This country is available and the cards work offline; English emergency phrases are shown until its local translation is ready.") : copy('Bu ülke için genel seyahat önerileri gösteriliyor. Yerel kuralları resmî ülke rehberinden doğrula.', 'Showing general travel guidance for this country. Check local rules in its official country advice.', 'Shfaqen këshilla të përgjithshme udhëtimi. Verifiko rregullat vendase në udhëzuesin zyrtar të shtetit.')}</p></div>}
      {locale === "sq" && tab === "etiquette" && profile.etiquette.some(rule => !rule.sq) && <p className="essential-language-note" lang="sq">Disa këshilla lokale ende shfaqen në anglisht; përkthimi i tyre në shqip nuk është ende i disponueshëm.</p>}
      {tab === "phrases" ? <div className="phrase-list">{profile.phrases.map((phrase) => <article key={phrase.id}>
        <small>{copy(phrase.tr, phrase.en, PHRASE_MEANINGS_SQ[phrase.id])}</small><strong>{phrase.local}</strong>{phrase.phonetic && <em>{phrase.phonetic}</em>}
        <div className="phrase-actions">
          <button type="button" onClick={() => void copyPhrase(phrase.local)} aria-label={`${copy("Kopyala", "Copy")}: ${phrase.local}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3" /></svg>
            {copy("Kopyala", "Copy")}
          </button>
          <button type="button" onClick={() => speak(phrase.local)} aria-label={`${copy("Dinle", "Listen")}: ${phrase.local}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></svg>
            {copy("Dinle", "Listen")}
          </button>
        </div>
      </article>)}</div>
        : <div className="etiquette-list">{profile.etiquette.map((rule) => <article key={rule.id}><span><Icon name={rule.icon} size={20} /></span><div><small>{rule.kind === 'law' ? copy('Kanun / yerel düzenleme','Law / local regulation') : copy('Kültürel ve pratik tavsiye','Cultural and practical guidance')}</small><p lang={locale === "tr" ? "tr" : locale === "sq" && rule.sq ? "sq" : "en"}>{locale === "tr" ? rule.tr : locale === "sq" && rule.sq ? rule.sq : rule.en}</p>{rule.sourceUrl && rule.verifiedAt && <EvidenceLine item={{sourceUrl:rule.sourceUrl,verifiedAt:rule.verifiedAt,reviewAfter:rule.reviewAfter,validUntil:rule.validUntil}}/>}</div></article>)}</div>}
      <p className="essential-offline"><Icon name="offline" size={15} /> {copy("Bu kartlar cihazda çalışır; internet gerekmez. Kanunlar değişebilir, resmî uyarıları ayrıca doğrula.", "These cards work on-device without internet. Laws can change, so also verify official guidance.")}</p>
      </>}
    </section>}

    <section className="companion-sections" aria-labelledby="companion-sections-title">
      <div className="companion-section-heading"><h2 id="companion-sections-title">{tab === "assistant" && !activeTool ? copy("Yolculuk için kısa yollar", "Travel shortcuts") : copy("Diğer yardımcılar", "More travel help")}</h2></div>
      <nav aria-label={copy("Seyahat Asistanı bölümleri", "Travel Assistant sections")}>
        {((tab !== 'assistant' && tab !== 'now') || activeTool !== 'guide') && <button type="button" className="companion-section-card companion-section-guide" data-guide="travel-tool" data-guide-tool="guide" onClick={openCountryGuide}>
          <span className="companion-section-art" aria-hidden="true"><CompanionShortcutArtwork kind="guide" size={56}/></span>
          <span className="companion-section-card-copy"><strong>{copy('Ülke Rehberi','Country Guide','Udhëzues shteti')}</strong><small>{copy('Priz, para, trafik ve saat farkı','Plugs, currency, driving and time','Prizat, monedha, trafiku dhe ora')}</small></span>
          <Icon name="chevron" size={18}/>
        </button>}
        {(["assistant", "now", "phrases", "etiquette"] as CompanionTab[]).filter(item => item !== "assistant" && item !== "now" && item !== tab).map((item) => <button type="button" className={`companion-section-card companion-section-${item}`} onClick={() => openSection(item)} key={item}>
          <span className="companion-section-art" aria-hidden="true"><CompanionShortcutArtwork kind={item === 'phrases' ? 'phrases' : 'etiquette'} size={56} /></span>
          <span className="companion-section-card-copy"><strong>{tabLabel(item)}</strong><small>{tabDescription(item)}</small></span>
          <Icon name="chevron" size={18} />
        </button>)}
      </nav>
    </section>
  </div>;
}
