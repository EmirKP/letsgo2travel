import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { TravelToolArtwork } from "../components/TravelToolArtwork";
import { PageHero } from "../components/PageHero";
import { CountryPicker } from "../components/CountryPicker";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import { TRAVEL_ESSENTIALS, essentialProfile, fallbackEssentialProfile } from "../data/travelEssentials";
import { getTravelNow } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { readTravelCountry, selectTravelCountry } from "../lib/travelSelection";
import { EvidenceLine } from "../components/TravelSafety";
import type { TravelNowResult, ViewId } from "../types";
import "./companion-usability.css";
import "../components/feature-entry-artwork.css";

const TravelAssistant = lazy(() => import("../components/TravelAssistant").then(m => ({ default: m.TravelAssistant })));

type CompanionTab = "assistant" | "now" | "phrases" | "etiquette";

const SPEECH_LANG: Record<string, string> = {
  XK: "sq-AL", AL: "sq-AL", BA: "bs-BA", RS: "sr-RS", DE: "de-DE", IT: "it-IT", FR: "fr-FR",
  ES: "es-ES", PT: "pt-PT", NL: "nl-NL", GR: "el-GR", JP: "ja-JP", KR: "ko-KR", TH: "th-TH",
  AE: "ar-AE", GE: "ka-GE", AZ: "az-AZ", BR: "pt-BR", GB: "en-GB",
};

const LANGUAGE_NAMES_SQ: Record<string, string> = {"Albanian": "Shqip", "German": "Gjermanisht", "Italian": "Italisht", "French": "Frëngjisht", "Spanish": "Spanjisht", "Japanese": "Japonisht", "Thai": "Tajlandisht", "English": "Anglisht", "Bosnian": "Boshnjakisht", "Serbian": "Serbisht", "Portuguese": "Portugalisht", "Dutch": "Holandisht", "Greek": "Greqisht", "Korean": "Koreanisht", "Arabic": "Arabisht", "Georgian": "Gjeorgjisht", "Azerbaijani": "Azerbajxhanisht", "English emergency fallback": "Fraza urgjence në anglisht"};
const PHRASE_MEANINGS_SQ: Record<string, string> = {"help": "Kam nevojë për ndihmë.", "hospital": "Duhet të shkoj në spital.", "allergy": "A ka alergjenë në këtë ushqim?", "airport": "Dua të shkoj në aeroport.", "bill": "A mund ta marr faturën, ju lutem?", "hello": "Përshëndetje.", "police": "Telefononi policinë.", "directions": "Si mund të shkoj këtu?", "price": "Sa kushton kjo?"};

