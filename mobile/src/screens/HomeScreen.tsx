import { formatAppDate } from "../lib/localeFormatting";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { Icon } from "../components/Icon";
import { TravelToolArtwork } from "../components/TravelToolArtwork";
import { HomeShortcutPicker } from "../components/HomeShortcutPicker";
import { useHomeShortcuts } from "../hooks/useHomeShortcuts";
import { appTools, type JourneyToolId, type TravelAssistantTool } from "../lib/appTools";
import { useI18n } from "../lib/i18n";
import { listCockpitTrips, type CockpitTrip } from "../lib/supabaseData";
import { localIsoDate } from "../lib/dates";
import { homeJourneyStep, nextHomeJourney } from "../lib/homeJourney";
import { searchApp, type GlobalSearchResult } from "../lib/globalSearch";
import daylight from "../assets/home-reference/santorini-daylight-v3.webp";
import festival from "../assets/home-reference/event-festival-v3.webp";
import paris from "../assets/home-reference/paris-eiffel-v3.webp";
import tokyo from "../assets/home-reference/tokyo-temple-v5.webp";
import coastal from "../assets/home-reference/coastal-banner.webp";
import bali from "../assets/home-reference/bali-beach-v5.webp";
import rome from "../assets/destination-artwork/rome.webp";
import communityTravelers from "../assets/home-reference/community-travelers.webp";
import "./reference-home.css";
import type { AuthUser, RouteSuggestion, ViewId } from "../types";

const cities = [
  { name: "Paris", art: paris },
  { name: "Bali", art: bali },
  { name: "Tokyo", art: tokyo },
  { name: "Roma", art: rome },
] as const;

function Arrow() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15m-6-7 7 7-7 7" /></svg>;
}

function HeadingArtwork({ kind }: { kind: "city" | "shortcuts" }) {
  const id = `home-heading-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <svg className={`rh-heading-art rh-heading-art-${kind}`} width={40} height={40} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-blue`} x1="12" y1="20" x2="48" y2="55" gradientUnits="userSpaceOnUse"><stop stopColor="#3EACFF"/><stop offset="1" stopColor="#0865E5"/></linearGradient>
      <linearGradient id={`${id}-gold`} x1="30" y1="8" x2="45" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#FFE47B"/><stop offset="1" stopColor="#FFBE29"/></linearGradient>
    </defs>
    {kind === "city" ? <>
      <circle className="rh-heading-backdrop" cx="32" cy="32" r="28"/>
      <g className="rh-heading-sun">
        <circle cx="43" cy="19" r="8" fill={`url(#${id}-gold)`}/>
        <path d="M43 7V5m0 28v-2M31 19h-2m28 0h-2M34.5 10.5 33 9m20 20-1.5-1.5m0-17L53 9" stroke="#FFC533" strokeWidth="2" strokeLinecap="round"/>
      </g>
      <path className="rh-heading-cloud" d="M9 20h14a4 4 0 0 0 0-8 5 5 0 0 0-9-2 5 5 0 0 0-5 10Z" fill="#FFF" stroke="#94CEFA" strokeWidth="1.5"/>
      <path d="M9 53V32l8-7 8 7v21H9Z" fill="#69C4FF"/>
      <path d="M24 53V22a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v31H24Z" fill={`url(#${id}-blue)`}/>
      <path d="M40 53V37a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v16H40Z" fill="#1383F0"/>
      <path d="M31 19v-6m-2 15h6m-6 7h6m-6 7h6M15 35h4m-4 7h4m26-1h5m-5 7h5" stroke="#FFF" strokeWidth="2.3" strokeLinecap="round"/>
      <path d="M8 54h48" stroke="#085BC9" strokeWidth="2.5" strokeLinecap="round"/>
      <path className="rh-heading-city-route" d="M12 58h39" stroke="#FFC632" strokeWidth="2.7" strokeLinecap="round" strokeDasharray="3 7"/>
    </> : <>
      <circle cx="32" cy="33" r="25" fill="#054EA8" opacity=".18"/>
      <circle cx="32" cy="31" r="25" fill={`url(#${id}-blue)`} stroke="#77C8FF" strokeWidth="1.5"/>
      <circle cx="32" cy="31" r="19" fill="#F3FAFF"/>
      <path d="M32 14v3m0 28v3M15 31h3m28 0h3M20 19l2 2m20 20 2 2m0-24-2 2M22 41l-2 2" stroke="#7ABAF0" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="32" cy="9.5" r="1.6" fill="#FFE07A"/>
      <g className="rh-heading-compass-needle">
        <path d="m32 15 7 16-7 16-7-16 7-16Z" fill="#0B6CDF"/>
        <path d="m32 15 7 16H25l7-16Z" fill={`url(#${id}-gold)`}/>
        <path d="m32 15 7 16-7 16V15Z" fill="#003F951A"/>
      </g>
      <circle cx="32" cy="31" r="3.2" fill="#FFF" stroke="#0B6CDF" strokeWidth="1.5"/>
    </>}
  </svg>;
}

