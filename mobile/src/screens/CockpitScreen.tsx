import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AirportField } from "../components/AirportField";
import { Icon } from "../components/Icon";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import type { AirportOption } from "../lib/airports";
import { localIsoDate } from "../lib/dates";
import { normalizePnr, tripFormError } from "../lib/cockpitForm";
import { syncFlightReminders } from "../lib/liveActivity";
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
  mode: "flight" | "other";
  airport: AirportOption | null;
  countryAlpha3: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  departureTime: string;
  flightPnr: string;
};

const EMPTY_FORM: TripForm = {
  mode: "flight",
  airport: null,
  countryAlpha3: "",
  destinationCountry: "",
  destinationCode: "",
  destinationCity: "",
  startDate: "",
  endDate: "",
  departureTime: "",
  flightPnr: "",
};

// Ülke listesi ada göre sıralı; seçim ülke adını ve ISO kodunu OTOMATİK doldurur.
const COUNTRY_OPTIONS = [...COUNTRY_LIST].sort((a, b) => a.name.localeCompare(b.name, "tr"));



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
      // Yaklaşan uçuşlar için hatırlatma/Live Activity eşitle (izin istemez).
      void syncFlightReminders(next.map((trip) => ({ id: trip.id, title: tripTitle(trip), departureAt: trip.departureAt, status: trip.status })));
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
    const validation = tripFormError(form);
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
        destinationCity: form.destinationCity || (form.airport ? form.airport.city : ""),
        startDate: form.startDate,
        endDate: form.endDate,
        departureAt,
        flightPnr: normalizePnr(form.flightPnr),
        checklistItems: defaultChecklist(),
      }, accessToken);
      setTrips((current) => {
        const next = [...current, created].sort((left, right) => left.startDate.localeCompare(right.startDate));
        void syncFlightReminders(next.map((trip) => ({ id: trip.id, title: tripTitle(trip), departureAt: trip.departureAt, status: trip.status })));
        return next;
      });
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
      setTrips((current) => {
        const next = current.filter((item) => item.id !== trip.id);
        void syncFlightReminders(next.map((item) => ({ id: item.id, title: tripTitle(item), departureAt: item.departureAt, status: item.status })));
        return next;
      });
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
        <Icon name={formOpen ? "close" : "plus"} size={18} /> {formOpen ? "Kapat" : "Seyahat ekle"}
      </button>
      <button className="secondary-button icon-only" aria-label="Listeyi yenile" disabled={loading || Boolean(busy)} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />}
      </button>
    </div>

    {formOpen && <form className="form-card cockpit-trip-form" onSubmit={createTrip}>
      <div className="cockpit-mode-tabs" role="tablist" aria-label="Seyahat türü">
        <button type="button" role="tab" aria-selected={form.mode === "flight"} className={form.mode === "flight" ? "active" : ""} onClick={() => setForm({ ...form, mode: "flight" })}><Icon name="plane" size={16} /> Uçuşlu</button>
        <button type="button" role="tab" aria-selected={form.mode === "other"} className={form.mode === "other" ? "active" : ""} onClick={() => setForm({ ...form, mode: "other", airport: null })}><Icon name="suitcase" size={16} /> Uçuşsuz</button>
      </div>

      {form.mode === "flight" && (
        <AirportField
          label="Varış havalimanı"
          value={form.airport}
          onChange={(airport) => {
            if (!airport) {
              setForm({ ...form, airport: null });
              return;
            }
            // Havalimanı seçimi ülke, şehir ve ISO kodunu OTOMATİK doldurur.
            setForm({
              ...form,
              airport,
              destinationCity: airport.city || form.destinationCity,
              destinationCountry: airport.country,
              destinationCode: airport.countryCode,
              countryAlpha3: "",
            });
          }}
        />
      )}

      <label>Ülke
        <select
          value={form.countryAlpha3 || (form.airport ? `iso2:${form.destinationCode}` : "")}
          onChange={(event) => {
            const alpha3 = event.target.value;
            const country = COUNTRY_OPTIONS.find((item) => item.alpha3 === alpha3);
            if (!country) return;
            setForm({
              ...form,
              countryAlpha3: alpha3,
              destinationCountry: country.name,
              destinationCode: alpha2FromAlpha3(alpha3),
            });
          }}
        >
          <option value="" disabled>{form.airport ? `${flagEmoji(form.destinationCode)} ${form.destinationCountry} (havalimanından)` : "Ülke seç"}</option>
          {form.airport && <option value={`iso2:${form.destinationCode}`} disabled hidden>{`${flagEmoji(form.destinationCode)} ${form.destinationCountry}`}</option>}
          {COUNTRY_OPTIONS.map((country) => (
            <option key={country.alpha3} value={country.alpha3}>
              {flagEmoji(alpha2FromAlpha3(country.alpha3))} {country.name}
            </option>
          ))}
        </select>
      </label>

      <label>Şehir (isteğe bağlı)<input value={form.destinationCity} maxLength={100} onChange={(event) => setForm({ ...form, destinationCity: event.target.value })} placeholder="Roma" /></label>
      <div className="form-grid two stack-narrow">
        <label>Başlangıç<input type="date" min={localIsoDate(0)} value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: form.endDate && form.endDate < event.target.value ? event.target.value : form.endDate })} /></label>
        <label>Bitiş<input type="date" min={form.startDate || localIsoDate(0)} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
      </div>
      {form.mode === "flight" && <div className="form-grid two stack-narrow">
        <label>Kalkış saati (isteğe bağlı)<input type="time" value={form.departureTime} onChange={(event) => setForm({ ...form, departureTime: event.target.value })} /></label>
        <label>PNR (isteğe bağlı)<input value={form.flightPnr} maxLength={20} autoCapitalize="characters" onChange={(event) => setForm({ ...form, flightPnr: normalizePnr(event.target.value) })} placeholder="ABC123" /></label>
      </div>}
      <button className="primary-wide cockpit-submit" disabled={busy === "create" || loading} type="submit">
        {busy === "create" ? <span className="button-loader" /> : <Icon name="plus" size={18} />} {busy === "create" ? "Kaydediliyor" : "Kokpite ekle"}
      </button>
    </form>}

    {error && <div className="info-box error cockpit-native-error" role="alert"><Icon name="alert" size={20} /><p>{error}</p></div>}

    {loading && !trips.length ? <div className="skeleton-list cockpit-native-loading" aria-label="Seyahatler yükleniyor"><div /><div /><div /></div>
      : !trips.length ? <div className="empty-state cockpit-native-empty">
        <span><Icon name="suitcase" size={30} /></span><strong>Henüz kokpit seyahatin yok</strong><p>İlk seyahatini eklediğinde hazırlık listesi hesabında güvenle saklanır.</p>
      </div>
      : <>
        <div className="chip-scroll cockpit-trip-selector" role="group" aria-label="Seyahat seçimi">
          {trips.map((trip) => <button type="button" key={trip.id} className={selectedTrip?.id === trip.id ? "active" : ""} aria-pressed={selectedTrip?.id === trip.id} onClick={() => setSelectedTripId(trip.id)}>
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
              {selectedTrip.checklistItems.map((item) => <button type="button" key={item.id} className={item.completed ? "completed" : ""} aria-pressed={item.completed} aria-label={`${item.label}: ${item.completed ? "tamamlandı" : "tamamlanmadı"}`} disabled={Boolean(busy) || loading} onClick={() => toggleChecklistItem(selectedTrip, item.id)}>
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
