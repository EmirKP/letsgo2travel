import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { deleteUserTrip, getSupabaseDataErrorMessage, listUserTrips, type UserTripData } from "../lib/supabaseData";
import {
  deleteRoutePlan,
  getFavoriteDestinations,
  getSavedRoutePlans,
  getVisitedCountries,
} from "../lib/storage";
import type { AuthUser, PlannerInput, RoutePlan, SavedRoutePlan, ViewId } from "../types";

type PendingDelete =
  | { kind: "cloud"; item: UserTripData }
  | { kind: "route"; item: SavedRoutePlan };

type SelectedPlan = {
  title: string;
  createdAt: string;
  input?: PlannerInput;
  plan: RoutePlan;
};

function cloudRoutePlan(item: UserTripData): SelectedPlan | null {
  const candidate = item.tripData?.plan;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  if (!Array.isArray(record.routes) || record.routes.length === 0) return null;
  const routes = record.routes.filter((route) => route && typeof route === "object" && !Array.isArray(route));
  if (routes.length === 0) return null;
  const input = item.tripData?.input;
  return {
    title: item.title || item.destination || "Kayıtlı rota",
    createdAt: item.createdAt,
    input: input && typeof input === "object" && !Array.isArray(input) ? input as PlannerInput : undefined,
    plan: {
      summary: typeof record.summary === "string" ? record.summary : "Kayıtlı rota önerin.",
      routes: routes as RoutePlan["routes"],
    },
  };
}

