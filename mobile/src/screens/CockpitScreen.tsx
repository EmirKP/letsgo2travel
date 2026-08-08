import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { createId } from "../lib/id";
import {
  createCockpitTrip,
  deleteCockpitTrip,
  getSupabaseDataErrorMessage,
  listCockpitTrips,
  updateCockpitChecklist,
  updateCockpitTrip,
  type ChecklistCategory,
  type ChecklistItem,
  type CockpitTrip,
  type TripStatus,
} from "../lib/supabaseData";
import type { AuthUser } from "../types";

type CockpitScreenProps = {
  user: AuthUser | null;
  accessToken: string;
  onOpenAccount: () => void;
  onNotice: (message: string) => void;
};

type TripForm = {
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  departureTime: string;
  flightPnr: string;
};

const EMPTY_FORM: TripForm = {
  destinationCountry: "",
  destinationCode: "",
  destinationCity: "",
  startDate: "",
  endDate: "",
  departureTime: "",
  flightPnr: "",
};

const STATUS_LABELS: Record<TripStatus, string> = {
  upcoming: "Yaklaşan",
  active: "Devam ediyor",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
};

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  documents: "Belge",
  health: "Sağlık",
  technology: "Teknoloji",
  luggage: "Bavul",
  other: "Diğer",
};