export function TravelCompanionScreen({ initialTab = "assistant", onNavigate, onNotice, accessToken, onSignIn, ownerId }: {
  initialTab?: CompanionTab;
  accessToken: string;
  ownerId?: string | null;
  onSignIn: () => void;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, copy, countryName } = useI18n();
  const [tab, setTab] = useState<CompanionTab>(initialTab);
  const [countryCode, setCountryCode] = useState(() => readTravelCountry() || "XK");
  const [budget, setBudget] = useState<"free" | "low" | "flexible">("low");
  const [interest, setInterest] = useState<"culture" | "food" | "outdoors" | "calm">("culture");
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [result, setResult] = useState<TravelNowResult | null>(null);
  const [error, setError] = useState("");
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
    setTab(item);
    focusSection(item);
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
  const tabArtwork = (value: CompanionTab) => ({ assistant: "explore", now: "explore", phrases: "translate", etiquette: "guide" } as const)[value];

  const locate = async () => {
    if (loading) return;
    if (!navigator.geolocation) {
      setError(copy("Bu cihaz konum paylaşımını desteklemiyor.", "This device does not support location sharing."));
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(async (position) => {
      // Hava ve yakındaki arama için hassas GPS gerekmez. Cihazdan çıktığı
      // anda ~1 km düzeyine yuvarlayarak yalnız yaklaşık konumla devam et.
      const coordinates = {
        latitude: Math.round(position.coords.latitude * 100) / 100,
        longitude: Math.round(position.coords.longitude * 100) / 100,
      };
      setLocation(coordinates);
      try {
        const response = await getTravelNow({ ...coordinates, budget, interest, locale });
        setResult(response.data);
      } catch {
        setResult(null);
        setError(copy("Anlık öneri hazırlanamadı. İnternet bağlantını kontrol et.", "Your live suggestion could not be prepared. Check your connection."));
      } finally {
        setLoading(false);
      }
    }, (geolocationError) => {
      setLoading(false);
      setResult(null);
      setError(geolocationError.code === 1
        ? copy("Konum izni verilmedi. Ayarlardan yalnızca uygulamayı kullanırken izin verebilirsin.", "Location permission was denied. You can allow it only while using the app in Settings.")
        : copy("Konumun belirlenemedi. Açık bir alanda tekrar dene.", "Your location could not be determined. Try again in an open area."));
    }, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60 * 1000 });
  };

  const openMap = (query: string) => {
    if (!location) return;
    const mapQuery = encodeURIComponent(`${query} near ${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`);
    void openExternal(`https://www.google.com/maps/search/?api=1&query=${mapQuery}`);
  };

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

  return <div className="screen companion-screen" data-section={tab} tabIndex={-1}>
    {tab === "assistant"
      ? <PageHero scene="city" title={copy("Yolculukta elinin altında", "A little help along the way")} subtitle={tabDescription("assistant")} note={copy("Keşfet, rahat et.", "Explore with ease.")} />
      : <header className="companion-section-header">
        <button type="button" onClick={() => openSection("assistant")}><Icon name="back" size={18} />{tabLabel("assistant")}</button>
        <span className="companion-section-symbol" aria-hidden="true"><TravelToolArtwork kind={tabArtwork(tab)} size={56} /></span>
        <h1 id="companion-section-title" tabIndex={-1}>{tabLabel(tab)}</h1><p>{tabDescription(tab)}</p>
      </header>}

    {tab === "assistant" && <Suspense fallback={<p role="status">{copy("Asistan açılıyor…", "Opening assistant…")}</p>}><TravelAssistant ownerId={ownerId} accessToken={accessToken} onSignIn={onSignIn} onNotice={onNotice} onPhrases={code => { if (code) setCountryCode(code); setTab("phrases"); focusSection("phrases"); }} /></Suspense>}

    {tab === "now" && <section className="companion-panel" aria-label={tabLabel('now')}>
      <div className="now-intro"><div><small>{copy("KONUM + SAAT + HAVA", "LOCATION + TIME + WEATHER")}</small><h2>{copy("Şu anda ne yapabilirim?", "What can I do right now?")}</h2><p>{copy("Yaklaşık konumunu yalnız o anki hava ve uygun etkinlik türünü bulmak için kullanırız; kaydetmeyiz.", "We use your approximate location only to match current weather and suitable activity types; we do not store it.")}</p></div><Icon name="sun" size={31} /></div>
      <div className="now-choices">
        <fieldset><legend>{copy("Bütçem", "My budget")}</legend>{(["free", "low", "flexible"] as const).map((item) => <button type="button" key={item} className={budget === item ? "active" : ""} aria-pressed={budget === item} onClick={() => setBudget(item)}>{item === "free" ? copy("Ücretsiz", "Free") : item === "low" ? copy("Ekonomik", "Low") : copy("Esnek", "Flexible")}</button>)}</fieldset>
        <fieldset><legend>{copy("Bugünkü modum", "My mood today")}</legend>{(["culture", "food", "outdoors", "calm"] as const).map((item) => <button type="button" key={item} className={interest === item ? "active" : ""} aria-pressed={interest === item} onClick={() => setInterest(item)}>{item === "culture" ? copy("Kültür", "Culture") : item === "food" ? copy("Lezzet", "Food") : item === "outdoors" ? copy("Açık hava", "Outdoors") : copy("Sakin", "Calm")}</button>)}</fieldset>
      </div>
      <button className="now-locate-button" onClick={() => void locate()} disabled={loading}>{loading ? <span className="button-loader" /> : <Icon name="map" size={19} />}{loading ? copy("Şu anın hesaplanıyor…", "Reading the moment…") : copy("Konumuma göre öner", "Suggest from my location")}</button>
      {error && <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{error}</p></div>}
      {result && <div className="now-results">
        <article className="now-weather"><span><Icon name={result.weather.precipitation > 0 ? "cloud" : "sun"} size={25} /></span><div><small>{result.weather.description} · {result.weather.localTime.slice(11, 16)}</small><strong>{result.weather.temperature}°</strong><p>{copy("Hissedilen", "Feels like")} {result.weather.apparentTemperature}°</p></div></article>
        <div className="now-recommendations">{result.recommendations.map((recommendation, index) => <button type="button" key={recommendation.id} onClick={() => openMap(recommendation.mapQuery)}><em>{index + 1}</em><span><strong>{recommendation.title}</strong><small>{recommendation.reason}</small><i>{recommendation.duration} · {recommendation.indoor ? copy("Kapalı alan", "Indoor") : copy("Açık alan", "Outdoor")}</i></span><Icon name="external" size={17} /></button>)}</div>
        <p className="now-privacy"><Icon name="lock" size={14} /> {result.privacy}</p>
        <button className="secondary-wide" onClick={() => onNavigate("events")}><Icon name="calendar" size={18} /> {copy("Yakındaki etkinlikleri de gör", "See nearby events too")}</button>
      </div>}
    </section>}

    {(tab === "phrases" || tab === "etiquette") && <section className="companion-panel" aria-label={tabLabel(tab)}>
      <CountryPicker value={countryCode} options={countryOptions} onChange={code => { setCountryCode(code); selectTravelCountry(code); }} label={copy("Gideceğin ülke", "Destination")} placeholder={copy("Ülke seç", "Choose a country")} />
      {supportedProfiles.has(countryCode) && <p className="essential-language-note"><Icon name="offline" size={15} /> {tab === "phrases"
        ? copy(`${profile.languageTr} ifadeler cihazda hazır`, `${profile.languageEn} phrases ready offline`, `Fraza gati pa internet: ${LANGUAGE_NAMES_SQ[profile.languageEn] || profile.languageEn}`)
        : copy("Yerel kurallar cihazda hazır", "Local guidance ready offline")}</p>}
      {!supportedProfiles.has(countryCode) && <div className="essential-fallback-note" role="status"><Icon name="info" size={16} /><p>{copy("Bu ülke seçilebilir ve kartlar çevrimdışı çalışır; yerel çeviri hazır olana kadar İngilizce acil ifadeler gösterilir.", "This country is available and the cards work offline; English emergency phrases are shown until its local translation is ready.")}</p></div>}
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
        : <div className="etiquette-list">{profile.etiquette.map((rule) => <article key={rule.id}><span><Icon name={rule.icon} size={20} /></span><div><small>{rule.kind === 'law' ? copy('Kanun / yerel düzenleme','Law / local regulation') : copy('Kültürel ve pratik tavsiye','Cultural and practical guidance')}</small><p lang={locale === "tr" ? "tr" : locale === "sq" && rule.sq ? "sq" : "en"}>{locale === "tr" ? rule.tr : locale === "sq" && rule.sq ? rule.sq : rule.en}</p>{rule.sourceUrl && rule.verifiedAt && <EvidenceLine item={{sourceUrl:rule.sourceUrl,verifiedAt:rule.verifiedAt}}/>}</div></article>)}</div>}
      <p className="essential-offline"><Icon name="offline" size={15} /> {copy("Bu kartlar cihazda çalışır; internet gerekmez. Kanunlar değişebilir, resmî uyarıları ayrıca doğrula.", "These cards work on-device without internet. Laws can change, so also verify official guidance.")}</p>
    </section>}

    <section className="companion-sections" aria-labelledby="companion-sections-title">
      <div className="companion-section-heading"><h2 id="companion-sections-title">{tab === "assistant" ? copy("Yolculuk için kısa yollar", "Travel shortcuts") : copy("Diğer yardımcılar", "More travel help")}</h2></div>
      <nav aria-label={copy("Seyahat Asistanı bölümleri", "Travel Assistant sections")}>
        {(["assistant", "now", "phrases", "etiquette"] as CompanionTab[]).filter(item => item !== "assistant" && item !== tab).map((item) => <button type="button" className={`companion-section-card companion-section-${item}`} onClick={() => openSection(item)} key={item}>
          <span className="companion-section-art" aria-hidden="true"><TravelToolArtwork kind={tabArtwork(item)} size={56} /></span>
          <span className="companion-section-card-copy"><strong>{tabLabel(item)}</strong><small>{tabDescription(item)}</small></span>
          <Icon name="chevron" size={18} />
        </button>)}
      </nav>
    </section>
  </div>;
}
