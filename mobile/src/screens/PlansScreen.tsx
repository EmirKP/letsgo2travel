import { formatAppDate } from "../lib/localeFormatting";
import { eventDateLabel, eventTimeLabel } from "../../../lib/event-time";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { CountryFlag } from "../components/CountryFlag";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { destinationArtwork } from "../data/artwork";
import { DISCOVERY_DESTINATIONS } from "../data/discovery";
import { Sheet } from "../components/Sheet";
import { TripCollaborationHub } from "../components/TripCollaborationHub";
import { TravelSavedPlaces } from "../components/TravelSavedPlaces";
import { PersonalTravelCards } from "../components/PersonalTravelCards";
import { readSavedPlaces, subscribeSavedPlaces } from "../lib/savedPlaces";
import { deleteUserTrip, getSupabaseDataErrorMessage, listUserTrips, type UserTripData } from "../lib/supabaseData";
import { onAccountResume } from "../lib/accountResume";
import {
  deleteRoutePlan,
  getFavoriteDestinations,
  getSavedRoutePlans,
  getSavedTravelEvents,
  removeSavedTravelEvent,
  saveRoutePlan,
  toggleSavedTravelEvent,
} from "../lib/storage";
import type { AuthUser, PlannerInput, RoutePlan, SavedRoutePlan, TravelEvent, ViewId } from "../types";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { queueRouteDelete, readRouteOutbox } from "../lib/routeOutbox";
import { syncSavedRoutes } from "../lib/routeSync";
import { cancelEventReminder } from "../lib/eventReminders";
import { createRouteCockpitIntent, type RouteCockpitIntent } from "../lib/routeCockpitIntent";
import { normalizeSearchText } from "../lib/searchText";
import "./daily-journey.css";
import "./plans-library.css";
import "./travel-flow-polish.css";

const JourneyToolsHub = lazy(() => import("../components/JourneyToolsHub").then((module) => ({ default: module.JourneyToolsHub })));

type PendingDelete =
  | { kind: "cloud"; item: UserTripData }
  | { kind: "route"; item: SavedRoutePlan }
  | { kind: "event"; item: TravelEvent };
type LibrarySection = "all" | "routes" | "places" | "countries" | "events" | "travel";

type SelectedPlan = {
  id: string;
  title: string;
  createdAt: string;
  input?: PlannerInput;
  plan: RoutePlan;
};

function cloudRoutePlan(item: UserTripData, locale: "tr" | "en" | "sq"): SelectedPlan | null {
  const candidate = item.tripData?.plan;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  if (!Array.isArray(record.routes) || record.routes.length === 0) return null;
  const routes = record.routes.filter((route) => route && typeof route === "object" && !Array.isArray(route));
  if (routes.length === 0) return null;
  const input = item.tripData?.input;
  return {
    id: item.clientKey || `remote-${item.id}`,
    title: item.title || item.destination || (locale === "tr" ? "Kayıtlı rota" : locale === "sq" ? "Rrugë e ruajtur" : "Saved route"),
    createdAt: typeof item.tripData.saved_at === "string" ? item.tripData.saved_at : item.createdAt,
    input: input && typeof input === "object" && !Array.isArray(input) ? input as PlannerInput : undefined,
    plan: {
      summary: typeof record.summary === "string" ? record.summary : (locale === "tr" ? "Kayıtlı rota önerin." : locale === "sq" ? "Sugjerimi yt i ruajtur i rrugës." : "Your saved route suggestion."),
      routes: routes as RoutePlan["routes"],
    },
  };
}

