import { useEffect, useId, useState } from "react";
import { Icon } from "../components/Icon";
import { BrandMark } from "../components/BrandMark";
import { TravelFeatureIcon } from "../components/TravelFeatureIcon";
import { useI18n } from "../lib/i18n";
import { homeDestinations } from "../data/homeDestinations";
import { listCockpitTrips, type CockpitTrip } from "../lib/supabaseData";
import { localIsoDate } from "../lib/dates";
import { homeJourneyStep, nextHomeJourney } from "../lib/homeJourney";
import santorini from "../assets/home-reference/santorini-hero.webp";
import coastal from "../assets/home-reference/coastal-banner.webp";
import cappadocia from "../assets/home-reference/cappadocia.webp";
import bali from "../assets/home-reference/bali.webp";
import rome from "../assets/destination-artwork/rome.webp";
import communityTravelers from "../assets/home-reference/community-travelers.webp";
import "./reference-home.css";
import type { AuthUser, RouteSuggestion, ViewId } from "../types";

const artwork: Record<string, string> = { JTR: santorini, NAV: cappadocia, DPS: bali, FCO: rome };
const cities = ["Paris", "Bali", "Tokyo", "New York", "Roma"] as const;

function Arrow() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15m-6-7 7 7-7 7" /></svg>;
}

function PopularFlame() {
  const id = `popular-flame-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <svg viewBox="0 0 32 36" width="28" height="30" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-outer`} cx="13" cy="28" r="26" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFD66B"/><stop offset=".46" stopColor="#FF982E"/><stop offset=".78" stopColor="#F34B22"/><stop offset="1" stopColor="#D72E1E"/>
      </radialGradient>
      <linearGradient id={`${id}-core`} x1="17" y1="15" x2="15" y2="34" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFB72C"/><stop offset=".6" stopColor="#FFE57F"/><stop offset="1" stopColor="#FFF4C4"/>
      </linearGradient>
    </defs>
    <path d="M17 1.5c2.5 8.1 11.5 10.6 11.5 21.3 0 7-5.6 11.8-12.5 11.8S3.5 29.6 3.5 22.7c0-5.9 3.7-8.9 6.2-13.3-.4 4.5 1.9 6.4 3.1 6.8C11.2 10.5 18.4 7.3 17 1.5Z" fill={`url(#${id}-outer)`}/>
    <path d="M18 13.8c.4 5.1 6.6 7.4 6.6 12.5 0 4.6-3.8 8.2-8.6 8.2s-8.5-3.6-8.5-8.2c0-3.2 1.9-5.5 4-7.9-.5 3.2.7 5 2.1 5.7-.8-4.6 4.7-6 4.4-10.3Z" fill={`url(#${id}-core)`}/>
    <path d="M7.1 23c-.4 3.2 1.1 6.4 3.8 8.1" stroke="#FFF0BC" strokeWidth="1.3" strokeLinecap="round" opacity=".65"/>
  </svg>;
}

function Landmark({ city }: { city: typeof cities[number] }) {
  return <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {city === "Paris" ? <><path d="M16 2c-1 10-3 19-9 27h6c0-5 6-5 6 0h6C19 21 17 12 16 2ZM10 24h12M12 19h8M13 13h6M14 8h4M6 29h20"/><path d="m13 19 8 5m-2-5-8 5"/></>
      : city === "Bali" ? <><path d="M15 29c5-7 3-16 1-19M16 10c-3-8-10-8-13-3 6-1 9 0 13 3Zm0 0c2-8 9-9 13-5-6 0-8 2-13 5Zm0 0c-7-1-12 3-12 8 4-4 8-6 12-8Zm0 0c7-3 13 2 13 8-4-5-8-7-13-8ZM6 29h18"/></>
      : city === "Tokyo" ? <><path d="M3 6q13 4 26 0M5 10h22M4 15h24M9 10v19M23 10v19M8 29h4m9 0h4M16 10v5" strokeWidth="2.5"/></>
      : city === "New York" ? <><path d="M11 29h13v-4H11zM14 25l1-13h5l3 13M16 12l-5-6-3 1 7 10M8 7V3m-2 1h4M17 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 4l-1-2m3 1V1m2 3 2-2M20 14l4 2-2 6M17 15v10"/></>
      : <><path d="m4 13 3-6 15-4 6 7v19H4ZM4 13l24-3M4 21l24-2M10 8v21M17 6v23M23 5v24"/><path d="M6 17v-2m7 2v-3m7 2v-3m6 2v-3M6 27v-3m7 3v-4m7 3v-4m6 4v-4" strokeWidth="2.5"/></>}
  </svg>;
}

