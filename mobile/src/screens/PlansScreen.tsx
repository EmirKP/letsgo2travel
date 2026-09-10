import { eventDateLabel, eventTimeLabel } from "../../../lib/event-time";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { PageHero } from "../components/PageHero";
import { CountryFlag } from "../components/CountryFlag";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { destinationArtwork } from "../data/artwork";
import { DISCOVERY_DESTINATIONS } from "../data/discovery";
import { Sheet } from "../components/Sheet";
import { TripCollaborationHub } from "../components/TripCollaborationHub";
import { deleteUserTrip, getSupabaseDataErrorMessage, listUserTrips, type UserTripData } from "../lib/supabaseData";
import {
  deleteRoutePlan,
  getFavoriteDestinations,
  getSavedRoutePlans,
  getSavedTravelEvents,
  removeSavedTravelEvent,
} from "../lib/storage";
import type { AuthUser, PlannerInput, RoutePlan, SavedRoutePlan, TravelEvent, ViewId } from "../types";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { queueRouteDelete, readRouteOutbox } from "../lib/routeOutbox";
import { syncSavedRoutes } from "../lib/routeSync";
import { cancelEventReminder } from "../lib/eventReminders";

const JourneyToolsHub = lazy(() => import("../components/JourneyToolsHub").then((module) => ({ default: module.JourneyToolsHub })));

type PendingDelete =
  | { kind: "cloud"; item: UserTripData }
  | { kind: "route"; item: SavedRoutePlan }
  | { kind: "event"; item: TravelEvent };

type SelectedPlan = {
  title: string;
  createdAt: string;
  input?: PlannerInput;
  plan: RoutePlan;
};

function cloudRoutePlan(item: UserTripData, locale: "tr" | "en"): SelectedPlan | null {
  const candidate = item.tripData?.plan;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  if (!Array.isArray(record.routes) || record.routes.length === 0) return null;
  const routes = record.routes.filter((route) => route && typeof route === "object" && !Array.isArray(route));
  if (routes.length === 0) return null;
  const input = item.tripData?.input;
  return {
    title: item.title || item.destination || (locale === "tr" ? "Kayıtlı rota" : "Saved route"),
    createdAt: item.createdAt,
    input: input && typeof input === "object" && !Array.isArray(input) ? input as PlannerInput : undefined,
    plan: {
      summary: typeof record.summary === "string" ? record.summary : (locale === "tr" ? "Kayıtlı rota önerin." : "Your saved route suggestion."),
      routes: routes as RoutePlan["routes"],
    },
  };
}

