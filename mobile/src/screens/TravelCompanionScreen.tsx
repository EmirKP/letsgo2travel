import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { CountryFlag } from "../components/CountryFlag";
import { CountryPicker } from "../components/CountryPicker";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import { TRAVEL_ESSENTIALS, essentialProfile, fallbackEssentialProfile } from "../data/travelEssentials";
import { getTravelNow } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import type { TravelNowResult, ViewId } from "../types";

type CompanionTab = "now" | "phrases" | "etiquette";

const SPEECH_LANG: Record<string, string> = {
  XK: "sq-AL", AL: "sq-AL", BA: "bs-BA", RS: "sr-RS", DE: "de-DE", IT: "it-IT", FR: "fr-FR",
  ES: "es-ES", PT: "pt-PT", NL: "nl-NL", GR: "el-GR", JP: "ja-JP", KR: "ko-KR", TH: "th-TH",
  AE: "ar-AE", GE: "ka-GE", AZ: "az-AZ", BR: "pt-BR", GB: "en-GB",
};

export function TravelCompanionScreen({ initialTab = "now", onNavigate, onNotice }: {
  initialTab?: CompanionTab;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, copy, countryName } = useI18n();
  const [tab, setTab] = useState<CompanionTab>(initialTab);
  const [countryCode, setCountryCode] = useState("XK");
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
        ? (locale === "tr" ? supported.languageTr : supported.languageEn)
        : copy("İngilizce acil kart", "English emergency fallback"),
      supported: Boolean(supported),
    };
  }).filter((country) => country.code).sort((a, b) => Number(b.supported) - Number(a.supported) || a.name.localeCompare(b.name, locale)), [copy, countryName, locale, supportedProfiles]);
  const selectedCountry = useMemo(() => countryOptions.find((country) => country.code === countryCode), [countryCode, countryOptions]);
  const profile = useMemo(() => essentialProfile(countryCode)
    || fallbackEssentialProfile(countryCode, selectedCountry?.name || countryCode, flagEmoji(countryCode)), [countryCode, selectedCountry?.name]);

  useEffect(() => setTab(initialTab), [initialTab]);

  const tabLabel = (value: CompanionTab) => ({
    now: copy("Şimdi", "Right now"),
    phrases: copy("Konuş", "Phrases"),
    etiquette: copy("Yerel kurallar", "Local rules"),
  })[value];

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

  return <div className="screen companion-screen">
    <section className="companion-hero">
      <span><Icon name="compass" size={29} /></span>
      <div><small>{copy("CEBİNDEKİ YEREL YARDIMCI", "YOUR LOCAL TRAVEL COMPANION")}</small><h1>{copy("Yabancı hissetme.", "Feel at home, anywhere.")}</h1><p>{copy("Bulunduğun ana göre öneri al, gerekli cümleyi göster ve yerel kuralları önceden bil.", "Get a live suggestion, show the phrase you need and understand local customs before you go.")}</p></div>
    </section>

    <div className="companion-tabs" role="tablist" aria-label={copy("Seyahat yardımcısı araçları", "Travel companion tools")}>
      {(["now", "phrases", "etiquette"] as CompanionTab[]).map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{tabLabel(item)}</button>)}
    </div>

    {tab === "now" && <section className="companion-panel" role="tabpanel">
      <div className="now-intro"><div><small>{copy("KONUM + SAAT + HAVA", "LOCATION + TIME + WEATHER")}</small><h2>{copy("Şu anda ne yapabilirim?", "What can I do right now?")}</h2><p>{copy("Yaklaşık konumunu yalnız o anki hava ve uygun etkinlik türünü bulmak için kullanırız; kaydetmeyiz.", "We use your approximate location only to match current weather and suitable activity types; we do not store it.")}</p></div><Icon name="sun" size={31} /></div>
      <div className="now-choices">
        <fieldset><legend>{copy("Bütçem", "My budget")}</legend>{(["free", "low", "flexible"] as const).map((item) => <button type="button" key={item} className={budget === item ? "active" : ""} onClick={() => setBudget(item)}>{item === "free" ? copy("Ücretsiz", "Free") : item === "low" ? copy("Ekonomik", "Low") : copy("Esnek", "Flexible")}</button>)}</fieldset>
        <fieldset><legend>{copy("Bugünkü modum", "My mood today")}</legend>{(["culture", "food", "outdoors", "calm"] as const).map((item) => <button type="button" key={item} className={interest === item ? "active" : ""} onClick={() => setInterest(item)}>{item === "culture" ? copy("Kültür", "Culture") : item === "food" ? copy("Lezzet", "Food") : item === "outdoors" ? copy("Açık hava", "Outdoors") : copy("Sakin", "Calm")}</button>)}</fieldset>
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

    {(tab === "phrases" || tab === "etiquette") && <section className="companion-panel" role="tabpanel">
      <CountryPicker value={countryCode} options={countryOptions} onChange={setCountryCode} label={copy("Gideceğin ülke", "Destination")} placeholder={copy("Ülke seç", "Choose a country")} />
      <div className="essential-heading"><span><CountryFlag code={profile.code} label={locale === "tr" ? profile.nameTr : profile.nameEn} /></span><div><small>{tab === "phrases" ? copy("İNTERNETSİZ HAZIR İFADELER", "OFFLINE ESSENTIAL PHRASES") : copy("GÖRGÜ, KÜLTÜR VE UYARILAR", "ETIQUETTE, CULTURE & CAUTIONS")}</small><h2>{locale === "tr" ? profile.nameTr : profile.nameEn}</h2><p>{tab === "phrases" ? (locale === "tr" ? profile.languageTr : profile.languageEn) : copy("Kısa ve pratik yerel notlar", "Short, practical local notes")}</p></div></div>
      {!supportedProfiles.has(countryCode) && <div className="essential-fallback-note" role="status"><Icon name="info" size={16} /><p>{copy("Bu ülke seçilebilir ve kartlar çevrimdışı çalışır; yerel çeviri hazır olana kadar İngilizce acil ifadeler gösterilir.", "This country is available and the cards work offline; English emergency phrases are shown until its local translation is ready.")}</p></div>}
      {tab === "phrases" ? <div className="phrase-list">{profile.phrases.map((phrase) => <article key={phrase.id}><small>{locale === "tr" ? phrase.tr : phrase.en}</small><strong>{phrase.local}</strong>{phrase.phonetic && <em>{phrase.phonetic}</em>}<div><button onClick={() => void copyPhrase(phrase.local)}><Icon name="bookmark" size={16} />{copy("Kopyala", "Copy")}</button><button onClick={() => speak(phrase.local)}><Icon name="bell" size={16} />{copy("Dinle", "Listen")}</button></div></article>)}</div>
        : <div className="etiquette-list">{profile.etiquette.map((rule) => <article key={rule.id}><span><Icon name={rule.icon} size={20} /></span><p>{locale === "tr" ? rule.tr : rule.en}</p></article>)}</div>}
      <p className="essential-offline"><Icon name="offline" size={15} /> {copy("Bu kartlar cihazda çalışır; internet gerekmez. Kanunlar değişebilir, resmî uyarıları ayrıca doğrula.", "These cards work on-device without internet. Laws can change, so also verify official guidance.")}</p>
    </section>}
  </div>;
}