function date(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function TripsScreen({ user, ownerId, accessToken, onNavigate, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const [routes, setRoutes] = useState<SavedRoutePlan[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [visitedCount, setVisitedCount] = useState(0);
  const [cloudItems, setCloudItems] = useState<UserTripData[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [busyCloud, setBusyCloud] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);

  const refreshLocal = useCallback(() => {
    setRoutes(getSavedRoutePlans(ownerId));
    setFavoriteCount(getFavoriteDestinations(ownerId).length);
    setVisitedCount(getVisitedCountries(ownerId).length);
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
    void listUserTrips(user.id, accessToken)
      .then((items) => { if (active) setCloudItems(items); })
      .catch((error) => { if (active) onNotice(getSupabaseDataErrorMessage(error, "Hesaptaki kayıtlar alınamadı.")); })
      .finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [accessToken, onNotice, user]);

  const removeCloudItem = async (item: UserTripData) => {
    if (!user || !accessToken || busyCloud) return;
    setBusyCloud(String(item.id));
    try {
      await deleteUserTrip(user.id, item.id, accessToken);
      setCloudItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (item.clientKey && item.mobileKind === "route_plan") {
        setRoutes(deleteRoutePlan(item.clientKey, ownerId));
      }
      onNotice("Kayıt hesabından silindi.");
    } catch (error) {
      onNotice(getSupabaseDataErrorMessage(error, "Kayıt silinemedi."));
    } finally {
      setBusyCloud("");
    }
  };

  const removeSavedRoute = async (saved: SavedRoutePlan) => {
    const remote = cloudItems.find((item) => item.mobileKind === "route_plan" && item.clientKey === saved.id);
    if (remote && user && accessToken) {
      setBusyCloud(String(remote.id));
      try {
        await deleteUserTrip(user.id, remote.id, accessToken);
        setCloudItems((current) => current.filter((item) => item.id !== remote.id));
      } catch (error) {
        setBusyCloud("");
        return onNotice(getSupabaseDataErrorMessage(error, "Rota hesap kaydından silinemedi."));
      }
      setBusyCloud("");
    }
    setRoutes(deleteRoutePlan(saved.id, ownerId));
    onNotice("Rota silindi.");
  };

  const confirmDelete = () => {
    const pending = pendingDelete;
    if (!pending) return;
    setPendingDelete(null);
    if (pending.kind === "cloud") void removeCloudItem(pending.item);
    if (pending.kind === "route") void removeSavedRoute(pending.item);
  };

  const cloudRoutes = cloudItems.filter((item) => item.mobileKind === "route_plan" && !routes.some((route) => route.id === item.clientKey));

  return (
    <div className="screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="plans" size={27} /></span>
        <div><small>SEYAHAT MERKEZİ</small><h1>Seyahatlerim</h1><p>Rotaların, favorilerin ve seyahat planların tek yerde.</p></div>
      </section>

      <div className="trips-overview">
        <div><span><Icon name="route" size={18} /></span><strong>{routes.length + cloudRoutes.length}</strong><small>Kayıtlı rota</small></div>
        <div><span><Icon name="heart" size={18} /></span><strong>{favoriteCount}</strong><small>Favori</small></div>
        <div><span><Icon name="flag" size={18} /></span><strong>{visitedCount}</strong><small>Ziyaret</small></div>
      </div>

      <button className="trips-cockpit" onClick={() => onNavigate("cockpit")}><span><Icon name="suitcase" size={23} /></span><div><small>AKILLI SEYAHAT KOKPİTİ</small><strong>Yaklaşan seyahatini yönet</strong><p>Tarihlerini ve hazırlık listesini hesabınla eşitle.</p></div><Icon name="chevron" size={16} /></button>

      <div className="saved-list">
        {routes.map((saved) => <article className="saved-card" key={saved.id}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><button className="saved-card-open" onClick={() => setSelectedPlan({ title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}><small>{date(saved.createdAt)} · {saved.input.days}</small><strong>{saved.plan.routes.map((route) => route.name).join(" · ")}</strong></button><button disabled={Boolean(busyCloud)} onClick={() => setPendingDelete({ kind: "route", item: saved })} aria-label="Rotayı sil"><Icon name="trash" size={18} /></button></div>
          <p>{saved.plan.summary}</p>
          <button className="saved-card-detail-action" onClick={() => setSelectedPlan({ title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}>Planı aç <Icon name="chevron" size={16} /></button>
        </article>)}
        {cloudRoutes.map((saved) => {
          const cloudPlan = cloudRoutePlan(saved);
          return <article className="saved-card cloud-saved-card" key={`cloud-${saved.id}`}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><button className="saved-card-open" disabled={!cloudPlan} onClick={() => cloudPlan && setSelectedPlan(cloudPlan)}><small>{date(saved.createdAt)} · HESAPLA EŞİTLENDİ</small><strong>{saved.title || saved.destination}</strong></button><button disabled={busyCloud === String(saved.id)} onClick={() => setPendingDelete({ kind: "cloud", item: saved })} aria-label="Hesap kaydını sil"><Icon name="trash" size={18} /></button></div>
          <p>{typeof saved.tripData.plan === "object" && saved.tripData.plan && "summary" in saved.tripData.plan ? String((saved.tripData.plan as Record<string, unknown>).summary || "") : saved.destination}</p>
          {cloudPlan && <button className="saved-card-detail-action" onClick={() => setSelectedPlan(cloudPlan)}>Planı aç <Icon name="chevron" size={16} /></button>}
        </article>})}
        {cloudLoading && <div className="skeleton-list"><div /></div>}
        {!routes.length && !cloudRoutes.length && !cloudLoading && <Empty icon="route" title="Henüz kayıtlı rotan yok" text="Tercihlerini seç, sana uygun rotayı birlikte oluşturalım." action="İlk rotamı oluştur" onAction={() => onNavigate("route")} />}
      </div>

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
  return <Sheet open={Boolean(pending)} title="Kaydı sil" onClose={onCancel}>
    <div className="delete-confirmation">
      <span><Icon name="trash" size={24} /></span>
      <p>Bu kayıt cihazından ve giriş yaptıysan LetsGo2Travel hesabından silinecek.</p>
      <div><button className="secondary-wide" data-autofocus onClick={onCancel}>Vazgeç</button><button className="danger-wide" onClick={onConfirm}>Sil</button></div>
    </div>
  </Sheet>;
}

function PlanDetail({ selected, onClose }: { selected: SelectedPlan | null; onClose: () => void }) {
  return <Sheet open={Boolean(selected)} title="Rota planın" onClose={onClose} size="large">
    {selected && <div className="saved-plan-detail">
      <header><small>{date(selected.createdAt)}{selected.input?.days ? ` · ${selected.input.days}` : ""}</small><h3>{selected.title}</h3><p>{selected.plan.summary}</p></header>
      {selected.plan.routes.map((route, index) => <article key={`${route.name}-${index}`}>
        <div className="saved-plan-route-head"><span>{index + 1}</span><div><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong></div></div>
        <p>{route.why}</p>
        <div className="saved-plan-facts"><span><small>Bütçe</small><strong>{route.estimatedBudget}</strong></span><span><small>Süre</small><strong>{route.idealDuration}</strong></span></div>
        {Array.isArray(route.dailyPlan) && route.dailyPlan.length > 0 && <div className="saved-plan-days"><strong>Örnek gezi planı</strong>{route.dailyPlan.map((day) => <div key={day}><Icon name="check" size={15} /><span>{day}</span></div>)}</div>}
        {Array.isArray(route.warnings) && route.warnings.length > 0 && <div className="saved-plan-warnings">{route.warnings.map((warning) => <div key={warning}><Icon name="alert" size={15} /><span>{warning}</span></div>)}</div>}
      </article>)}
      <button className="primary-wide" onClick={onClose}><Icon name="check" size={18} /> Planı gördüm</button>
    </div>}
  </Sheet>;
}

function Empty({ icon, title, text, action, onAction }: { icon: "route"; title: string; text: string; action: string; onAction: () => void }) {
  return <div className="empty-state"><span><Icon name={icon} size={28} /></span><strong>{title}</strong><p>{text}</p><button className="primary-button empty-state-action" onClick={onAction}><Icon name="route" size={17} />{action}</button></div>;
}