export function HomeScreen({ user, ownerId, accessToken, refreshToken, onNavigate, onOpenTool, onOpenJourneyTool, onOpenGuide, onOpenGlobalSearch, onOpenCountry, onOpenTrip, onOpenCommunity, onSearchDestination, initialSearchQuery }: {
  user: AuthUser | null; ownerId?: string | null; accessToken?: string; refreshToken?: number;
  onNavigate: (view: ViewId) => void; onOpenCommunity: (countryCode?: string) => void;
  onOpenTrip?: (id: string, section?: "today") => void; onOpenSaved?: (section: "routes" | "places" | "events") => void;
  onSurprise: (route: RouteSuggestion) => void; onBuildRoute: (route: RouteSuggestion) => void; onNotice: (message: string) => void;
  onSearchDestination?: (query: string) => void; onToggleSaved?: (route: RouteSuggestion) => void;
  onOpenGlobalSearch?: (query: string) => void; onOpenTool?: (tool: TravelAssistantTool) => void;
  onOpenJourneyTool?: (tool: JourneyToolId) => void; onOpenGuide?: () => void;
  onOpenCountry?: (code: string) => void;
  initialSearchQuery?: string;
  savedRouteIds?: string[];
}) {
  const { locale, copy, dateLocale } = useI18n();
  const shortcuts = useHomeShortcuts(ownerId);
  const [editingShortcuts, setEditingShortcuts] = useState(false);
  const [query, setQuery] = useState(initialSearchQuery ?? "");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // The public catalog is local and cached. Typing never starts an AI or account request.
  const suggestions = useMemo(() => query.trim().length >= 2 ? searchApp(query, locale).slice(0, 6) : [], [query, locale]);
  const showSuggestions = searchFocused && query.trim().length >= 2;
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
  const openTrip = (section?: "today") => nextTrip && onOpenTrip ? onOpenTrip(nextTrip.id, section) : onNavigate("cockpit");
  const search = (value: string) => onSearchDestination ? onSearchDestination(value.trim()) : onNavigate("explore");
  const selectSuggestion = (result: GlobalSearchResult) => {
    setSearchFocused(false); setActiveSuggestion(-1); setQuery(result.title);
    if (result.kind === "tool") {
      if (result.guide && onOpenGuide) onOpenGuide();
      else if (result.journeyTool && onOpenJourneyTool) onOpenJourneyTool(result.journeyTool);
      else if (result.tool && onOpenTool) onOpenTool(result.tool);
      else onNavigate(result.view);
    }
    else if (result.kind === "city") search(result.query);
    else if (result.kind === "country") { if (onOpenCountry) onOpenCountry(result.countryCode); else search(result.title); }
  };
  const submitSearch = () => {
    if (showSuggestions && activeSuggestion >= 0 && suggestions[activeSuggestion]) { selectSuggestion(suggestions[activeSuggestion]); return; }
    setSearchFocused(false); setActiveSuggestion(-1);
    if (onOpenGlobalSearch) onOpenGlobalSearch(query.trim()); else search(query);
  };
  const tripTitle = nextTrip && ([nextTrip.destinationCity, nextTrip.destinationCountry].filter(Boolean).join(", ") || nextTrip.flightNumber || copy("Seyahatin", "Your trip"));
  const labelDate = (value: string) => formatAppDate(new Date(value + "T12:00:00"), dateLocale, { day: "numeric", month: "short" });
  const tools = appTools(locale);
  const features = shortcuts.views.flatMap(id => { const tool = tools.find(item => item.id === id); return tool ? [tool] : []; });
  const compactShortcutLabels: Record<string, string> = {
    route: copy("Rota", "Route", "Itinerar"), explore: copy("Ülkeler", "Explore", "Shtete"),
    passport: copy("Vize", "Visa", "Viza"), trips: copy("Planlar", "Plans", "Planet"),
    companion: copy("Araçlar", "Tools", "Mjete"), costs: copy("Bütçe", "Budget", "Buxheti"),
  };
  return <div className="screen home-screen reference-home">
    <section className="rh-hero" aria-labelledby="rh-title">
      <img className="rh-hero-photo" src={daylight} alt="" fetchPriority="high" width={1536} height={1024}/>
      <div className="rh-hero-copy"><h1 id="rh-title">{copy("Sıradaki hikâyen", "Your next story", "Historia jote e radhës")}<span>{copy("nerede?", "starts where?", "ku fillon?")}</span></h1><p className="rh-hero-subtitle">{copy("Hayal et, planla, keşfet.", "Dream, plan, explore.", "Ëndërro, planifiko, zbulo.")}</p></div>
      <div className="rh-search-shell" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setSearchFocused(false); setActiveSuggestion(-1); } }}>
        <form className="rh-search" role="search" onSubmit={event => { event.preventDefault(); submitSearch(); }}>
          <Icon name="search" size={28}/><label className="sr-only" htmlFor="home-destination-search">{copy("Ülke, şehir, araç, kayıtlı rota veya seyahat ara", "Search countries, cities, tools, saved routes or trips", "Kërko shtete, qytete, mjete, itinerare ose udhëtime të ruajtura")}</label>
          <input id="home-destination-search" data-guide="home-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={showSuggestions ? "home-search-options" : undefined} aria-activedescendant={showSuggestions && activeSuggestion >= 0 && suggestions[activeSuggestion] ? `home-search-option-${activeSuggestion}` : undefined} maxLength={120} enterKeyHint="search" autoComplete="off" placeholder={copy("Şehir, ülke veya araç ara", "Search cities, countries or tools", "Kërko qytet, shtet ose mjet")} value={query} onFocus={() => setSearchFocused(true)} onChange={event => { setQuery(event.target.value); setSearchFocused(true); setActiveSuggestion(-1); }} onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); setSearchFocused(false); setActiveSuggestion(-1); }
            else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) { event.preventDefault(); setSearchFocused(true); setActiveSuggestion(index => event.key === "ArrowDown" ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length - 1 : index - 1)); }
          }}/>
          <button type="submit" aria-label={onOpenGlobalSearch ? copy("Uygulamada ara", "Search the app", "Kërko në aplikacion") : copy("Destinasyon ara", "Search destinations", "Kërko destinacione")}><Icon name="search" size={28}/></button>
        </form>
        {showSuggestions && <div className="rh-search-suggestions">
          <ul id="home-search-options" role="listbox" aria-label={copy("Arama önerileri", "Search suggestions", "Sugjerime kërkimi")}>
            {suggestions.map((result, index) => <li key={result.id} id={`home-search-option-${index}`} role="option" aria-selected={activeSuggestion === index} onMouseDown={event => event.preventDefault()} onClick={() => selectSuggestion(result)}>
              <span className="rh-suggestion-art" aria-hidden="true"><TravelToolArtwork kind={result.kind === "tool" ? result.icon : "globe"} size={36}/></span><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><Icon name="chevron" size={18}/>
            </li>)}
          </ul>
          {!suggestions.length && <p role="status">{copy("Bu yazıyla eşleşen öneri yok. Bir şehir veya araç adı dene.", "No matching suggestion. Try a city or tool name.", "Nuk ka sugjerim. Provo emrin e një qyteti ose mjeti.")}</p>}
          {onOpenGlobalSearch && <button type="button" className="rh-search-all" onClick={() => { setSearchFocused(false); onOpenGlobalSearch(query.trim()); }}>{copy("Tüm sonuçları ve kayıtlarımı ara", "Search all results and my saved items", "Kërko të gjitha rezultatet dhe ruajtjet e mia")}<Arrow/></button>}
        </div>}
      </div>
    </section>
    <div className="rh-content">
      <section className="rh-city-discovery" aria-labelledby="rh-city-title">
        <div className="rh-city-heading"><HeadingArtwork kind="city"/><h2 id="rh-city-title">{copy("Bir şehirle başla", "Start with a city", "Fillo me një qytet")}</h2></div>
        <nav className="rh-city-chips" aria-label={copy("Hızlı keşfet", "Quick discoveries", "Zbulime të shpejta")}>{cities.map(city => <button key={city.name} type="button" className={`rh-city-card rh-city-${city.name.toLowerCase()}`} aria-label={city.name === "Roma" ? copy("Roma", "Rome", "Roma") : city.name} onClick={() => search(city.name)}><span className="rh-city-image"><img src={city.art} alt="" width={400} height={300} decoding="async"/></span><span className="rh-city-caption"><svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><path d="M6 0a6 6 0 0 0-6 6c0 4 6 10 6 10s6-6 6-10a6 6 0 0 0-6-6Zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/></svg><strong>{city.name === "Roma" ? copy("Roma", "Rome", "Roma") : city.name}</strong></span></button>)}</nav>
      </section>
      <div className="rh-shortcuts-heading"><div className="rh-shortcuts-title"><HeadingArtwork kind="shortcuts"/><h2>{copy("Kısayollarım", "My shortcuts", "Shkurtoret e mia")}</h2></div><button type="button" onClick={() => setEditingShortcuts(true)}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15l-1 6Z"/></svg>{copy("Düzenle", "Edit", "Ndrysho")}</button></div>
      <nav className="rh-features" style={{ "--shortcut-count": features.length } as CSSProperties} aria-label={copy("Seyahatini planla", "Plan your journey", "Planifiko udhëtimin")}>{features.map(feature => <button key={feature.id} data-guide={feature.id === "route" ? "home-route" : undefined} type="button" aria-label={`${feature.label} — ${feature.text}`} onClick={() => feature.tool && onOpenTool ? onOpenTool(feature.tool) : onNavigate(feature.view)}><TravelToolArtwork kind={feature.icon} size={68}/><strong><span className="rh-shortcut-full">{feature.label}</span><span className="rh-shortcut-compact">{compactShortcutLabels[feature.id] || feature.label}</span></strong><small>{feature.text}</small></button>)}</nav>
      <button type="button" data-guide="home-events" className="rh-event-radar" onClick={() => onNavigate("events")}><span className="rh-event-copy"><Icon name="calendar" size={27}/><strong>{copy("Etkinlik Radarı", "Event Radar", "Radar aktivitetesh")}</strong><small>{copy("Gideceğin şehirde neler var?", "What's on in your next city?", "Çfarë ka në qytetin ku po shkon?")}</small><span>{copy("Etkinlikleri keşfet", "Explore events", "Eksploro aktivitetet")}<Arrow/></span></span><img className="rh-event-photo" src={festival} alt="" width={900} height={600} loading="lazy" decoding="async"/></button>
      {nextTrip && step && <section className="rh-personal-banner rh-has-trip" aria-labelledby="rh-personal-title" aria-busy={loading}><img src={coastal} alt="" width={1600} height={533} loading="lazy"/><div className="rh-personal-copy"><p className="rh-eyebrow">{copy("SIRADAKİ SEYAHATİN", "YOUR NEXT TRIP", "UDHËTIMI YT I RADHËS")}</p><h2 id="rh-personal-title">{tripTitle}</h2>
        <p>{labelDate(nextTrip.startDate)} – {labelDate(nextTrip.endDate)}{step.stage === "preparing" && step.total > 0 ? ` · ${step.completed}/${step.total} ${copy("hazırlık tamam", "tasks ready")}` : ""}</p><button type="button" className="rh-yellow-button" onClick={() => openTrip(step.stage === "travelling" ? "today" : undefined)}>{step.stage === "travelling" ? copy("Bugünün Programı", "Today's Itinerary", "Programi i sotëm") : step.stage === "wrap-up" ? copy("Seyahati Tamamla", "Finish Trip") : copy("Seyahatimi Aç", "Open My Trip")}<Arrow/></button>
      </div><p className="rh-banner-handwritten" aria-hidden="true">{copy("İyi yolculuklar", "Happy travels")}<br/><span>{copy("her zaman…", "always…")}</span></p></section>}
      {loading && <p className="rh-trip-feedback" role="status">{copy("Seyahatin hazırlanıyor…", "Getting your trip ready…")}</p>}
      {failed && <div className="rh-trip-feedback" role="status"><span>{copy(nextTrip ? "Seyahat bilgileri yenilenemedi." : "Kayıtlı seyahatin şu an yüklenemedi.", "Your trip details couldn't be refreshed.")}</span><button type="button" onClick={() => { setTripRequest(null); setRetry(value => value + 1); }}>{copy("Yeniden dene", "Try again")}</button></div>}
      <section className="rh-community"><div className="rh-community-avatars" aria-hidden="true">{[0, 1, 2].map(index => <span key={index}><img src={communityTravelers} alt="" loading="lazy" style={{ objectPosition: `${index * 50}% center` }}/></span>)}</div><div><h2>{copy("Gezgin Topluluğu", "Traveller Community")}</h2><p>{copy("Deneyimlerini paylaş, ilham al,", "Share experiences, find inspiration,")}<br/>{copy("yeni arkadaşlar edin.", "make new friends.")}</p></div><button type="button" onClick={() => onOpenCommunity()}>{copy("Topluluğa Katıl", "Join the Community")}<Arrow/></button></section>
    </div>
    {editingShortcuts && <HomeShortcutPicker key={ownerId ? `user-${ownerId}` : "guest"} views={shortcuts.views} onSave={shortcuts.save} onClose={() => setEditingShortcuts(false)}/>}
  </div>;
}
