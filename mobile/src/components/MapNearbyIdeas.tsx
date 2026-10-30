import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { isNativePlatform } from '../lib/capacitor';
import { TRAVEL_CENTRES } from '../lib/travelAreas';
import { getTravelNow } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { nearbyEventContext, type EventSearchContext } from '../lib/eventSearchContext';
import type { Coordinates, PointCategory } from '../../../lib/travel-assistant/types';
import type { TravelNowResult } from '../types';
import '../screens/companion-usability.css';

type NowState = {
  key: string;
  loading: boolean;
  location: { latitude: number; longitude: number } | null;
  result: TravelNowResult | null;
  error: string;
};

export function MapNearbyIdeas({ countryCode='', onOpenEvents, onNotice, onSearch }: {countryCode?:string;onOpenEvents?:(context:EventSearchContext)=>void;onNotice:(message:string)=>void;onSearch:(query:string,center:Coordinates,category?:PointCategory)=>void}) {
  const {locale,copy}=useI18n();
  const [budget, setBudget] = useState<"free" | "low" | "flexible">("low");
  const [interest, setInterest] = useState<"culture" | "food" | "outdoors" | "calm">("culture");
  const [eventsLocating, setEventsLocating] = useState(false);
  const eventsRequestId = useRef(0);
  const [nowArea, setNowArea] = useState<Coordinates|null>(null);
  const [nowAreaRevision, setNowAreaRevision] = useState(0);
  // Manual choices invalidate requests; reflecting a successful GPS fix in the
  // picker must not invalidate that very same lookup.
  const nowKey = `${budget}:${interest}:${locale}:${countryCode}:${nowAreaRevision}`;
  useEffect(() => { setNowArea(null); }, [countryCode]);
  const [nowState, setNowState] = useState<NowState>({ key: "", loading: false, location: null, result: null, error: "" });
  const activeNowRequest = useRef<{ key: string } | null>(null);
  // Key the visible state as well as fencing callbacks: even the first render
  // after a selection/language change cannot show the previous recommendation.
  const { loading, location, result, error } = nowState.key === nowKey
    ? nowState : { loading: false, location: null, result: null, error: "" };
  useEffect(() => {
    // Leaving the section or changing its inputs also abandons a pending GPS
    // callback, so it cannot launch a weather request for the old selection.
    setNowState({ key: nowKey, loading: false, location: null, result: null, error: "" });
    setEventsLocating(false);
    return () => { activeNowRequest.current = null; eventsRequestId.current++; };
  }, [nowKey]);
  const locate = (chosen?: Coordinates) => {
    if (activeNowRequest.current?.key === nowKey) return;
    const request = { key: nowKey };
    activeNowRequest.current = request;
    const current = () => activeNowRequest.current === request;
    const fail = (message: string) => {
      if (!current()) return;
      activeNowRequest.current = null;
      setNowState({ key: nowKey, loading: false, location: null, result: null, error: message });
    };
    const lookup = async (point: Coordinates, fromGPS = false) => {
      if (!current()) return;
      const coordinates = { latitude: Math.round(point.latitude * 100) / 100, longitude: Math.round(point.longitude * 100) / 100 };
      if (fromGPS) setNowArea(coordinates);
      try {
        const response = await getTravelNow({ ...coordinates, budget, interest, locale });
        if (!current()) return;
        activeNowRequest.current = null;
        setNowState({ key: nowKey, loading: false, location: coordinates, result: response.data, error: "" });
      } catch {
        fail(copy("Anlık öneri hazırlanamadı. İnternet bağlantını kontrol et.", "Your live suggestion could not be prepared. Check your connection.", "Sugjerimi nuk u përgatit. Kontrollo lidhjen me internetin."));
      }
    };
    setNowState({ key: nowKey, loading: true, location: null, result: null, error: "" });
    if (chosen) { void lookup(chosen); return; }
    if (!navigator.geolocation) {
      fail(copy("Bu cihaz konum paylaşımını desteklemiyor. Şehir veya bölge seçerek devam edebilirsin.", "This device does not support location sharing. Choose a city or area to continue.", "Pajisja nuk mbështet vendndodhjen. Zgjidh qytetin ose zonën për të vazhduar."));
      return;
    }
    try {
      navigator.geolocation.getCurrentPosition(position => void lookup({ latitude: position.coords.latitude, longitude: position.coords.longitude }, true), geolocationError => {
        fail(geolocationError.code === 1
          ? isNativePlatform()
            ? copy("Konum izni verilmedi. Cihaz ayarlarında uygulama konum iznini açabilir veya şehir seçerek devam edebilirsin.", "Location permission was denied. Enable location for this app in device settings, or choose a city to continue.", "Leja u refuzua. Aktivizo vendndodhjen për aplikacionin në cilësime ose zgjidh qytetin për të vazhduar.")
            : copy("Tarayıcı konum iznini engelledi. Adres çubuğundaki site izinlerini değiştirebilir veya şehir seçerek devam edebilirsin.", "Your browser blocked location. Change this site's permissions in the address bar, or choose a city to continue.", "Shfletuesi bllokoi vendndodhjen. Ndrysho lejet e faqes në shiritin e adresës ose zgjidh qytetin për të vazhduar.")
          : copy("Konumun belirlenemedi. Şehir veya bölge seçerek devam edebilirsin.", "Your location could not be determined. Choose a city or area to continue.", "Vendndodhja nuk u gjet. Zgjidh qytetin ose zonën për të vazhduar."));
      }, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60 * 1000 });
    } catch {
      fail(copy("Konumun belirlenemedi. Şehir veya bölge seçerek devam edebilirsin.", "Your location could not be determined. Choose a city or area to continue.", "Vendndodhja nuk u gjet. Zgjidh qytetin ose zonën për të vazhduar."));
    }
  };

  const openNearbyEvents = async () => {
    if (!location || eventsLocating) return;
    const requestId = ++eventsRequestId.current;
    setEventsLocating(true);
    try {
      const context = await nearbyEventContext(location);
      if (requestId !== eventsRequestId.current) return;
      if (onOpenEvents) onOpenEvents(context);
      else onNotice(copy("Etkinlik Radarı'nda ülkeni ve şehrini seç.", "Choose your country and city in Event Radar.", "Zgjidh shtetin dhe qytetin te Radari i Aktiviteteve."));
    } catch {
      if (requestId !== eventsRequestId.current) return;
      onNotice(copy("Etkinlik konumu belirlenemedi. Yeniden dene.", "The event location could not be determined. Try again.", "Vendndodhja e aktiviteteve nuk u gjet. Provo përsëri."));
    } finally { if (requestId === eventsRequestId.current) setEventsLocating(false); }
  };

  function openRecommendation(recommendation: TravelNowResult['recommendations'][number]) {
    if(!location)return;
    if(recommendation.id==='event'){void openNearbyEvents();return;}
    const category:PointCategory|undefined=({museum:'museum',walk:recommendation.mapQuery==='scenic viewpoint'?'viewpoint':'historic',food:recommendation.mapQuery==='local market'?'market':'restaurant',culture:'historic',nature:recommendation.indoor?'garden':'park',calm:'cafe',night:'attraction'} as Record<string,PointCategory>)[recommendation.id];
    onSearch(category?'':recommendation.mapQuery,location,category);
  }

  return <section className="companion-panel" aria-label={copy('Yakınımda', 'Nearby', 'Pranë meje')}>
      <div className="now-intro"><div><h2>{copy("Şimdi ne yapabilirim?", "What can I do now?", "Çfarë mund të bëj tani?")}</h2><p>{copy("Havaya, saate ve seçimine uygun öneriler.", "Ideas for the weather, time and your preferences.", "Ide për motin, orën dhe preferencat e tua.")}</p></div><Icon name="sun" size={25} /></div>
      <div className="now-choices">
        <fieldset><legend>{copy("Bütçem", "My budget")}</legend>{(["free", "low", "flexible"] as const).map((item) => <button type="button" key={item} className={budget === item ? "active" : ""} aria-pressed={budget === item} onClick={() => setBudget(item)}>{item === "free" ? copy("Ücretsiz", "Free") : item === "low" ? copy("Ekonomik", "Low") : copy("Esnek", "Flexible")}</button>)}</fieldset>
        <fieldset><legend>{copy("Bugünkü modum", "My mood today")}</legend>{(["culture", "food", "outdoors", "calm"] as const).map((item) => <button type="button" key={item} className={interest === item ? "active" : ""} aria-pressed={interest === item} onClick={() => setInterest(item)}>{item === "culture" ? copy("Kültür", "Culture") : item === "food" ? copy("Lezzet", "Food") : item === "outdoors" ? copy("Açık hava", "Outdoors") : copy("Sakin", "Calm")}</button>)}</fieldset>
      </div>
      <label className="now-city-choice ta-form">{copy('Şehir', 'City', 'Qyteti')}<select aria-label={copy('Öneri için şehir', 'Suggestion city', 'Qyteti për sugjerime')} value={TRAVEL_CENTRES.find(c=>c.latitude===nowArea?.latitude&&c.longitude===nowArea?.longitude)?.name || ''} onChange={event=>{const city=TRAVEL_CENTRES.find(c=>c.name===event.target.value);if(city){setNowArea({latitude:city.latitude,longitude:city.longitude});setNowAreaRevision(value=>value+1);}}}><option value="">{nowArea ? copy('Seçilen konum', 'Selected location', 'Vendndodhja e zgjedhur') : copy('Şehir seç veya konumunu kullan', 'Choose a city or use your location', 'Zgjidh qytet ose përdor vendndodhjen')}</option>{TRAVEL_CENTRES.map(city=><option key={city.name} value={city.name}>{city.name}</option>)}</select></label>
      <button type="button" className="primary-wide" disabled={loading || !nowArea} onClick={() => nowArea && locate(nowArea)}>{copy("Seçili bölgeye göre öner", "Suggest for selected area", "Sugjero për zonën e zgjedhur")}</button>
      <button className="now-locate-button secondary-wide" onClick={() => void locate()} disabled={loading}>{loading ? <span className="button-loader" /> : <Icon name="map" size={19} />}{loading ? copy("Şu anın hesaplanıyor…", "Reading the moment…") : copy("Konumuma göre öner", "Suggest from my location")}</button>
      {error && <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{error}</p></div>}
      {result && <div className="now-results">
        <article className="now-weather"><span><Icon name={result.weather.precipitation > 0 ? "cloud" : "sun"} size={25} /></span><div><small>{result.weather.description} · {result.weather.localTime.slice(11, 16)}</small><strong>{result.weather.temperature}°</strong><p>{copy("Hissedilen", "Feels like")} {result.weather.apparentTemperature}°</p></div></article>
        <div className="now-recommendations">{result.recommendations.map((recommendation, index) => <button type="button" key={recommendation.id} onClick={() => openRecommendation(recommendation)}><em>{index + 1}</em><span><strong>{recommendation.title}</strong><small>{recommendation.reason}</small><i>{recommendation.duration} · {recommendation.indoor ? copy("Kapalı alan", "Indoor") : copy("Açık alan", "Outdoor")}</i></span><Icon name="chevron" size={17} /></button>)}</div>
        <p className="now-privacy"><Icon name="lock" size={14} /> {result.privacy}</p>
        <button className="secondary-wide" disabled={eventsLocating} onClick={() => void openNearbyEvents()}><Icon name="calendar" size={18} /> {eventsLocating ? copy("Konum hazırlanıyor…", "Preparing location…", "Po përgatitet vendndodhja…") : copy("Yakındaki etkinlikleri de gör", "See nearby events too", "Shih edhe aktivitetet pranë")}</button>
      </div>}
    </section>;
}