function defaultChecklist(): ChecklistItem[] {
  const createdAt = new Date().toISOString();
  return [
    { id: createId(), label: "Pasaport / kimlik geçerliliğini kontrol et", completed: false, category: "documents", createdAt },
    { id: createId(), label: "Uçuş ve konaklama belgelerini indir", completed: false, category: "documents", createdAt },
    { id: createId(), label: "Priz adaptörü hazırla", completed: false, category: "technology", createdAt },
    { id: createId(), label: "İlaçları ve reçeteleri hazırla", completed: false, category: "health", createdAt },
    { id: createId(), label: "eSIM veya internet paketini ayarla", completed: false, category: "technology", createdAt },
  ];
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function tripTitle(trip: CockpitTrip) {
  return [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ");
}

function formError(form: TripForm) {
  if (form.destinationCountry.trim().length < 2) return "Gideceğin ülkeyi yaz.";
  if (!/^[A-Za-z]{2}$/.test(form.destinationCode.trim())) return "Ülke kodu iki harf olmalı. Örneğin IT.";
  if (!form.startDate || !form.endDate) return "Başlangıç ve bitiş tarihlerini seç.";
  if (form.endDate < form.startDate) return "Bitiş tarihi başlangıçtan önce olamaz.";
  if (form.flightPnr && !/^[A-Za-z0-9-]{3,20}$/.test(form.flightPnr.trim())) return "PNR 3–20 harf, rakam veya tire içerebilir.";
  return "";
}

function replaceTrip(items: CockpitTrip[], next: CockpitTrip) {
  return items
    .map((item) => item.id === next.id ? next : item)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

export function CockpitScreen({ user, accessToken, onOpenAccount, onNotice }: CockpitScreenProps) {
  const [trips, setTrips] = useState<CockpitTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TripForm>(EMPTY_FORM);
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [newChecklistCategory, setNewChecklistCategory] = useState<ChecklistCategory>("other");
  const loadGeneration = useRef(0);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || trips[0] || null,
    [selectedTripId, trips],
  );

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!user || !accessToken) {
      setTrips([]);
      setSelectedTripId("");
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await listCockpitTrips(user.id, accessToken);
      if (generation !== loadGeneration.current) return;
      setTrips(next);
      setSelectedTripId((current) => next.some((trip) => trip.id === current) ? current : next[0]?.id || "");
    } catch (requestError) {
      if (generation === loadGeneration.current) setError(getSupabaseDataErrorMessage(requestError, "Seyahatlerin yüklenemedi."));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [accessToken, user]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  const createTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !accessToken || busy || loading) return;
    const validation = formError(form);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy("create");
    setError("");
    try {
      let departureAt: string | null = null;
      if (form.departureTime) {
        const departure = new Date(`${form.startDate}T${form.departureTime}:00`);
        if (Number.isNaN(departure.getTime())) throw new Error("invalid departure");
        departureAt = departure.toISOString();
      }
      const created = await createCockpitTrip(user.id, {
        destinationCountry: form.destinationCountry,
        destinationCode: form.destinationCode,
        destinationCity: form.destinationCity,
        startDate: form.startDate,
        endDate: form.endDate,
        departureAt,
        flightPnr: form.flightPnr,
        checklistItems: defaultChecklist(),
      }, accessToken);
      setTrips((current) => [...current, created].sort((left, right) => left.startDate.localeCompare(right.startDate)));
      setSelectedTripId(created.id);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      onNotice("Seyahatin kokpite eklendi.");
    } catch (requestError) {
      setError(getSupabaseDataErrorMessage(requestError, "Seyahat kaydedilemedi. Bilgileri kontrol edip tekrar dene."));
    } finally {
      setBusy("");
    }
  };

  const changeStatus = async (trip: CockpitTrip, status: TripStatus) => {
    if (!user || !accessToken || busy || loading || trip.status === status) return;
    setBusy(`status-${trip.id}`);
    setError("");
    try {
      const updated = await updateCockpitTrip(user.id, trip.id, { status }, accessToken, trip.updatedAt);
      setTrips((current) => replaceTrip(current, updated));
      onNotice(`Seyahat durumu “${STATUS_LABELS[status]}” olarak güncellendi.`);
    } catch (requestError) {
      const message = getSupabaseDataErrorMessage(requestError, "Seyahat durumu güncellenemedi.");
      await load();
      setError(message);
    } finally {
      setBusy("");
    }
  };

  const persistChecklist = async (trip: CockpitTrip, nextItems: ChecklistItem[], notice?: string) => {
    if (!user || !accessToken || busy || loading) return;
    setBusy(`checklist-${trip.id}`);
    setError("");
    try {
      const updated = await updateCockpitChecklist(user.id, trip, nextItems, accessToken);
      setTrips((current) => replaceTrip(current, updated));
      if (notice) onNotice(notice);
    } catch (requestError) {
      const message = getSupabaseDataErrorMessage(requestError, "Kontrol listesi kaydedilemedi.");
      await load();
      setError(message);
    } finally {
      setBusy("");
    }
  };

  const toggleChecklistItem = (trip: CockpitTrip, itemId: string) => {
    const next = trip.checklistItems.map((item) => item.id === itemId ? { ...item, completed: !item.completed } : item);
    void persistChecklist(trip, next);
  };

  const addChecklistItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTrip || busy || loading) return;
    const label = newChecklistLabel.replace(/\s+/g, " ").trim().slice(0, 90);
    if (!label) return;
    if (selectedTrip.checklistItems.length >= 50) {
      setError("Bir seyahatte en fazla 50 kontrol listesi maddesi olabilir.");
      return;
    }
    const next = [...selectedTrip.checklistItems, {
      id: createId(),
      label,
      completed: false,
      category: newChecklistCategory,
      createdAt: new Date().toISOString(),
    }];
    setNewChecklistLabel("");
    void persistChecklist(selectedTrip, next, "Kontrol listesine yeni madde eklendi.");
  };

  const removeTrip = async (trip: CockpitTrip) => {
    if (!user || !accessToken || busy || loading) return;
    if (!window.confirm(`${tripTitle(trip)} seyahatini kalıcı olarak silmek istiyor musun?`)) return;
    setBusy(`delete-${trip.id}`);
    setError("");
    try {
      await deleteCockpitTrip(user.id, trip.id, accessToken, trip.updatedAt);
      setTrips((current) => current.filter((item) => item.id !== trip.id));
      setSelectedTripId("");
      onNotice("Seyahat kokpitten silindi.");
    } catch (requestError) {
      const message = getSupabaseDataErrorMessage(requestError, "Seyahat silinemedi.");
      await load();
      setError(message);
    } finally {
      setBusy("");
    }
  };

  if (!user || !accessToken) {
    return <div className="screen cockpit-native-screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="suitcase" size={27} /></span>
        <div><small>AKILLI SEYAHAT KOKPİTİ</small><h1>Yolculuğunu yönet</h1><p>Seyahatlerin aynı hesabınla web ve mobilde birlikte çalışır.</p></div>
      </section>
      <div className="login-required cockpit-auth-state">
        <span><Icon name="lock" size={28} /></span>
        <h2>Kokpitini açmak için giriş yap</h2>
        <p>Seyahat tarihlerin ve hazırlık listen yalnızca hesabına bağlı olarak saklanır.</p>
        <button className="primary-wide" onClick={onOpenAccount}><Icon name="user" size={18} /> Giriş yap / hesap aç</button>
      </div>
    </div>;
  }

  return <div className="screen cockpit-native-screen">
    <section className="page-intro compact-intro cockpit-native-intro">
      <span className="page-icon"><Icon name="suitcase" size={27} /></span>
      <div><small>AKILLI SEYAHAT KOKPİTİ</small><h1>Yolculuğuna hazır ol</h1><p>Tarihlerini, seyahat durumunu ve hazırlık listesini tek yerde yönet.</p></div>
    </section>

    <div className="cockpit-native-toolbar">
      <button className="primary-button" disabled={Boolean(busy) || loading} onClick={() => { setFormOpen((open) => !open); setError(""); }}>
        <Icon name={formOpen ? "close" : "plus"} size={18} /> {formOpen ? "Formu kapat" : "Seyahat ekle"}
      </button>
      <button className="secondary-button" disabled={loading || Boolean(busy)} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />} Yenile
      </button>
    </div>

    {formOpen && <form className="form-card cockpit-trip-form" onSubmit={createTrip}>
      <div className="form-grid two">
        <label>Ülke<input value={form.destinationCountry} maxLength={100} onChange={(event) => setForm({ ...form, destinationCountry: event.target.value })} placeholder="İtalya" /></label>
        <label>Ülke kodu<input value={form.destinationCode} maxLength={2} autoCapitalize="characters" onChange={(event) => setForm({ ...form, destinationCode: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="IT" /></label>
      </div>
      <label>Şehir (isteğe bağlı)<input value={form.destinationCity} maxLength={100} onChange={(event) => setForm({ ...form, destinationCity: event.target.value })} placeholder="Roma" /></label>
      <div className="form-grid two">
        <label>Başlangıç<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: form.endDate && form.endDate < event.target.value ? event.target.value : form.endDate })} /></label>
        <label>Bitiş<input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
      </div>
      <div className="form-grid two">
        <label>Hareket saati (isteğe bağlı)<input type="time" value={form.departureTime} onChange={(event) => setForm({ ...form, departureTime: event.target.value })} /></label>
        <label>PNR (isteğe bağlı)<input value={form.flightPnr} maxLength={20} autoCapitalize="characters" onChange={(event) => setForm({ ...form, flightPnr: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} placeholder="ABC123" /></label>
      </div>
      <button className="primary-wide" disabled={busy === "create" || loading} type="submit">
        {busy === "create" ? <span className="button-loader" /> : <Icon name="plus" size={18} />} {busy === "create" ? "Kaydediliyor" : "Kokpite ekle"}
      </button>
    </form>}

    {error && <div className="info-box error cockpit-native-error" role="alert"><Icon name="alert" size={20} /><p>{error}</p></div>}

    {loading && !trips.length ? <div className="skeleton-list cockpit-native-loading" aria-label="Seyahatler yükleniyor"><div /><div /><div /></div>
      : !trips.length ? <div className="empty-state cockpit-native-empty">
        <span><Icon name="suitcase" size={30} /></span><strong>Henüz kokpit seyahatin yok</strong><p>İlk seyahatini eklediğinde hazırlık listesi hesabında güvenle saklanır.</p>
      </div>
      : <>
        <div className="chip-scroll cockpit-trip-selector" aria-label="Seyahat seçimi">
          {trips.map((trip) => <button key={trip.id} className={selectedTrip?.id === trip.id ? "active" : ""} onClick={() => setSelectedTripId(trip.id)}>
            {trip.destinationCode} · {trip.destinationCity || trip.destinationCountry}
          </button>)}
        </div>

        {selectedTrip && <article className="cockpit-native-card">
          <header className="cockpit-native-card-head">
            <span className="saved-icon"><Icon name="plane" size={21} /></span>
            <div><small>{STATUS_LABELS[selectedTrip.status]}</small><h2>{tripTitle(selectedTrip)}</h2><p>{formatDate(selectedTrip.startDate)} – {formatDate(selectedTrip.endDate)}</p></div>
            <button disabled={Boolean(busy) || loading} onClick={() => void removeTrip(selectedTrip)} aria-label="Seyahati sil"><Icon name="trash" size={18} /></button>
          </header>

          <div className="cockpit-native-details">
            <div><span>Başlangıç</span><strong>{formatDate(selectedTrip.startDate)}</strong></div>
            <div><span>PNR</span><strong>{selectedTrip.flightPnr || "Eklenmedi"}</strong></div>
          </div>

          <label className="cockpit-status-field">Seyahat durumu
            <select value={selectedTrip.status} disabled={Boolean(busy) || loading} onChange={(event) => void changeStatus(selectedTrip, event.target.value as TripStatus)}>
              <option value="upcoming">Yaklaşan</option>
              <option value="active">Devam ediyor</option>
              <option value="completed">Tamamlandı</option>
              <option value="cancelled">İptal edildi</option>
            </select>
          </label>

          <section className="cockpit-checklist-section">
            <div className="section-heading"><div><span>HAZIRLIK</span><h2>Kontrol listesi</h2></div><small>{selectedTrip.checklistItems.filter((item) => item.completed).length}/{selectedTrip.checklistItems.length}</small></div>
            <progress value={selectedTrip.checklistItems.filter((item) => item.completed).length} max={Math.max(1, selectedTrip.checklistItems.length)} aria-label="Hazırlık ilerlemesi" />
            <div className="cockpit-checklist-list">
              {selectedTrip.checklistItems.map((item) => <button key={item.id} className={item.completed ? "completed" : ""} disabled={Boolean(busy) || loading} onClick={() => toggleChecklistItem(selectedTrip, item.id)}>
                <span><Icon name={item.completed ? "check" : "plus"} size={17} /></span><strong>{item.label}</strong><small>{CATEGORY_LABELS[item.category]}</small>
              </button>)}
              {!selectedTrip.checklistItems.length && <div className="empty-inline"><Icon name="info" size={19} /><div><strong>Liste boş</strong><span>Aşağıdan ilk hazırlık maddeni ekleyebilirsin.</span></div></div>}
            </div>
            <form className="cockpit-checklist-form" onSubmit={addChecklistItem}>
              <input value={newChecklistLabel} maxLength={90} onChange={(event) => setNewChecklistLabel(event.target.value)} placeholder="Yeni hazırlık maddesi" aria-label="Yeni hazırlık maddesi" />
              <select value={newChecklistCategory} onChange={(event) => setNewChecklistCategory(event.target.value as ChecklistCategory)} aria-label="Hazırlık kategorisi">
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="submit" disabled={Boolean(busy) || loading || !newChecklistLabel.trim()} aria-label="Madde ekle"><Icon name="plus" size={18} /></button>
            </form>
          </section>
        </article>}
      </>}
  </div>;
}