function date(value: string, locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function TripsScreen({ initialTool, onOpenDestination, onOpenEvent, user, ownerId, accessToken, inviteCode, onInviteHandled, onOpenAccount, onNavigate, onNotice }: {
  initialTool?: "airport";
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
  const favoriteCount = favorites.length;
  const [libraryTab, setLibraryTab] = useState<"all" | "routes" | "countries" | "events" | "travel">(inviteCode || initialTool ? "travel" : "all");
  useEffect(() => { if (inviteCode || initialTool) setLibraryTab("travel"); }, [inviteCode, initialTool]);
  const [savedEvents, setSavedEvents] = useState<TravelEvent[]>([]);
  const [cloudItems, setCloudItems] = useState<UserTripData[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [busyCloud, setBusyCloud] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);

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
    void listUserTrips(user.id, accessToken, "route_plan")
      .then((items) => { if (active) setCloudItems(items); })
      .catch((error) => { if (active) onNotice(getSupabaseDataErrorMessage(error, copy("Hesaptaki kayıtlar alınamadı.", "Account items could not be loaded."))); })
      .finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [accessToken, copy, onNotice, user]);

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
    if (pending.kind === "route") void removeSavedRoute(pending.item);
    if (pending.kind === "event") {
      try {
        setSavedEvents(removeSavedTravelEvent(pending.item.id, ownerId));
        void cancelEventReminder(pending.item.id, ownerId).then(ok => { if (!ok) onNotice(copy("Hatırlatıcı iptali bekliyor; yeniden denenecek.", "Reminder cancellation is pending and will retry.")); }).catch(() => onNotice(copy("Hatırlatıcı iptal edilemedi.", "Reminder could not be cancelled.")));
        onNotice(copy("Etkinlik planından çıkarıldı.", "Event removed from your plan."));
      } catch { onNotice(copy("Etkinlik silinemedi. Cihaz depolamasını kontrol et.", "Event could not be removed. Check device storage.")); }
    }
  };

  const routeQueue = ownerId ? readRouteOutbox(ownerId) : {};
  const pendingRoutes = Object.values(routeQueue).filter(item => item.pending).length;
  const cloudRoutes = cloudItems.filter((item) => item.mobileKind === "route_plan" && routeQueue[item.clientKey || ""]?.kind !== "delete" && !routes.some((route) => route.id === item.clientKey));

  return (
    <div className="screen saved-screen">
      <PageHero scene="coast" title={copy("Kaydedilenler", "Saved")} subtitle={copy("Favori yerlerin, rotaların ve seyahatlerin.", "Your favourite places, routes and journeys.")} />

      <div className="chip-scroll saved-filters" role="group" aria-label={copy("Kaydedilenleri filtrele", "Filter saved items")}>
        {(["all","routes","countries","events","travel"] as const).map((tab,index) => <button type="button" key={tab} className={libraryTab === tab ? "active" : ""} aria-pressed={libraryTab === tab} onClick={() => setLibraryTab(tab)}>{[copy("Tümü","All"),copy("Rotalar","Routes"),copy("Ülkeler","Countries"),copy("Etkinlikler","Events"),copy("Seyahatlerim","My Trips")][index]}</button>)}
      </div>
      {libraryTab !== "travel" && <button type="button" className="saved-travel-entry" onClick={() => setLibraryTab("travel")}><Icon name="suitcase" size={19} /><span>{copy("Seyahatlerim ve ortak planlar", "My trips and shared plans")}</span><Icon name="chevron" size={17} /></button>}
      {libraryTab === "travel" && <section className="saved-travel-tools">
      {user && accessToken ? <TripCollaborationHub
        key={user.id}
        accessToken={accessToken}
        userId={user.id}
        refreshKey={cloudItems.map((item) => `${item.id}:${item.createdAt}`).join("|")}
        initialInviteCode={inviteCode}
        onInviteHandled={onInviteHandled}
        onNotice={onNotice}
      /> : <button className={`trips-collaboration-entry${inviteCode ? " has-invite" : ""}`} type="button" onClick={onOpenAccount}><span><Icon name="users" size={24} /></span><div><small>{inviteCode ? copy("DAVETİN HAZIR", "YOUR INVITE IS READY") : copy("BİRLİKTE PLANLA", "PLAN TOGETHER")}</small><strong>{inviteCode ? copy("Katılmak için hesabına giriş yap", "Sign in to join the trip") : copy("Arkadaşlarınla aynı seyahate katıl", "Join the same trip with friends")}</strong><p>{inviteCode ? copy("Giriş yaptıktan sonra davet otomatik açılacak; kodu yeniden girmeyeceksin.", "Your invitation will open automatically after sign-in—no need to enter the code again.") : copy("Davet bağlantısı, oylama ve ortak masraflar için giriş yap.", "Sign in for invitations, voting and shared expenses.")}</p></div><Icon name="chevron" size={17} /></button>}

      <Suspense fallback={<section className="journey-tools-loading" role="status" aria-live="polite"><span className="button-loader dark" /><div><strong>{copy("Seyahat araçların hazırlanıyor", "Preparing your travel tools")}</strong><small>{copy("Yalnız gerekli bölüm yükleniyor.", "Only the required section is loading.")}</small></div></section>}>
        <JourneyToolsHub initialTool={initialTool} user={user} ownerId={ownerId} accessToken={accessToken} onNavigate={onNavigate} onNotice={onNotice} />
      </Suspense>

      <div className="trips-overview">
        <div><span><Icon name="route" size={18} /></span><strong>{routes.length + cloudRoutes.length}</strong><small>{copy("Kayıtlı rota", "Saved routes")}</small></div>
        <div><span><Icon name="heart" size={18} /></span><strong>{favoriteCount}</strong><small>{copy("Favori", "Favourites")}</small></div>
        <div><span><Icon name="calendar" size={18} /></span><strong>{savedEvents.length}</strong><small>{copy("Etkinlik", "Events")}</small></div>
      </div>

      <button className="trips-cockpit" onClick={() => onNavigate("cockpit")}><span><Icon name="suitcase" size={23} /></span><div><small>{copy("AKILLI SEYAHAT KOKPİTİ", "SMART TRAVEL COCKPIT")}</small><strong>{copy("Yaklaşan seyahatini yönet", "Manage your next trip")}</strong><p>{copy("Tarihlerini ve hazırlık listesini hesabınla eşitle.", "Sync dates and your checklist with your account.")}</p></div><Icon name="chevron" size={16} /></button>


      </section>}
      {(libraryTab === "all" || libraryTab === "countries") && <section className="saved-country-section">
        {favorites.map(country => {
          const destination = DISCOVERY_DESTINATIONS.find(item => item.alpha3 === country.alpha3);
          return <button type="button" className="saved-country-row" key={country.alpha3} onClick={() => destination ? onOpenDestination(destination.code) : onNavigate("profile")}>
            {destination ? <img src={destinationArtwork(destination.code)} alt="" loading="lazy" width="64" height="52" /> : <CountryFlag code={alpha2FromAlpha3(country.alpha3)} label={country.name} />}
            <span><strong>{country.name}</strong><small>{copy("Favori ülken", "Your favourite country")}</small></span><Icon name="heart" size={19} />
          </button>;
        })}
        {libraryTab === "countries" && !favorites.length && <Empty icon="heart" title={copy("Yeni bir yerle başla","Start with a new place")} text={copy("Keşfet'teki kalbe dokun; favori ülkelerin burada olsun.","Tap a heart in Explore to keep your favourite countries here.")} action={copy("Ülkeleri keşfet","Explore countries")} onAction={() => onNavigate("explore")} />}
      </section>}
      {(libraryTab === "all" || libraryTab === "events") && <section className="saved-events-section">
        <div className="section-heading"><div><span>{copy("PLANINDAKİ ETKİNLİKLER", "EVENTS IN YOUR PLAN")}</span><h2>{copy("Kaçırmak istemediklerin", "Events you don't want to miss")}</h2></div><button type="button" onClick={() => onNavigate("events")}>{copy("Etkinlik bul", "Find events")}</button></div>
        {savedEvents.length > 0 ? <div className="saved-event-list">{savedEvents.map((event) => <article key={event.id} className={event.status === "cancelled" ? "cancelled" : ""}>
          <button type="button" className="saved-event-open" onClick={() => onOpenEvent ? onOpenEvent(event.id) : onNavigate("events")}>
            <span><strong>{eventDateLabel(event, dateLocale, { day: "2-digit" })}</strong><small>{eventDateLabel(event, dateLocale, { month: "short" })}</small></span>
            <div><small>{event.city}{event.venue ? ` · ${event.venue}` : ""}</small><strong>{event.title}</strong><em>{event.status === "cancelled" ? copy("İptal edildi", "Cancelled") : event.status === "postponed" ? copy("Ertelendi", "Postponed") : eventTimeLabel(event, dateLocale)}</em></div>
          </button>
          <button type="button" className="saved-event-remove" aria-label={copy("Etkinliği planımdan çıkar", "Remove event from my plan")} onClick={() => setPendingDelete({ kind: "event", item: event })}><Icon name="trash" size={17} /></button>
        </article>)}</div> : <button className="saved-events-empty" type="button" onClick={() => onNavigate("events")}><span><Icon name="calendar" size={22} /></span><div><strong>{copy("Henüz etkinlik kaydetmedin", "No saved events yet")}</strong><small>{copy("Tarihine uygun konser, festival ve maçları bul.", "Find concerts, festivals and sport for your dates.")}</small></div><Icon name="chevron" size={16} /></button>}
      </section>}

      {(libraryTab === "all" || libraryTab === "routes") && <div className="saved-list">
        {pendingRoutes > 0 && <div className="info-box" role="status"><p>{copy(`${pendingRoutes} kayıt işlemi eşitleme bekliyor.`, `${pendingRoutes} changes waiting to sync.`)}</p><button type="button" className="secondary-wide" onClick={() => { if (ownerId && accessToken) void syncSavedRoutes(ownerId, accessToken).catch(() => onNotice(copy("Bağlantı kurulamadı; kayıtlar cihazda korundu.", "Could not connect; on-device records were kept."))); }}>{copy("Tekrar dene", "Retry")}</button></div>}
        {routes.map((saved) => <article className="saved-card" key={saved.id}>
          <div className="saved-card-head"><img className="saved-route-thumbnail" src={destinationArtwork(saved.plan.routes[0]?.destinationCode)} alt="" loading="lazy" width="64" height="54" /><button className="saved-card-open" onClick={() => setSelectedPlan({ title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}><small>{date(saved.createdAt, dateLocale)} · {saved.input?.days}</small><strong>{saved.plan.routes.map((route) => route.name).join(" · ")}</strong></button><button disabled={Boolean(busyCloud)} onClick={() => setPendingDelete({ kind: "route", item: saved })} aria-label={copy("Rotayı sil", "Delete route")}><Icon name="trash" size={18} /></button></div>
          <small role="status">{!ownerId ? copy("Bu cihazda", "On this device") : routeQueue[saved.id]?.pending || !routeQueue[saved.id] ? copy("Eşitleme bekliyor", "Waiting to sync") : copy("Hesaba kaydedildi", "Saved to account")}</small>
          <p>{saved.plan.summary}</p>
          <button className="saved-card-detail-action" onClick={() => setSelectedPlan({ title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}>{copy("Planı aç", "Open plan")} <Icon name="chevron" size={16} /></button>
        </article>)}
        {cloudRoutes.map((saved) => {
          const cloudPlan = cloudRoutePlan(saved, locale);
          return <article className="saved-card cloud-saved-card" key={`cloud-${saved.id}`}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><button className="saved-card-open" disabled={!cloudPlan} onClick={() => cloudPlan && setSelectedPlan(cloudPlan)}><small>{date(saved.createdAt, dateLocale)} · {copy("HESAPLA EŞİTLENDİ", "SYNCED TO ACCOUNT")}</small><strong>{saved.title || saved.destination}</strong></button><button disabled={busyCloud === String(saved.id)} onClick={() => setPendingDelete({ kind: "cloud", item: saved })} aria-label={copy("Hesap kaydını sil", "Delete account item")}><Icon name="trash" size={18} /></button></div>
          <p>{typeof saved.tripData.plan === "object" && saved.tripData.plan && "summary" in saved.tripData.plan ? String((saved.tripData.plan as Record<string, unknown>).summary || "") : saved.destination}</p>
          {cloudPlan && <button className="saved-card-detail-action" onClick={() => setSelectedPlan(cloudPlan)}>{copy("Planı aç", "Open plan")} <Icon name="chevron" size={16} /></button>}
        </article>})}
        {cloudLoading && <div className="skeleton-list"><div /></div>}
        {!routes.length && !cloudRoutes.length && !cloudLoading && <Empty icon="route" title={copy("Henüz kayıtlı rotan yok", "No saved routes yet")} text={copy("Tercihlerini seç, sana uygun rotayı birlikte oluşturalım.", "Choose your preferences and we'll create a route that fits you.")} action={copy("İlk rotamı oluştur", "Create my first route")} onAction={() => onNavigate("route")} />}
      </div>}

      <DeleteConfirmation pending={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
      <PlanDetail selected={selectedPlan} onClose={() => setSelectedPlan(null)} />
    </div>
  );
}

function DeleteConfirmation({ pending, onCancel, onConfirm }: {
  pending: PendingDelete | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { copy } = useI18n();
  return <Sheet open={Boolean(pending)} title={copy("Kaydı sil", "Delete item")} onClose={onCancel}>
    <div className="delete-confirmation">
      <span><Icon name="trash" size={24} /></span>
      <p>{copy("Bu kayıt cihazından ve giriş yaptıysan LetsGo2Travel hesabından silinecek.", "This item will be deleted from this device and, if signed in, your LetsGo2Travel account.")}</p>
      <div><button className="secondary-wide" data-autofocus onClick={onCancel}>{copy("Vazgeç", "Cancel")}</button><button className="danger-wide" onClick={onConfirm}>{copy("Sil", "Delete")}</button></div>
    </div>
  </Sheet>;
}

function PlanDetail({ selected, onClose }: { selected: SelectedPlan | null; onClose: () => void }) {
  const { copy, dateLocale } = useI18n();
  return <Sheet open={Boolean(selected)} title={copy("Rota planın", "Your route plan")} onClose={onClose} size="large">
    {selected && <div className="saved-plan-detail">
      <header><small>{date(selected.createdAt, dateLocale)}{selected.input?.days ? ` · ${selected.input.days}` : ""}</small><h3>{selected.title}</h3><p>{selected.plan.summary}</p></header>
      {selected.plan.routes.map((route, index) => <article key={`${route.name}-${index}`}>
        <div className="saved-plan-route-head"><span>{index + 1}</span><div><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong></div></div>
        <p>{route.why}</p>
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