export function HomeScreen({ user, ownerId, accessToken, refreshToken, onNavigate, onOpenTrip, onOpenSaved, onOpenCommunity, onBuildRoute, onSearchDestination, initialSearchQuery, onToggleSaved, savedRouteIds = [], onOpenNotifications, unreadCount = 0 }: {
  user: AuthUser | null; ownerId?: string | null; accessToken?: string; refreshToken?: number;
  onNavigate: (view: ViewId) => void; onOpenCommunity: (countryCode?: string) => void;
  onOpenTrip?: (id: string) => void; onOpenSaved?: (section: "routes" | "places" | "events") => void;
  onSurprise: (route: RouteSuggestion) => void; onBuildRoute: (route: RouteSuggestion) => void; onNotice: (message: string) => void;
  onSearchDestination?: (query: string) => void; onToggleSaved?: (route: RouteSuggestion) => void;
  initialSearchQuery?: string;
  savedRouteIds?: string[]; onOpenNotifications?: () => void; unreadCount?: number;
}) {
  const { locale, copy, dateLocale } = useI18n();
  const [query, setQuery] = useState(initialSearchQuery ?? "");
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
  const search = (value: string) => onSearchDestination ? onSearchDestination(value.trim()) : onNavigate("explore");
  const name = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim().split(/\s+/)[0] : copy("Gezgin", "Traveller");
  const tripTitle = nextTrip && ([nextTrip.destinationCity, nextTrip.destinationCountry].filter(Boolean).join(", ") || nextTrip.flightNumber || copy("Seyahatin", "Your trip"));
  const labelDate = (value: string) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short" }).format(new Date(value + "T12:00:00"));
  const features = [
    { kind: "route" as const, title: copy("Rota Oluştur", "Build a Route"), caption: copy("Hayalini Planla", "Plan Your Dream"), view: "route" as ViewId },
    { kind: "globe" as const, title: copy("Ülke Keşfet", "Explore Countries"), caption: copy("Keşfet, İlham Al", "Find Inspiration"), view: "explore" as ViewId },
    { kind: "passport" as const, title: copy("Pasaport & Vize", "Passport & Visa"), caption: copy("Sınırları Aş", "Cross Borders"), view: "passport" as ViewId },
    { kind: "trips" as const, title: copy("Seyahatlerim", "My Trips"), caption: copy("Tüm Planların Burada", "All Your Plans Here"), view: "trips" as ViewId },
    { kind: "tools" as const, title: copy("Tüm Araçlar", "All Tools"), caption: copy("Daha Fazlası", "And More"), view: "companion" as ViewId },
  ];
  return <div className="screen home-screen reference-home">
    <section className="rh-hero" aria-labelledby="rh-title">
      <img className="rh-hero-photo" src={santorini} alt="" fetchPriority="high" width={1448} height={1086}/>
      <header className="rh-header">
        <div className="rh-brand"><BrandMark /></div>
        <div className="rh-header-actions"><button type="button" className="rh-bell" onClick={() => onOpenNotifications?.()} aria-label={`${copy("Bildirimler", "Notifications")}${unreadCount > 0 ? `, ${unreadCount} ${copy("okunmamış", "unread")}` : ""}`}><Icon name="bell" size={26}/>{unreadCount > 0 && <i/>}</button><button type="button" className="rh-profile" onClick={() => onNavigate("profile")} aria-label={copy("Profilini aç", "Open your profile")}><span className="rh-avatar"><img src={coastal} alt="" width={42} height={42}/></span><span>{copy("İyi günler", "Hello")}<strong>{name}!</strong></span><Icon name="chevron" size={16}/></button></div>
      </header>
      <div className="rh-hero-copy"><div><p className="rh-eyebrow">{copy("YENİ YERLER, YENİ HİKAYELER", "NEW PLACES, NEW STORIES")}</p><h1 id="rh-title">{copy("Sıradaki", "Where’s Your")}<br/>{copy("Hikayen", "Next")} <span>{copy("Nerede?", "Story?")}</span></h1><p className="rh-hero-subtitle">{copy("Dünya seni bekliyor. Hayal et, planla, keşfet!", "The world is waiting. Dream, plan, explore!")}</p></div><p className="rh-handwritten" aria-hidden="true">{copy("Keşfet", "Explore")}<br/><span>{copy("Planla", "Plan")}</span><br/><span>{copy("Yaşa", "Live")}</span></p></div>
      <form className="rh-search" role="search" onSubmit={event => { event.preventDefault(); search(query); }}><Icon name="search" size={28}/><label className="sr-only" htmlFor="home-destination-search">{copy("Nereye gitmek istersin?", "Where would you like to go?")}</label><input id="home-destination-search" type="search" enterKeyHint="search" autoComplete="off" placeholder={copy("Nereye gitmek istersin?", "Where would you like to go?")} value={query} onChange={event => setQuery(event.target.value)}/><button type="submit" aria-label={copy("Destinasyon ara", "Search destinations")}><Icon name="search" size={28}/></button></form>
      <div className="rh-city-chips" aria-label={copy("Hızlı keşfet", "Quick discoveries")}>{cities.map(city => <button key={city} type="button" onClick={() => search(city)}><Landmark city={city}/><span>{city === "Roma" ? copy("Roma", "Rome") : city}</span></button>)}</div>
    </section>
    <div className="rh-content">
      <nav className="rh-features" aria-label={copy("Seyahatini planla", "Plan your journey")}>{features.map(feature => <button key={feature.kind} type="button" onClick={() => onNavigate(feature.view)}><TravelFeatureIcon kind={feature.kind} size={68}/><strong>{feature.title}</strong><small>{feature.caption}</small></button>)}</nav>
      <section className={`rh-personal-banner${nextTrip ? " rh-has-trip" : ""}`} aria-labelledby="rh-personal-title" aria-busy={loading}><img src={coastal} alt="" width={1600} height={533} loading="lazy"/><div className="rh-personal-copy"><p className="rh-eyebrow">{copy(nextTrip ? "SIRADAKİ SEYAHATİN" : "SANA ÖZEL", nextTrip ? "YOUR NEXT TRIP" : "JUST FOR YOU")}</p><h2 id="rh-personal-title">{nextTrip ? tripTitle : <>{copy("Bir Sonraki Seyahatini", "Ready to Plan")}<br/>{copy("Planlamaya Hazır mısın?", "Your Next Adventure?")}</>}</h2>
        {nextTrip && step ? <><p>{labelDate(nextTrip.startDate)} – {labelDate(nextTrip.endDate)}{step.stage === "preparing" && step.total > 0 ? ` · ${step.completed}/${step.total} ${copy("hazırlık tamam", "tasks ready")}` : ""}</p><button type="button" className="rh-yellow-button" onClick={() => step.stage === "travelling" ? openSaved("places") : openTrip()}>{step.stage === "travelling" ? copy("Bugünün Yerleri", "Today's Places") : step.stage === "wrap-up" ? copy("Seyahati Tamamla", "Finish Trip") : copy("Seyahatimi Aç", "Open My Trip")}<Arrow/></button></> : <><p>{copy("Kişisel öneriler, rotalar ve daha fazlası", "Personal ideas, routes and more")}<br/>{copy("seni bekliyor.", "are waiting for you.")}</p><button type="button" className="rh-yellow-button" onClick={() => onNavigate("route")}>{copy("Hemen Başla", "Get Started")}<Arrow/></button></>}
      </div><p className="rh-banner-handwritten" aria-hidden="true">{copy("İyi yolculuklar", "Happy travels")}<br/><span>{copy("her zaman…", "always…")}</span></p></section>
      {loading && <p className="rh-trip-feedback" role="status">{copy("Seyahatin hazırlanıyor…", "Getting your trip ready…")}</p>}
      {failed && <div className="rh-trip-feedback" role="status"><span>{copy(nextTrip ? "Seyahat bilgileri yenilenemedi." : "Kayıtlı seyahatin şu an yüklenemedi.", "Your trip details couldn't be refreshed.")}</span><button type="button" onClick={() => { setTripRequest(null); setRetry(value => value + 1); }}>{copy("Yeniden dene", "Try again")}</button></div>}
      <section className="rh-popular" aria-labelledby="rh-popular-title"><div className="rh-section-heading"><h2 id="rh-popular-title"><span className="rh-heading-icon" aria-hidden="true"><PopularFlame/></span> {copy("Popüler Rotalar", "Popular Routes")}</h2><button type="button" onClick={() => onNavigate("explore")}>{copy("Tümünü Gör", "See All")}<Arrow/></button></div><div className="rh-destination-grid">{homeDestinations(locale).map(route => <article key={route.destinationCode} className="rh-destination-card"><img src={artwork[route.destinationCode || ""] || santorini} alt="" width={280} height={350} loading="lazy" decoding="async"/><button type="button" className={`rh-favorite${savedRouteIds.includes(route.destinationCode || "") ? " is-saved" : ""}`} aria-pressed={savedRouteIds.includes(route.destinationCode || "")} aria-label={copy(`${route.cityOrRegion} rotasını kaydet`, `Save ${route.cityOrRegion} route`)} onClick={() => onToggleSaved?.(route)}><Icon name="heart" size={24}/></button><button type="button" className="rh-destination-open" onClick={() => onBuildRoute(route)} aria-label={copy(`${route.cityOrRegion} rotasını aç`, `Open ${route.cityOrRegion} route`)}><span><strong>{route.cityOrRegion}</strong><small><svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><path d="M6 0a6 6 0 0 0-6 6c0 4 6 10 6 10s6-6 6-10a6 6 0 0 0-6-6Zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/></svg>{route.country}</small></span><span className="rh-card-arrow"><Arrow/></span></button></article>)}</div></section>
      <section className="rh-community"><div className="rh-community-avatars" aria-hidden="true">{[0, 1, 2].map(index => <span key={index}><img src={communityTravelers} alt="" loading="lazy" style={{ objectPosition: `${index * 50}% center` }}/></span>)}</div><div><h2>{copy("Gezgin Topluluğu", "Traveller Community")}</h2><p>{copy("Deneyimlerini paylaş, ilham al,", "Share experiences, find inspiration,")}<br/>{copy("yeni arkadaşlar edin.", "make new friends.")}</p></div><button type="button" onClick={() => onOpenCommunity()}>{copy("Topluluğa Katıl", "Join the Community")}<Arrow/></button></section>
    </div>
  </div>;
}