function date(value: string, locale = "tr-TR") {
  try {
    return formatAppDate(new Date(value), locale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

export function TripsScreen({ initialTool, initialSection, onOpenDestination, onOpenEvent, user, ownerId, accessToken, inviteCode, onInviteHandled, onOpenAccount, onNavigate, onNotice, onPrepareCockpit }: {
  onPrepareCockpit?: (intent: RouteCockpitIntent) => void;
  initialTool?: "airport";
  initialSection?: LibrarySection;
  onOpenDestination: (code: string) => void;
  onOpenEvent?: (id: string) => void;
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  inviteCode?: string;
  onInviteHandled?: () => void;
  onOpenAccount: () => void;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { copy, dateLocale, locale } = useI18n();
  const [routes, setRoutes] = useState<SavedRoutePlan[]>([]);
  const [favorites, setFavorites] = useState(() => getFavoriteDestinations(ownerId));
  const [libraryTab, setLibraryTab] = useState<LibrarySection>(inviteCode || initialTool ? "travel" : initialSection || "all");
  const [query, setQuery] = useState("");
  const lastInitialSection = useRef(initialSection);
  useEffect(() => {
    if (initialSection && initialSection !== lastInitialSection.current) { setLibraryTab(initialSection); setQuery(""); }
    lastInitialSection.current = initialSection;
  }, [initialSection]);
  const [savedPlaces, setSavedPlaces] = useState(() => readSavedPlaces(ownerId));
  const [sharedToolsOpen, setSharedToolsOpen] = useState(Boolean(inviteCode));
  const [otherToolsOpen, setOtherToolsOpen] = useState(Boolean(initialTool));
  useEffect(() => { setSavedPlaces(readSavedPlaces(ownerId)); return subscribeSavedPlaces(() => setSavedPlaces(readSavedPlaces(ownerId)), ownerId); }, [ownerId]);
  useEffect(() => { if (inviteCode || initialTool) setLibraryTab("travel"); if (inviteCode) setSharedToolsOpen(true); if (initialTool) setOtherToolsOpen(true); }, [inviteCode, initialTool]);
  const [savedEvents, setSavedEvents] = useState<TravelEvent[]>([]);
  const [cloudItems, setCloudItems] = useState<UserTripData[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [busyCloud, setBusyCloud] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [undo, setUndo] = useState<{ pending: PendingDelete; owner: string | null } | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [cloudRetry, setCloudRetry] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [unavailableCountry, setUnavailableCountry] = useState<{ name: string; alpha3: string } | null>(null);

  const refreshLocal = useCallback(() => {
    setRoutes(getSavedRoutePlans(ownerId));
    setFavorites(getFavoriteDestinations(ownerId));
    setSavedEvents(getSavedTravelEvents(ownerId));
  }, [ownerId]);

  useEffect(() => {
    refreshLocal();
    const update = () => refreshLocal();
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, [refreshLocal]);
  useEffect(() => {
    let active = true;
    if (!user || !accessToken) {
      setCloudItems([]);
      setCloudLoading(false);
      return () => { active = false; };
    }
    setCloudLoading(true);
    setCloudError("");
    void listUserTrips(user.id, accessToken, "route_plan")
      .then((items) => { if (active) setCloudItems(items); })
      .catch((error) => { if (active) setCloudError(getSupabaseDataErrorMessage(error, copy("Hesaptaki kayıtlar alınamadı. Cihazdaki kayıtlarını açabilirsin.", "Account items could not load. You can still open items on this device."))); })
      .finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [accessToken, copy, user, cloudRetry]);

  useEffect(() => onAccountResume(() => {
    if (user && accessToken && !busyCloud) setCloudRetry(value => value + 1);
  }), [user, accessToken, busyCloud]);

  const removeSavedRoute = async (saved: { id: string }, remoteId?: number | string) => {
    try {
      if (remoteId === undefined) setRoutes(deleteRoutePlan(saved.id, ownerId));
      else if (ownerId) { queueRouteDelete(ownerId, saved.id, remoteId); refreshLocal(); }
      setCloudItems(current => current.filter(item => item.clientKey !== saved.id && item.id !== remoteId));
      onNotice(ownerId ? copy("Rota cihazdan kaldırıldı; hesabından da kaldırılıyor.", "Route removed from this device; removing it from your account.") : copy("Rota silindi.", "Route deleted."));
      if (ownerId && accessToken) await syncSavedRoutes(ownerId, accessToken);
      if (ownerId && accessToken) onNotice(copy("Rota hesabından da kaldırıldı.", "Route also removed from your account."));
    } catch {
      let queued = false;
      try { queued = Boolean(ownerId && readRouteOutbox(ownerId)[saved.id]?.kind === "delete"); } catch { /* Preserve unreadable storage. */ }
      onNotice(queued ? copy("Silme isteği cihazda kayıtlı; bağlantı gelince yeniden denenecek.", "The deletion is saved on this device and will retry when connected.") : copy("Rota silinemedi. Cihaz depolamasını kontrol edip tekrar dene.", "Route could not be deleted. Check device storage and retry."));
    }
  };
  const removeCloudItem = async (item: UserTripData) => {
    if (!user || !accessToken || busyCloud) return;
    if (item.clientKey) return removeSavedRoute({ id: item.clientKey }, item.id);
    setBusyCloud(String(item.id));
    try {
      await deleteUserTrip(user.id, item.id, accessToken);
      setCloudItems(current => current.filter(candidate => candidate.id !== item.id));
      onNotice(copy("Kayıt hesabından silindi.", "The item was removed from your account."));
    } catch (error) { onNotice(getSupabaseDataErrorMessage(error, copy("Kayıt silinemedi.", "The item could not be deleted."))); }
    finally { setBusyCloud(""); }
  };

  const confirmDelete = () => {
    const pending = pendingDelete;
    if (!pending) return;
    setPendingDelete(null);
    if (pending.kind === "cloud") void removeCloudItem(pending.item);
    if (pending.kind === "route") {
      if (!ownerId) {
        try {
          setRoutes(deleteRoutePlan(pending.item.id, ownerId));
          setUndo({ pending, owner: null });
        } catch { onNotice(copy("Rota silinemedi. Cihaz depolamasını kontrol et.", "Route could not be removed. Check device storage.")); }
      } else void removeSavedRoute(pending.item);
    }
    if (pending.kind === "event") {
      try {
        setSavedEvents(removeSavedTravelEvent(pending.item.id, ownerId));
        setUndo({ pending, owner: ownerId || null });
        void cancelEventReminder(pending.item.id, ownerId).then(ok => { if (!ok) onNotice(copy("Hatırlatıcı iptali bekliyor; yeniden denenecek.", "Reminder cancellation is pending and will retry.")); }).catch(() => onNotice(copy("Hatırlatıcı iptal edilemedi.", "Reminder could not be cancelled.")));
        onNotice(ownerId ? copy("Etkinlik bu cihazdaki kayıtlarından çıkarıldı. Silme işlemi hesabınla eşitlenecek.", "The event was removed on this device. The removal is queued for account sync.", "Aktiviteti u hoq nga kjo pajisje. Heqja pret sinkronizimin me llogarinë.") : copy("Etkinlik planından çıkarıldı.", "Event removed from your plan.", "Aktiviteti u hoq nga plani yt."));
      } catch { onNotice(copy("Etkinlik silinemedi. Cihaz depolamasını kontrol et.", "Event could not be removed. Check device storage.")); }
    }
  };

  const undoDelete = () => {
    if (!undo || undo.owner !== (ownerId || null)) return;
    try {
      if (undo.pending.kind === "route") setRoutes(saveRoutePlan(undo.pending.item, ownerId));
      if (undo.pending.kind === "event" && !getSavedTravelEvents(ownerId).some(item => item.id === undo.pending.item.id)) {
        setSavedEvents(toggleSavedTravelEvent(undo.pending.item, ownerId).events);
      }
      onNotice(undo.pending.kind === "event" ? copy("Etkinlik geri geldi. Gerekirse hatırlatıcısını yeniden kur.", "Event restored. Set its reminder again if needed.") : copy("Rota geri geldi.", "Route restored."));
      setUndo(null);
    } catch { onNotice(copy("Kayıt geri alınamadı. Depolama alanını kontrol edip tekrar dene.", "Could not restore this item. Check device storage and retry.")); }
  };

  const routeQueue = ownerId ? readRouteOutbox(ownerId) : {};
  const pendingRoutes = Object.values(routeQueue).filter(item => item.pending).length;
  const cloudRoutes = cloudItems.filter((item) => item.mobileKind === "route_plan" && routeQueue[item.clientKey || ""]?.kind !== "delete" && !routes.some((route) => route.id === item.clientKey));
  const searchText = normalizeSearchText(query);
  const matches = (...parts: (string | undefined)[]) => !searchText || normalizeSearchText(parts.filter(Boolean).join(" ")).includes(searchText);
  const visibleRoutes = routes.filter(item => matches(item.plan.summary, ...item.plan.routes.map(route => `${route.name} ${route.country}`)));
  const visibleCloudRoutes = cloudRoutes.filter(item => matches(item.title, item.destination));
  const visibleEvents = savedEvents.filter(event => matches(event.title, event.city, event.venue));
  const visibleFavorites = favorites.filter(country => matches(country.name, country.alpha3));
  const categories: { id: LibrarySection; icon: IconName; title: string; note: string; count: number }[] = [
    { id: "routes", icon: "route", title: copy("Rotalarım", "My routes"), note: copy("Kaydettiğin gezi planları", "Your saved travel plans"), count: routes.length + cloudRoutes.length },
    { id: "places", icon: "map", title: copy("Yerlerim", "My places"), note: copy("Haritadan kaydettiğin yerler", "Places saved from the map"), count: savedPlaces.items.length },
    { id: "events", icon: "calendar", title: copy("Etkinliklerim", "My events"), note: copy("Kaçırmak istemediklerin", "The things you don't want to miss"), count: savedEvents.length },
    { id: "countries", icon: "heart", title: copy("Ülkelerim", "My countries"), note: copy("Gitmek istediğin ülkeler", "Countries on your wishlist"), count: favorites.length },
  ];
  const selectedCategory = categories.find(item => item.id === libraryTab);
  const visibleCount = libraryTab === "routes" ? visibleRoutes.length + visibleCloudRoutes.length : libraryTab === "events" ? visibleEvents.length : visibleFavorites.length;
  const chooseSection = (section: LibrarySection) => { setQuery(""); setLibraryTab(section); };

  return (
    <div className="screen saved-screen daily-saved plans-library">
      {libraryTab === "all" ? <>
        <header className="plans-page-heading"><div><span>{copy("HAYALDEN YOLCULUĞA", "FROM IDEAS TO ADVENTURES")}</span><h1>{copy("Planların", "Your Plans")}</h1></div><span className="plans-heading-icon" aria-hidden="true"><Icon name="suitcase" size={25}/></span></header>
        <section className="plans-hero" aria-labelledby="plans-hero-title">
          <div className="plans-hero-copy"><span className="plans-hero-kicker"><Icon name="compass" size={16}/>{copy("SIRADAKİ GÜZEL YOLCULUĞA", "FOR YOUR NEXT GREAT JOURNEY")}</span><h2 id="plans-hero-title">{copy("Bir hayalle başla.", "Start with a little daydream.")}<br/><span>{copy("Rotanı birlikte çizelim.", "Let's make it a plan.")}</span></h2><p>{copy("Zamanına, bütçene ve seyahat tarzına uygun bir rota oluştur.", "Build a route around your time, budget and travel style.")}</p><button type="button" className="plans-create-button" onClick={() => onNavigate("route")}><Icon name="plus" size={19}/>{copy("Yeni rota oluştur", "Create a new route")}<Icon name="chevron" size={18}/></button></div>
        </section>
        <button type="button" className="plans-trip-entry" onClick={() => onNavigate("cockpit")}><span className="plans-trip-icon"><Icon name="plane" size={26}/></span><span><strong>{copy("Seyahatimi yönet", "Manage my trip")}</strong><small>{copy("Uçuşun, tarihlerin ve hazırlık listen bir arada.", "Your flight, dates and checklist, together.")}</small></span><Icon name="chevron" size={20}/></button>
        <section className="plans-collections" aria-labelledby="plans-collections-title"><div className="plans-section-heading"><div><h2 id="plans-collections-title">{copy("Kaydettiklerin", "Your saved discoveries")}</h2><p>{copy("Aklında kalan her şey, elinin altında.", "All the ideas you want to come back to.")}</p></div><Icon name="bookmark" size={20}/></div>
          <div className="plans-category-grid">{categories.map(item => {
            const pendingCount = item.id === "routes" && cloudLoading;
            const unavailableCount = item.id === "places" && Boolean(savedPlaces.error);
            return <button type="button" className="plans-category" data-section={item.id} key={item.id} onClick={() => chooseSection(item.id)}>
              <span className="plans-category-picture" aria-hidden="true"><span className="plans-category-icon"><Icon name={item.icon} size={23}/></span></span>
              <span className="plans-category-copy"><span className="plans-category-title"><strong>{item.title}</strong><span className="plans-category-count" aria-label={pendingCount ? copy("Kayıtlar yükleniyor", "Loading saved items") : unavailableCount ? copy("Liste okunamadı", "The list couldn't be read") : copy(`${item.count} kayıt`, `${item.count} saved`)}>{pendingCount ? "…" : unavailableCount ? "!" : item.count}</span></span><small>{item.note}</small>
                {item.id === "places" && <em>{savedPlaces.error ? copy("Listeyi kontrol et", "Check your list") : ownerId ? (savedPlaces.pending ? copy("Eşitleme bekliyor", "Waiting to sync") : copy("Hesabındaki yerler", "Places in your account", "Vendet në llogarinë tënde")) : copy(`${item.count} yer · Bu cihazda`, `${item.count} ${item.count === 1 ? "place" : "places"} · On this device`)}</em>}
                {item.id !== "places" && !pendingCount && !item.count && !(item.id === "routes" && cloudError) && <em>{copy("Henüz kayıt yok", "Nothing saved yet")}</em>}
              </span>
            </button>;
          })}</div>
        </section>
        <section className="plans-essentials" aria-labelledby="plans-essentials-title"><div className="plans-section-heading"><div><h2 id="plans-essentials-title">{copy("Yolculukta yanında", "Ready for the journey")}</h2><p>{copy("Küçük hazırlıklar, daha rahat bir seyahat.", "A little preparation goes a long way.")}</p></div></div><div className="plans-tool-list"><button type="button" onClick={() => chooseSection("travel")}><span className="plans-tool-icon"><Icon name="offline" size={23}/></span><span><strong>{copy("İnternetsiz seyahat kartı", "Offline travel card")}</strong><small>{copy("Otel, adres ve kişisel notların bu cihazda", "Hotel, address and personal notes on this device")}</small></span><Icon name="chevron" size={18}/></button><button type="button" onClick={() => chooseSection("travel")}><span className="plans-tool-icon"><Icon name="users" size={23}/></span><span><strong>{copy("Ortak planlar ve araçlar", "Shared plans and tools")}</strong><small>{copy("Arkadaşlarla planla, masrafları paylaş", "Plan with friends and share expenses")}</small></span><Icon name="chevron" size={18}/></button></div></section>
        <p className="plans-storage-note"><Icon name="offline" size={16}/>{copy("Bu cihazdaki rotalarını, yerlerini ve etkinliklerini internetsiz de açabilirsin.", "Routes, places and events on this device can also be opened offline.")}</p>
      </> : <header className="plans-category-heading"><button type="button" onClick={() => chooseSection("all")}><Icon name="back" size={18}/>{copy("Tüm kayıtlar", "All saved")}</button><div><span className="plans-selected-icon"><Icon name={selectedCategory?.icon || "suitcase"} size={26}/></span><div><h1>{selectedCategory?.title || copy("Seyahat araçlarım", "My travel tools")}</h1><p>{selectedCategory?.note || copy("Kişisel kartın, ortak planların ve yol araçların.", "Your personal card, shared plans and travel tools.")}</p></div></div></header>}
      {undo && undo.owner === (ownerId || null) && <div className="daily-undo" role="status"><span>{copy("Kayıt kaldırıldı.", "Item removed.")}</span><button type="button" onClick={undoDelete}>{copy("Geri al", "Undo")}</button><button type="button" aria-label={copy("Geri almayı kapat", "Dismiss undo")} onClick={() => setUndo(null)}><Icon name="close" size={17}/></button></div>}
      {cloudError && (libraryTab === "all" || libraryTab === "routes") && <div className="daily-load-error" role="status"><p>{cloudError}</p><button type="button" onClick={() => setCloudRetry(value => value + 1)}>{copy("Yeniden dene", "Retry")}</button></div>}
      {selectedCategory && libraryTab !== "places" && selectedCategory.count > 0 && <label className="daily-library-search"><Icon name="search" size={20}/><span className="sr-only">{copy("Kayıtlarında ara", "Search saved items")}</span><input type="search" value={query} placeholder={copy("Kayıtlarında ara…", "Search your saved items…")} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" onClick={() => setQuery("")} aria-label={copy("Aramayı temizle", "Clear search")}><Icon name="close" size={17}/></button>}</label>}
      {selectedCategory && libraryTab !== "places" && searchText && visibleCount === 0 && <div className="daily-search-empty" role="status"><p>{copy("Bu aramayla eşleşen kaydın yok.", "No saved items match this search.")}</p><button type="button" onClick={() => setQuery("")}>{copy("Aramayı temizle", "Clear search")}</button></div>}
      {libraryTab === "places" && <div className="travel-assistant"><TravelSavedPlaces key={ownerId || "guest"} ownerId={ownerId} onExplore={() => onNavigate("companion")} onExploreLabel={copy("Seyahat Asistanını aç", "Open Travel Assistant")}/></div>}
      {libraryTab === "travel" && <section className="saved-travel-tools">
      <PersonalTravelCards ownerId={ownerId}/>
      <details className="daily-featured-disclosure" open={sharedToolsOpen} onToggle={event => setSharedToolsOpen(event.currentTarget.open)}><summary><Icon name="users" size={18}/>{copy("Ortak seyahat planları", "Shared trip plans")}<Icon name="chevron" size={16}/></summary>
      {sharedToolsOpen && (user && accessToken ? <TripCollaborationHub
        key={user.id}
        accessToken={accessToken}
        userId={user.id}
        refreshKey={cloudItems.map((item) => `${item.id}:${item.createdAt}`).join("|")}
        initialInviteCode={inviteCode}
        onInviteHandled={onInviteHandled}
        onNotice={onNotice}
      /> : <button className={`trips-collaboration-entry${inviteCode ? " has-invite" : ""}`} type="button" onClick={onOpenAccount}><span><Icon name="users" size={24} /></span><div><small>{inviteCode ? copy("DAVETİN HAZIR", "YOUR INVITE IS READY") : copy("BİRLİKTE PLANLA", "PLAN TOGETHER")}</small><strong>{inviteCode ? copy("Katılmak için hesabına giriş yap", "Sign in to join the trip") : copy("Arkadaşlarınla aynı seyahate katıl", "Join the same trip with friends")}</strong><p>{inviteCode ? copy("Giriş yaptıktan sonra davet otomatik açılacak; kodu yeniden girmeyeceksin.", "Your invitation will open automatically after sign-in—no need to enter the code again.") : copy("Davet bağlantısı, oylama ve ortak masraflar için giriş yap.", "Sign in for invitations, voting and shared expenses.")}</p></div><Icon name="chevron" size={17} /></button>)}

      </details>
      <details className="daily-featured-disclosure" open={otherToolsOpen} onToggle={event => setOtherToolsOpen(event.currentTarget.open)}><summary><Icon name="compass" size={18}/>{copy("Diğer seyahat araçları", "Other travel tools")}<Icon name="chevron" size={16}/></summary>
      {otherToolsOpen && <Suspense fallback={<section className="journey-tools-loading" role="status" aria-live="polite"><span className="button-loader dark" /><div><strong>{copy("Seyahat araçların hazırlanıyor", "Preparing your travel tools")}</strong><small>{copy("Yalnız gerekli bölüm yükleniyor.", "Only the required section is loading.")}</small></div></section>}>
        <JourneyToolsHub onOpenAccount={onOpenAccount} initialTool={initialTool} user={user} ownerId={ownerId} accessToken={accessToken} onNavigate={onNavigate} onNotice={onNotice} />
      </Suspense>}
      </details>

      </section>}
      {libraryTab === "countries" && <section className="saved-country-section">
        {visibleFavorites.map(country => {
          const destination = DISCOVERY_DESTINATIONS.find(item => item.alpha3 === country.alpha3);
          return <button type="button" className="saved-country-row" key={country.alpha3} onClick={() => destination ? onOpenDestination(destination.code) : setUnavailableCountry(country)}>
            {destination ? <img src={destinationArtwork(destination.code)} alt="" loading="lazy" width="64" height="52" /> : <CountryFlag code={alpha2FromAlpha3(country.alpha3)} label={country.name} />}
            <span><strong>{country.name}</strong><small>{copy("Favori ülken", "Your favourite country")}</small></span><Icon name="heart" size={19} />
          </button>;
        })}
        {libraryTab === "countries" && !favorites.length && <Empty icon="heart" title={copy("Yeni bir yerle başla","Start with a new place")} text={copy("Keşfet'teki kalbe dokun; favori ülkelerin burada olsun.","Tap a heart in Explore to keep your favourite countries here.")} action={copy("Ülkeleri keşfet","Explore countries")} onAction={() => onNavigate("explore")} />}
      </section>}
      {libraryTab === "events" && <section className="saved-events-section">
        {ownerId && <p className="plans-storage-note">{copy("Etkinliklerin bu hesabınla diğer cihazlarına eşitlenir. Çevrimdışı değişikliklerin bağlantı gelince gönderilir; hatırlatıcı izinleri bu cihaza aittir.", "Events sync with this account on your other devices. Offline changes are sent when connected; reminder permissions belong to this device.", "Aktivitetet sinkronizohen me këtë llogari në pajisjet e tjera. Ndryshimet pa internet dërgohen kur lidhet; lejet e kujtesave i përkasin kësaj pajisjeje.")}</p>}
        <div className="section-heading"><div><span>{copy("PLANINDAKİ ETKİNLİKLER", "EVENTS IN YOUR PLAN")}</span><h2>{copy("Kaçırmak istemediklerin", "Events you don't want to miss")}</h2></div><button type="button" onClick={() => onNavigate("events")}>{copy("Etkinlik bul", "Find events")}</button></div>
        {savedEvents.length > 0 ? <div className="saved-event-list">{visibleEvents.map((event) => <article key={event.id} className={event.status === "cancelled" ? "cancelled" : ""}>
          <button type="button" className="saved-event-open" onClick={() => onOpenEvent ? onOpenEvent(event.id) : onNavigate("events")}>
            <span><strong>{eventDateLabel(event, dateLocale, { day: "2-digit" }, formatAppDate)}</strong><small>{eventDateLabel(event, dateLocale, { month: "short" }, formatAppDate)}</small></span>
            <div><small>{event.city}{event.venue ? ` · ${event.venue}` : ""}</small><strong>{event.title}</strong><em>{event.status === "cancelled" ? copy("İptal edildi", "Cancelled") : event.status === "postponed" ? copy("Ertelendi", "Postponed") : eventTimeLabel(event, dateLocale, formatAppDate)}</em></div>
          </button>
          <button type="button" className="saved-event-remove" aria-label={copy("Etkinliği planımdan çıkar", "Remove event from my plan")} onClick={() => setPendingDelete({ kind: "event", item: event })}><Icon name="trash" size={17} /></button>
        </article>)}</div> : <button className="saved-events-empty" type="button" onClick={() => onNavigate("events")}><span><Icon name="calendar" size={22} /></span><div><strong>{copy("Henüz etkinlik kaydetmedin", "No saved events yet")}</strong><small>{copy("Tarihine uygun konser, festival ve maçları bul.", "Find concerts, festivals and sport for your dates.")}</small></div><Icon name="chevron" size={16} /></button>}
      </section>}

      {libraryTab === "routes" && <div className="saved-list">
        {(routes.length > 0 || cloudRoutes.length > 0) && <div className="plans-list-action"><span>{copy("Bir sonraki yolculuk için", "For your next journey")}</span><button type="button" onClick={() => onNavigate("route")}><Icon name="plus" size={18}/>{copy("Yeni rota", "New route")}</button></div>}
        {pendingRoutes > 0 && <div className="info-box" role="status"><p>{copy(`${pendingRoutes} kayıt işlemi eşitleme bekliyor.`, `${pendingRoutes} changes waiting to sync.`)}</p><button type="button" className="secondary-wide" onClick={() => { if (ownerId && accessToken) void syncSavedRoutes(ownerId, accessToken).catch(() => onNotice(copy("Bağlantı kurulamadı; kayıtlar cihazda korundu.", "Could not connect; on-device records were kept."))); }}>{copy("Tekrar dene", "Retry")}</button></div>}
        {visibleRoutes.map((saved) => <article className="saved-card" key={saved.id}>
          <div className="saved-card-head"><img className="saved-route-thumbnail" src={destinationArtwork(saved.plan.routes[0]?.destinationCode)} alt="" loading="lazy" width="64" height="54" /><button className="saved-card-open" onClick={() => setSelectedPlan({ id: saved.id, title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}><small>{date(saved.createdAt, dateLocale)} · {saved.input?.days}</small><strong>{saved.plan.routes.map((route) => route.name).join(" · ")}</strong></button><button disabled={Boolean(busyCloud)} onClick={() => setPendingDelete({ kind: "route", item: saved })} aria-label={copy("Rotayı sil", "Delete route")}><Icon name="trash" size={18} /></button></div>
          <small role="status">{!ownerId ? copy("Bu cihazda", "On this device") : routeQueue[saved.id]?.pending || !routeQueue[saved.id] ? copy("Eşitleme bekliyor", "Waiting to sync") : copy("Hesaba kaydedildi", "Saved to account")}</small>
          <p>{saved.plan.summary}</p>
          <button className="saved-card-detail-action" onClick={() => setSelectedPlan({ id: saved.id, title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}>{copy("Planı aç", "Open plan")} <Icon name="chevron" size={16} /></button>
        </article>)}
        {visibleCloudRoutes.map((saved) => {
          const cloudPlan = cloudRoutePlan(saved, locale);
          return <article className="saved-card cloud-saved-card" key={`cloud-${saved.id}`}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><button className="saved-card-open" disabled={!cloudPlan} onClick={() => cloudPlan && setSelectedPlan(cloudPlan)}><small>{date(saved.createdAt, dateLocale)} · {copy("HESAPLA EŞİTLENDİ", "SYNCED TO ACCOUNT")}</small><strong>{saved.title || saved.destination}</strong></button><button disabled={busyCloud === String(saved.id)} onClick={() => setPendingDelete({ kind: "cloud", item: saved })} aria-label={copy("Hesap kaydını sil", "Delete account item")}><Icon name="trash" size={18} /></button></div>
          <p>{typeof saved.tripData.plan === "object" && saved.tripData.plan && "summary" in saved.tripData.plan ? String((saved.tripData.plan as Record<string, unknown>).summary || "") : saved.destination}</p>
          {cloudPlan && <button className="saved-card-detail-action" onClick={() => setSelectedPlan(cloudPlan)}>{copy("Planı aç", "Open plan")} <Icon name="chevron" size={16} /></button>}
        </article>})}
        {cloudLoading && <div className="skeleton-list"><div /></div>}
        {!routes.length && !cloudRoutes.length && !cloudLoading && <Empty icon="route" title={copy("Henüz kayıtlı rotan yok", "No saved routes yet")} text={copy("Tercihlerini seç, sana uygun rotayı birlikte oluşturalım.", "Choose your preferences and we'll create a route that fits you.")} action={copy("İlk rotamı oluştur", "Create my first route")} onAction={() => onNavigate("route")} />}
      </div>}

      <DeleteConfirmation pending={pendingDelete} account={Boolean(ownerId)} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
      <PlanDetail selected={selectedPlan} onClose={() => setSelectedPlan(null)} onPrepareCockpit={onPrepareCockpit ? (index) => {
        if (!ownerId || !user || user.id !== ownerId || !accessToken) { onOpenAccount(); return; }
        if (!selectedPlan) return;
        const intent = createRouteCockpitIntent(selectedPlan, index, ownerId);
        if (!intent) { onNotice(copy("Bu rotanın ayrıntıları aktarmak için yeterli değil.", "This route does not contain enough detail to transfer.", "Kjo rrugë nuk ka hollësi të mjaftueshme për t’u transferuar.")); return; }
        setSelectedPlan(null);
        onPrepareCockpit(intent);
      } : undefined} />
      <Sheet open={!!unavailableCountry} title={unavailableCountry?.name || copy("Favori ülken", "Your favourite country")} onClose={() => setUnavailableCountry(null)}>
        {unavailableCountry && <div className="saved-plan-detail">
          <CountryFlag code={alpha2FromAlpha3(unavailableCountry.alpha3)} label={unavailableCountry.name}/>
          <h3>{copy("Bu ülke için hazır rota henüz yok", "No ready-made route for this country yet")}</h3>
          <p>{copy("Ülke favorilerinde kayıtlı kalıyor. Rota Asistanı'nda tercihlerinle farklı destinasyon önerileri bulabilirsin.", "This country stays in your favourites. You can find ideas for other destinations with your preferences in Route Assistant.")}</p>
          <button type="button" className="primary-wide" onClick={() => { setUnavailableCountry(null); onNavigate("route"); }}>{copy("Farklı rota fikirleri bul", "Find other route ideas")}</button>
          <button type="button" className="secondary-wide" onClick={() => setUnavailableCountry(null)}>{copy("Favorilerime dön", "Back to favourites")}</button>
        </div>}
      </Sheet>
    </div>
  );
}

function DeleteConfirmation({ pending, account, onCancel, onConfirm }: {
  pending: PendingDelete | null;
  account: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { copy } = useI18n();
  return <Sheet open={Boolean(pending)} title={copy("Kaydı sil", "Delete item")} onClose={onCancel}>
    <div className="delete-confirmation">
      <span><Icon name="trash" size={24} /></span>
      <p>{pending?.kind === "event" ? account ? copy(
        "Etkinlik kayıtlarından çıkarılacak; silme işlemi eşitlendiğinde hesabında ve diğer cihazlarında da geçerli olacak. Bu cihazdaki hatırlatıcısı iptal edilecek. Seyahate eklediğin ayrı liste öğesi değişmez.",
        "The event will be removed from your saved events. Once synced, the removal applies to your account and other devices too. Its reminder on this device will be cancelled. An item already added to a trip checklist stays there.",
        "Aktiviteti do të hiqet nga aktivitetet e ruajtura. Pas sinkronizimit, heqja zbatohet edhe në llogarinë dhe pajisjet e tjera. Kujtesa në këtë pajisje do të anulohet. Një artikull i shtuar më parë në listën e udhëtimit mbetet aty.",
      ) : copy(
        "Etkinlik bu cihazdaki kayıtlarından çıkarılacak ve varsa hatırlatıcısı iptal edilecek. Seyahate eklediğin ayrı liste öğesi değişmez.",
        "The event will be removed from this device and its reminder cancelled. An item already added to a trip checklist stays there.",
        "Aktiviteti do të hiqet nga kjo pajisje dhe kujtesa e tij do të anulohet. Një artikull i shtuar më parë në listën e udhëtimit mbetet aty.",
      ) : account ? copy("Bu rota cihazından ve LetsGo2Travel hesabından silinecek. Bu işlem geri alınamaz.", "This route will be deleted from your device and LetsGo2Travel account. This cannot be undone.") : copy("Bu rota cihazından kaldırılacak. Sonrasında Geri al düğmesini kullanabilirsin.", "This route will be removed from your device. You can use Undo afterwards.")}</p>
      <div><button className="secondary-wide" data-autofocus onClick={onCancel}>{copy("Vazgeç", "Cancel")}</button><button className="danger-wide" onClick={onConfirm}>{copy("Sil", "Delete")}</button></div>
    </div>
  </Sheet>;
}

function PlanDetail({ selected, onClose, onPrepareCockpit }: { selected: SelectedPlan | null; onClose: () => void; onPrepareCockpit?: (index: number) => void }) {
  const { copy, dateLocale } = useI18n();
  return <Sheet open={Boolean(selected)} title={copy("Rota planın", "Your route plan")} onClose={onClose} size="large">
    {selected && <div className="saved-plan-detail">
      <header><small>{date(selected.createdAt, dateLocale)}{selected.input?.days ? ` · ${selected.input.days}` : ""}</small><h3>{selected.title}</h3><p>{selected.plan.summary}</p></header>
      {selected.plan.routes.map((route, index) => <article key={`${route.name}-${index}`}>
        <div className="saved-plan-route-head"><span>{index + 1}</span><div><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong></div></div>
        <p>{route.why}</p>
        {onPrepareCockpit && <button type="button" className="primary-wide" onClick={() => onPrepareCockpit(index)}><Icon name="calendar" size={18}/>{copy("Bu rotayı Kokpit’e ekle", "Add this route to Cockpit", "Shto këtë rrugë në Kabinë")}</button>}
        {route.visaNote && <p>{route.visaNote}</p>}
        {route.visaVerifiedAt && <small>{copy("Kaynak kontrol tarihi", "Source checked")}: {route.visaVerifiedAt}</small>}
        {route.visaSourceUrl && <button className="secondary-wide" onClick={() => void openExternal(route.visaSourceUrl!)}>{copy("Resmî giriş kaynağını aç", "Open official entry source")}</button>}
        <div className="saved-plan-facts"><span><small>{copy("Bütçe", "Budget")}</small><strong>{route.estimatedBudget}</strong></span><span><small>{copy("Süre", "Duration")}</small><strong>{route.idealDuration}</strong></span></div>
        {Array.isArray(route.dailyPlan) && route.dailyPlan.length > 0 && <div className="saved-plan-days"><strong>{copy("Örnek gezi planı", "Sample itinerary")}</strong>{route.dailyPlan.map((day) => <div key={day}><Icon name="check" size={15} /><span>{day}</span></div>)}</div>}
        {Array.isArray(route.warnings) && route.warnings.length > 0 && <div className="saved-plan-warnings">{route.warnings.map((warning) => <div key={warning}><Icon name="alert" size={15} /><span>{warning}</span></div>)}</div>}
      </article>)}
      <button className="primary-wide" onClick={onClose}><Icon name="check" size={18} /> {copy("Planı gördüm", "Done")}</button>
    </div>}
  </Sheet>;
}

function Empty({ icon, title, text, action, onAction }: { icon: IconName; title: string; text: string; action: string; onAction: () => void }) {
  return <div className="empty-state"><span><Icon name={icon} size={28} /></span><strong>{title}</strong><p>{text}</p><button className="primary-button empty-state-action" onClick={onAction}><Icon name="route" size={17} />{action}</button></div>;
}
