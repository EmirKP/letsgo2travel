import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useI18n } from "../lib/i18n";
import { randomRoute, routeByDestinationCode } from "../data/routes";
import { destinationArtwork } from "../data/artwork";
import { listCockpitTrips, type CockpitTrip } from "../lib/supabaseData";
import { localIsoDate } from "../lib/dates";
import { homeJourneyStep, nextHomeJourney } from "../lib/homeJourney";
import "./daily-journey.css";
import type { AuthUser, RouteSuggestion, ViewId } from "../types";

export function HomeScreen({ user, ownerId, accessToken, refreshToken, onNavigate, onOpenTrip, onOpenSaved, onOpenCommunity, onSurprise, onBuildRoute, onNotice }: {
  user: AuthUser | null; ownerId?: string | null; accessToken?: string; refreshToken?: number;
  onNavigate: (view: ViewId) => void; onOpenCommunity: (countryCode?: string) => void;
  onOpenTrip?: (id: string) => void;
  onOpenSaved?: (section: "routes" | "places" | "events") => void;
  onSurprise: (route: RouteSuggestion) => void; onBuildRoute: (route: RouteSuggestion) => void; onNotice: (message: string) => void;
}) {
  const { locale, copy, dateLocale } = useI18n();
  const [trip, setTrip] = useState<{ owner: string; value: CockpitTrip } | null>(null);
  const [tripRequest, setTripRequest] = useState<{ owner: string; state: "ready" | "error" } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (ownerId && accessToken) void listCockpitTrips(ownerId, accessToken).then(items => {
      if (!active) return;
      const upcoming = nextHomeJourney(items, localIsoDate(0));
      setTrip(upcoming ? { owner: ownerId, value: upcoming } : null);
      setTripRequest({ owner: ownerId, state: "ready" });
    }).catch(() => { if (active) setTripRequest({ owner: ownerId, state: "error" }); });
    return () => { active = false; };
  }, [ownerId, accessToken, refreshToken, retry]);
  const nextTrip = trip && trip.owner === ownerId && user ? trip.value : null;
  const loading = Boolean(ownerId && accessToken && tripRequest?.owner !== ownerId);
  const failed = Boolean(ownerId && tripRequest?.owner === ownerId && tripRequest.state === "error");
  const step = nextTrip ? homeJourneyStep(nextTrip, localIsoDate(0)) : null;
  const openTrip = () => nextTrip && onOpenTrip ? onOpenTrip(nextTrip.id) : onNavigate("cockpit");
  const openSaved = (section: "routes" | "places" | "events") => onOpenSaved ? onOpenSaved(section) : onNavigate("trips");
  const tripTitle = nextTrip && ([nextTrip.destinationCity, nextTrip.destinationCountry].filter(Boolean).join(", ") || nextTrip.flightNumber || copy("Seyahatin", "Your trip"));
  const labelDate = (value: string) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short" }).format(new Date(value + "T12:00:00"));
  const inspiration = ["FCO", "SJJ"].flatMap(code => { const value = routeByDestinationCode(code, locale); return value ? [value] : []; });
  return <div className="screen home-screen daily-home">
    <header className="daily-page-heading"><span>{copy("BİR SONRAKİ ADIM", "YOUR NEXT STEP")}</span><h1>{copy("Yola hazır mısın?", "Ready for your next chapter?")}</h1></header>
    <section className={`daily-trip-card${nextTrip ? " has-trip" : ""}`} aria-labelledby="daily-trip-title" aria-busy={loading}>
      {loading ? <div className="daily-trip-loading" role="status"><span className="button-loader"/><h2 id="daily-trip-title">{copy("Seyahatin hazırlanıyor", "Getting your trip ready")}</h2><p>{copy("Sıradaki adımı buluyoruz.", "Finding your next step.")}</p></div>
        : nextTrip && step ? <>
          <div className="daily-trip-eyebrow"><span><Icon name="suitcase" size={16}/>{step.stage === "wrap-up" ? copy("SEYAHAT SONRASI", "AFTER YOUR TRIP") : step.stage === "travelling" ? copy("BUGÜNKÜ SEYAHATİN", "YOUR TRIP TODAY") : copy("YAKLAŞAN SEYAHATİN", "YOUR NEXT TRIP")}</span><button type="button" onClick={openTrip} aria-label={copy("Seyahat ayrıntılarını aç", "Open trip details")}><Icon name="chevron" size={20}/></button></div>
          <h2 id="daily-trip-title">{tripTitle}</h2>
          <p className="daily-trip-dates"><Icon name="calendar" size={17}/>{labelDate(nextTrip.startDate)} – {labelDate(nextTrip.endDate)}</p>
          {step.stage === "preparing" && <div className="daily-check-progress"><div><span>{copy("Hazırlık listen", "Your checklist")}</span><strong>{step.completed}/{step.total}</strong></div>{step.total > 0 && <progress max={step.total} value={step.completed} aria-label={copy("Tamamlanan hazırlıklar", "Completed preparations")}/>}<p>{step.nextItem ? step.nextItem.label : step.total ? copy("Hazırlıkların tamam. Uçuş bilgilerine göz at.", "You're ready. Review your flight details.") : copy("Belgelerini ve yanına alacaklarını bir araya getir.", "Keep your documents and packing list together.")}</p></div>}
          {step.stage === "travelling" && <p>{copy("Kaydettiğin yerleri aç, bugünün gezi sırasını seç.", "Open your saved places and choose today's stops.")}</p>}
          {step.stage === "wrap-up" && <p>{copy("Bu yolculuk sona erdi mi? Seyahatini tamamlandı olarak işaretle.", "Back from this journey? Mark your trip as completed.")}</p>}
          <button type="button" className="daily-primary" onClick={() => step.stage === "travelling" ? openSaved("places") : openTrip()}>{step.stage === "travelling" ? copy("Bugünün yerlerini aç", "Open today's places") : step.stage === "wrap-up" ? copy("Seyahati tamamla", "Finish this trip") : step.nextItem || !step.total ? copy("Hazırlığa devam et", "Continue preparing") : copy("Seyahat ayrıntılarını aç", "Open trip details")}<Icon name="chevron" size={19}/></button>
        </> : failed ? <><span className="daily-trip-eyebrow"><Icon name="offline" size={18}/>{copy("BAĞLANTI GEREKİYOR", "CONNECTION NEEDED")}</span><h2 id="daily-trip-title">{copy("Seyahatine ulaşamadık", "Your trip couldn't load")}</h2><p>{copy("Kayıtlı rotaların ve yerlerin Kaydedilenler'de seni bekliyor.", "Your saved routes and places are still in Saved.")}</p><button type="button" className="daily-primary" onClick={() => { setTripRequest(null); setRetry(value => value + 1); }}><Icon name="refresh" size={18}/>{copy("Yeniden dene", "Try again")}</button></>
        : <><span className="daily-trip-eyebrow"><Icon name="compass" size={18}/>{copy("YENİ BİR YOLCULUK", "A NEW JOURNEY")}</span><h2 id="daily-trip-title">{copy("Önce sana uygun bir rota.", "Start with a route that fits you.")}</h2><p>{copy("Süreni ve tarzını seç. Gezmek isteyeceğin yerleri birlikte bulalım.", "Choose your time and travel style. Find places you'll want to explore.")}</p><button type="button" className="daily-primary" onClick={() => onNavigate("route")}>{copy("Rotamı planla", "Plan my route")}<Icon name="chevron" size={19}/></button><button type="button" className="daily-text-action" onClick={() => onNavigate("cockpit")}>{copy("Uçuşum belli, seyahat ekle", "Already booked? Add your trip")}</button></>}
      {failed && nextTrip && <p className="daily-stale-note" role="status">{copy("Şu anda yenilenemedi; bu oturumda alınan son bilgiler.", "Couldn't refresh; showing the last details from this session.")}</p>}
    </section>
    <section className="daily-essentials" aria-label={copy("Seyahatin yanında", "Along the way")}>
      <button type="button" onClick={() => onNavigate("trips")}><Icon name="bookmark" size={25}/><strong>{copy("Kaydedilenler", "Saved")}</strong><span>{copy("Rotalar, yerler, etkinlikler", "Routes, places, events")}</span><Icon name="chevron" size={16}/></button>
      <button type="button" onClick={() => onNavigate("companion")}><Icon name="compass" size={25}/><strong>{copy("Seyahat Asistanı", "Travel Assistant")}</strong><span>{copy("Harita, çeviri ve günlük ihtiyaçlar", "Maps, translation and essentials")}</span><Icon name="chevron" size={16}/></button>
    </section>
    <section className="daily-inspiration" aria-labelledby="daily-inspiration-title"><div className="daily-section-heading"><h2 id="daily-inspiration-title">{copy("Sıradaki yolculuğa ilham", "A little inspiration")}</h2><button type="button" onClick={() => onNavigate("explore")}>{copy("Tümünü gör", "See all")}<Icon name="chevron" size={16}/></button></div><div className="daily-destination-grid">{inspiration.map(route => <button type="button" key={route.destinationCode} onClick={() => onBuildRoute(route)}><img src={destinationArtwork(route.destinationCode)} alt="" loading="lazy"/><span><strong>{route.name}</strong><small>{route.country}</small></span></button>)}</div><button type="button" className="daily-surprise" onClick={() => { const route = randomRoute(locale); onSurprise(route); onNotice(copy(route.name + " senin için seçildi.", route.name + " was picked for you.")); }}><Icon name="sparkles" size={18}/>{copy("Kararsızım, beni şaşırt", "Surprise me with a destination")}</button></section>
    <button type="button" className="daily-community" onClick={() => onOpenCommunity()}><Icon name="users" size={23}/><span><strong>{copy("Bir bilene sor", "Ask someone who's been")}</strong><small>{copy("Gezginlerden deneyim ve öneri al.", "Get tips from fellow travellers.")}</small></span><Icon name="chevron" size={18}/></button>
  </div>;
}
