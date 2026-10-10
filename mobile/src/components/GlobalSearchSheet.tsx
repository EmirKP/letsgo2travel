import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { getSavedRoutePlans } from "../lib/storage";
import { searchApp, type GlobalSearchKind, type GlobalSearchResult, type SearchableTrip } from "../lib/globalSearch";
import { listCockpitTrips } from "../lib/supabaseData";
import type { TravelAssistantTool } from "../lib/appTools";
import type { SavedRoutePlan, ViewId } from "../types";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { TravelToolArtwork } from "./TravelToolArtwork";
import "./global-search.css";

type TripSearchState = { owner: string; token: string; attempt: number; status: "loading" | "ready" | "error"; trips: SearchableTrip[] };

export function GlobalSearchSheet({ open, onClose, ownerId, accessToken, initialQuery = "", onNavigate, onOpenTool, onOpenCountry, onSearchDestination, onOpenSavedRoute, onOpenTrip }: {
  open: boolean; onClose: () => void; ownerId?: string | null; accessToken?: string; initialQuery?: string;
  onNavigate: (view: ViewId) => void;
  onOpenTool: (tool: TravelAssistantTool) => void;
  onOpenCountry: (alpha3: string) => void;
  onSearchDestination: (query: string) => void;
  onOpenSavedRoute: (id: string) => void;
  onOpenTrip: (id: string) => void;
}) {
  const { copy, locale } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const owner = ownerId || null;
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<GlobalSearchKind | undefined>();
  const [saved, setSaved] = useState<{ owner: string | null; routes: SavedRoutePlan[] }>({ owner, routes: [] });
  const [missing, setMissing] = useState(false);
  const [tripState, setTripState] = useState<TripSearchState | null>(null);
  const [tripAttempt, setTripAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery); setFilter(undefined); setMissing(false);
    const refresh = () => setSaved({ owner, routes: getSavedRoutePlans(owner) });
    refresh();
    window.addEventListener("l2t:storage-change", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("l2t:storage-change", refresh); window.removeEventListener("storage", refresh); };
  }, [open, owner, initialQuery]);
  useEffect(() => {
    if (!open || !owner || !accessToken) { setTripState(null); return; }
    let active = true;
    const request = { owner, token: accessToken, attempt: tripAttempt };
    setTripState({ ...request, status: "loading", trips: [] });
    void listCockpitTrips(owner, accessToken, true).then(items => {
      if (!active) return;
      // Keep only searchable summaries, never PNR, checklist or provider data.
      const trips = items.filter(item => item.userId === owner).map(({ id, userId, destinationCountry, destinationCode, destinationCity, startDate, endDate }) => ({ id, userId, destinationCountry, destinationCode, destinationCity, startDate, endDate }));
      setTripState({ ...request, status: "ready", trips });
    }).catch(() => { if (active) setTripState({ ...request, status: "error", trips: [] }); });
    return () => { active = false; };
  }, [open, owner, accessToken, tripAttempt]);
  const routes = saved.owner === owner ? saved.routes : [];
  const currentTrips = open && tripState?.owner === owner && tripState.token === accessToken && tripState.attempt === tripAttempt ? tripState : null;
  const tripsLoading = Boolean(open && owner && accessToken && (!currentTrips || currentTrips.status === "loading"));
  const tripsFailed = currentTrips?.status === "error";
  const results = useMemo(() => searchApp(query, locale, routes, filter, currentTrips?.trips), [query, locale, routes, filter, currentTrips]);
  const groups: Array<{ kind: GlobalSearchKind; label: string }> = [
    { kind: "tool", label: copy("Araçlar", "Tools", "Mjetet") },
    { kind: "country", label: copy("Ülkeler", "Countries", "Shtetet") },
    { kind: "city", label: copy("Şehirler", "Cities", "Qytetet") },
    { kind: "saved-route", label: copy("Kayıtlı rotalar", "Saved routes", "Itineraret e ruajtura") },
    { kind: "saved-trip", label: copy("Kayıtlı seyahatler", "Saved trips", "Udhëtimet e ruajtura") },
  ];
  const select = (result: GlobalSearchResult) => {
    if (result.kind === "saved-route" && !getSavedRoutePlans(owner).some(route => route?.id === result.routeId)) {
      setSaved({ owner, routes: getSavedRoutePlans(owner) }); setMissing(true); return;
    }
    if (result.kind === "saved-trip" && !currentTrips?.trips.some(trip => trip.id === result.tripId)) return;
    onClose();
    if (result.kind === "tool") { if (result.tool) onOpenTool(result.tool); else onNavigate(result.view); }
    else if (result.kind === "country") onOpenCountry(result.countryCode);
    else if (result.kind === "city") onSearchDestination(result.query);
    else if (result.kind === "saved-trip") onOpenTrip(result.tripId);
    else onOpenSavedRoute(result.routeId);
  };
  return <Sheet open={open} title={copy("Uygulamada ara", "Search the app", "Kërko në aplikacion")} onClose={onClose} size="large">
    <div className="global-search">
      <label htmlFor={id}>{copy("Ülke, şehir, araç veya kayıtlı seyahat", "Country, city, tool or saved trip", "Shtet, qytet, mjet ose udhëtim i ruajtur")}</label>
      <div className="global-search-field"><Icon name="search" size={21}/><input ref={input} id={id} type="search" maxLength={120} autoComplete="off" enterKeyHint="search" value={query} onChange={event => { setQuery(event.target.value); setMissing(false); }} placeholder={copy("Paris, vize, çeviri…", "Paris, visa, translation…", "Paris, vizë, përkthim…")}/>{query && <button type="button" onClick={() => { setQuery(""); setMissing(false); input.current?.focus(); }} aria-label={copy("Aramayı temizle", "Clear search", "Pastro kërkimin")}><Icon name="close" size={18}/></button>}</div>
      <div className="global-search-filters" role="group" aria-label={copy("Arama kapsamı", "Search scope", "Fusha e kërkimit")}><button type="button" aria-pressed={!filter} onClick={() => setFilter(undefined)}>{copy("Tümü", "All", "Të gjitha")}</button>{groups.map(group => <button key={group.kind} type="button" aria-pressed={filter === group.kind} onClick={() => setFilter(group.kind)}>{group.label}</button>)}</div>
      <p className="global-search-note" role="status">{!query.trim() ? copy("Ülkeler, şehirler, araçlar, cihazındaki rotalar ve hesabındaki seyahatlerde ara.", "Search countries, cities, tools, routes on this device and trips in your account.", "Kërko shtete, qytete, mjete, itinerare në këtë pajisje dhe udhëtime në llogarinë tënde.") : results.length ? copy(`${results.length} sonuç gösteriliyor.`, `Showing ${results.length} results.`, `Po shfaqen ${results.length} rezultate.`) : tripsLoading || tripsFailed ? copy("Diğer kategorilerde sonuç bulunamadı.", "No results in the other categories.", "Nuk ka rezultate në kategoritë e tjera.") : copy("Sonuç bulunamadı. Başka bir kelime veya kategori dene.", "No results. Try another word or category.", "Nuk u gjetën rezultate. Provo një fjalë ose kategori tjetër.")}</p>
      {tripsLoading && <p className="global-search-note" role="status">{copy("Kayıtlı seyahatlerin yükleniyor…", "Loading your saved trips…", "Po ngarkohen udhëtimet e tua të ruajtura…")}</p>}
      {tripsFailed && <div className="global-search-trip-error" role="status"><p>{copy("Kayıtlı seyahatlerin yüklenemedi. Diğer sonuçlarda arayabilirsin.", "Your saved trips could not be loaded. Other results are available.", "Udhëtimet e tua të ruajtura nuk u ngarkuan. Rezultatet e tjera janë të disponueshme.")}</p><button type="button" onClick={() => setTripAttempt(value => value + 1)}>{copy("Yeniden dene", "Try again", "Provo përsëri")}</button></div>}
      {filter === "saved-trip" && (!owner || !accessToken) && <p className="global-search-note" role="status">{copy("Kayıtlı seyahatlerinde aramak için giriş yap.", "Sign in to search your saved trips.", "Hyr për të kërkuar udhëtimet e tua të ruajtura.")}</p>}
      {missing && <p className="global-search-error" role="alert">{copy("Bu rota artık kayıtlı değil. Sonuçlar yenilendi.", "This route is no longer saved. Results have refreshed.", "Ky itinerar nuk është më i ruajtur. Rezultatet u rifreskuan.")}</p>}
      {groups.map(group => {
        const items = results.filter(result => result.kind === group.kind);
        return items.length ? <section key={group.kind} aria-label={group.label}><h3>{group.label}</h3><ul>{items.map(result => <li key={result.id}><button type="button" onClick={() => select(result)}><span className="global-search-art">{result.kind === "tool" ? <TravelToolArtwork kind={result.icon} size={42}/> : <Icon name={result.kind === "country" ? "globe" : result.kind === "city" ? "map" : "bookmark"} size={23}/>}</span><span className="global-search-result-copy"><strong>{result.title}</strong><small>{result.subtitle}</small></span><Icon name="chevron" size={16}/></button></li>)}</ul></section> : null;
      })}
    </div>
  </Sheet>;
}
