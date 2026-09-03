import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AirportField } from "../components/AirportField";
import { Icon } from "../components/Icon";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import type { AirportOption } from "../lib/airports";
import { localIsoDate } from "../lib/dates";
import { normalizeFlightNumber, normalizePnr, tripFormError } from "../lib/cockpitForm";
import { endAllFlightActivities, syncFlightReminders } from "../lib/liveActivity";
import { createId } from "../lib/id";
import {
  areFlightFieldsSupported,
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
  /** Derin bağlantı/bildirimden gelen kayıt: liste yüklenince otomatik seçilir. */
  focusTripId?: string;
  onFocusHandled?: () => void;
  onOpenAccount: () => void;
  onNotice: (message: string) => void;
};

type TripForm = {
  mode: "flight" | "other";
  originAirport: AirportOption | null;
  airport: AirportOption | null;
  countryAlpha3: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  departureTime: string;
  airline: string;
  flightNumber: string;
  flightPnr: string;
};

const EMPTY_FORM: TripForm = {
  mode: "flight",
  originAirport: null,
  airport: null,
  countryAlpha3: "",
  destinationCountry: "",
  destinationCode: "",
  destinationCity: "",
  startDate: "",
  endDate: "",
  departureTime: "",
  airline: "",
  flightNumber: "",
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



function reminderTrips(items: CockpitTrip[]) {
  return items.map((trip) => ({
    id: trip.id,
    title: tripTitle(trip),
    departureAt: trip.departureAt,
    status: trip.status,
    originIata: trip.originIata,
    destinationIata: trip.destinationIata,
  }));
}

function replaceTrip(items: CockpitTrip[], next: CockpitTrip) {
  return items
    .map((item) => item.id === next.id ? next : item)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

type CockpitSessionSnapshot = {
  accessToken: string;
  generation: number;
  userId: string;
};

export function CockpitScreen({ user, accessToken, focusTripId, onFocusHandled, onOpenAccount, onNotice }: CockpitScreenProps) {
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
  const reminderReset = useRef<Promise<void>>(Promise.resolve());
  const userId = user?.id || "";
  const sessionRef = useRef<CockpitSessionSnapshot>({
    accessToken,
    generation: 0,
    userId,
  });

  // Hesap veya token değişimi commit edildiği anda devam eden bütün istekleri
  // geçersiz kıl. Layout effect kullanılması önemlidir: eski bir Promise'in
  // sonucu, normal effect çalışana kadar yeni hesaba ait ekrana yazamaz.
  useLayoutEffect(() => {
    const previous = sessionRef.current;
    if (previous.userId === userId && previous.accessToken === accessToken) return;

    const ownerChanged = previous.userId !== userId;
    sessionRef.current = {
      accessToken,
      generation: previous.generation + 1,
      userId,
    };
    loadGeneration.current += 1;
    setBusy("");
    setError("");
    setLoading(false);

    if (ownerChanged) {
      // Bir hesabın özel kokpit verisi diğer hesap yüklenirken bir kare bile
      // görünmesin; eski hesaba ait cihaz hatırlatmaları da taşınmasın.
      setTrips([]);
      setSelectedTripId("");
      setForm(EMPTY_FORM);
      setFormOpen(false);
      setNewChecklistLabel("");
      // Önce sıradaki/eski snapshot'ı geçersiz kılıp bildirim kuyruğunu
      // boşalt, SONRA eski hesabın Live Activity'lerini kapat. Yeni hesabın
      // eşitlemesi bu zinciri bekleyeceği için geç kalan bir "end all" onun
      // yeni aktivitesini yanlışlıkla kapatamaz.
      reminderReset.current = syncFlightReminders([])
        .then(() => endAllFlightActivities());
    } else {
      // Token yenilenmesinde eski isteğin hatırlatma snapshot'ı da kazanamaz.
      // Aynı kullanıcı olduğu için çalışan Live Activity'leri kapatmayız.
      reminderReset.current = syncFlightReminders([]);
    }
  }, [accessToken, userId]);

  useEffect(() => () => {
    // Ekran başka bir sekmeye geçildiği için kaldırılırsa sunucu isteğini iptal
    // edemeyebiliriz; ancak kaldırılmış örnek artık state/hatırlatma yazamaz.
    const current = sessionRef.current;
    sessionRef.current = { ...current, generation: current.generation + 1 };
    loadGeneration.current += 1;
  }, []);

  const captureSession = (): CockpitSessionSnapshot | null => {
    const current = sessionRef.current;
    if (!current.userId || !current.accessToken) return null;
    return { ...current };
  };

  const isCurrentSession = (snapshot: CockpitSessionSnapshot) => {
    const current = sessionRef.current;
    return current.generation === snapshot.generation
      && current.userId === snapshot.userId
      && current.accessToken === snapshot.accessToken;
  };

  const syncRemindersForSession = (snapshot: CockpitSessionSnapshot, items: CockpitTrip[]) => {
    const reset = reminderReset.current;
    void reset
      .catch(() => undefined)
      .then(() => {
        if (!isCurrentSession(snapshot)) return;
        return syncFlightReminders(reminderTrips(items));
      });
  };

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || trips[0] || null,
    [selectedTripId, trips],
  );

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const session = captureSession();
    if (!session) {
      setTrips([]);
      setSelectedTripId("");
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      // İptal edilen kayıtlar da yüklenir; kullanıcı durumunu yeniden
      // "Yaklaşan" yapabilmeli ve geçmiş kararları kaybolmamalıdır.
      const next = await listCockpitTrips(session.userId, session.accessToken, true);
      if (generation !== loadGeneration.current || !isCurrentSession(session)) return;
      setTrips(next);
      // Yaklaşan uçuşlar için hatırlatma/Live Activity eşitle (izin istemez).
      syncRemindersForSession(session, next);
      setSelectedTripId((current) => next.some((trip) => trip.id === current) ? current : next[0]?.id || "");
    } catch (requestError) {
      if (generation === loadGeneration.current && isCurrentSession(session)) {
        setError(getSupabaseDataErrorMessage(requestError, "Seyahatlerin yüklenemedi."));
      }
    } finally {
      if (generation === loadGeneration.current && isCurrentSession(session)) setLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!focusTripId) return;
    if (trips.some((trip) => trip.id === focusTripId)) {
      setSelectedTripId(focusTripId);
      onFocusHandled?.();
    } else if (!loading && trips.length) {
      // Kayıt bu hesapta yok (silinmiş/yanlış hesap): odak isteği temizlenir.
      onFocusHandled?.();
    }
  }, [focusTripId, loading, onFocusHandled, trips]);

  const createTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const session = captureSession();
    if (!session || busy || loading) return;
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
      const created = await createCockpitTrip(session.userId, {
        destinationCountry: form.destinationCountry,
        destinationCode: form.destinationCode,
        destinationCity: form.destinationCity || (form.airport ? form.airport.city : ""),
        startDate: form.startDate,
        endDate: form.endDate,
        departureAt,
        flightPnr: normalizePnr(form.flightPnr),
        originIata: form.mode === "flight" ? form.originAirport?.iata || "" : "",
        destinationIata: form.mode === "flight" ? form.airport?.iata || "" : "",
        airline: form.mode === "flight" ? form.airline.trim() : "",
        flightNumber: form.mode === "flight" ? normalizeFlightNumber(form.flightNumber) : "",
        checklistItems: defaultChecklist(),
      }, session.accessToken);
      if (!isCurrentSession(session)) return;
      const next = [...trips, created].sort((left, right) => left.startDate.localeCompare(right.startDate));
      setTrips(next);
      syncRemindersForSession(session, next);
      setSelectedTripId(created.id);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      onNotice("Seyahatin kokpite eklendi.");
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      setError(getSupabaseDataErrorMessage(requestError, "Seyahat kaydedilemedi. Bilgileri kontrol edip tekrar dene."));
    } finally {
      if (isCurrentSession(session)) setBusy("");
    }
  };

  const changeStatus = async (trip: CockpitTrip, status: TripStatus) => {
    const session = captureSession();
    if (!session || busy || loading || trip.status === status) return;
    setBusy(`status-${trip.id}`);
    setError("");
    try {
      const updated = await updateCockpitTrip(session.userId, trip.id, { status }, session.accessToken, trip.updatedAt);
      if (!isCurrentSession(session)) return;
      const next = replaceTrip(trips, updated);
      setTrips(next);
      // İptal/tamamlandı seçildiği anda bekleyen yerel bildirimleri iptal et
      // ve varsa Live Activity'yi sonlandır; ekranın yeniden açılmasını bekleme.
      syncRemindersForSession(session, next);
      onNotice(`Seyahat durumu “${STATUS_LABELS[status]}” olarak güncellendi.`);
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      const message = getSupabaseDataErrorMessage(requestError, "Seyahat durumu güncellenemedi.");
      await load();
      if (isCurrentSession(session)) setError(message);
    } finally {
      if (isCurrentSession(session)) setBusy("");
    }
  };

  const persistChecklist = async (trip: CockpitTrip, nextItems: ChecklistItem[], notice?: string) => {
    const session = captureSession();
    if (!session || busy || loading) return;
    setBusy(`checklist-${trip.id}`);
    setError("");
    try {
      const updated = await updateCockpitChecklist(session.userId, trip, nextItems, session.accessToken);
      if (!isCurrentSession(session)) return;
      setTrips((current) => replaceTrip(current, updated));
      if (notice) onNotice(notice);
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      const message = getSupabaseDataErrorMessage(requestError, "Kontrol listesi kaydedilemedi.");
      await load();
      if (isCurrentSession(session)) setError(message);
    } finally {
      if (isCurrentSession(session)) setBusy("");
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
    const session = captureSession();
    if (!session || busy || loading) return;
    if (!window.confirm(`${tripTitle(trip)} seyahatini kalıcı olarak silmek istiyor musun?`)) return;
    setBusy(`delete-${trip.id}`);
    setError("");
    try {
      await deleteCockpitTrip(session.userId, trip.id, session.accessToken, trip.updatedAt);
      if (!isCurrentSession(session)) return;
      const next = trips.filter((item) => item.id !== trip.id);
      setTrips(next);
      // Silinen kayıt liste dışında kaldığı için son bir iptal mezar taşıyla
      // cihazdaki olası Live Activity de kapatılır.
      syncRemindersForSession(session, [...next, { ...trip, status: "cancelled" }]);
      setSelectedTripId("");
      onNotice("Seyahat kokpitten silindi.");
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      const message = getSupabaseDataErrorMessage(requestError, "Seyahat silinemedi.");
      await load();
      if (isCurrentSession(session)) setError(message);
    } finally {
      if (isCurrentSession(session)) setBusy("");
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
      <button className="primary-button" aria-expanded={formOpen} aria-controls="cockpit-trip-form" disabled={Boolean(busy) || loading} onClick={() => { setFormOpen((open) => !open); setError(""); }}>
        <Icon name={formOpen ? "close" : "plus"} size={18} /> {formOpen ? "Kapat" : "Seyahat ekle"}
      </button>
      <button className="secondary-button icon-only" aria-label="Listeyi yenile" disabled={loading || Boolean(busy)} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />}
      </button>
    </div>

    {formOpen && <form id="cockpit-trip-form" className="form-card cockpit-trip-form" onSubmit={createTrip}>
      <p className="required-note"><span>*</span> Zorunlu alanlar</p>
      <div className="cockpit-mode-tabs" role="group" aria-label="Seyahat türü">
        <button type="button" aria-pressed={form.mode === "flight"} className={form.mode === "flight" ? "active" : ""} onClick={() => setForm({ ...form, mode: "flight" })}><Icon name="plane" size={16} /> Uçuşlu</button>
        <button type="button" aria-pressed={form.mode === "other"} className={form.mode === "other" ? "active" : ""} onClick={() => setForm({ ...form, mode: "other", originAirport: null, airport: null })}><Icon name="suitcase" size={16} /> Uçuşsuz</button>
      </div>

      {form.mode === "flight" && (
        <AirportField
          label="Kalkış havalimanı"
          required
          value={form.originAirport}
          onChange={(airport) => setForm({ ...form, originAirport: airport })}
        />
      )}

      {form.mode === "flight" && (
        <AirportField
          label="Varış havalimanı"
          required
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

      <label><span>Ülke <em className="required-mark">· zorunlu</em></span>
        <select
          required
          aria-required="true"
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
        <label><span>Başlangıç <em className="required-mark">· zorunlu</em></span><input required aria-required="true" type="date" min={localIsoDate(0)} value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: form.endDate && form.endDate < event.target.value ? event.target.value : form.endDate })} /></label>
        <label><span>Bitiş <em className="required-mark">· zorunlu</em></span><input required aria-required="true" type="date" min={form.startDate || localIsoDate(0)} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
      </div>
      {form.mode === "flight" && <div className="form-grid two stack-narrow">
        <label>Havayolu (isteğe bağlı)<input value={form.airline} maxLength={80} onChange={(event) => setForm({ ...form, airline: event.target.value })} placeholder="Türk Hava Yolları" /></label>
        <label>Uçuş no (isteğe bağlı)<input value={form.flightNumber} maxLength={8} autoCapitalize="characters" onChange={(event) => setForm({ ...form, flightNumber: normalizeFlightNumber(event.target.value) })} placeholder="TK1979" /></label>
      </div>}
      {form.mode === "flight" && <div className="form-grid two stack-narrow">
        <label><span>Kalkış saati <em className="required-mark">· zorunlu</em></span><input required aria-required="true" type="time" value={form.departureTime} onChange={(event) => setForm({ ...form, departureTime: event.target.value })} /></label>
        <label><span>PNR <em className="required-mark">· rezervasyon kodu</em></span><input required aria-required="true" value={form.flightPnr} maxLength={20} autoCapitalize="characters" onChange={(event) => setForm({ ...form, flightPnr: normalizePnr(event.target.value) })} placeholder="Örn. ABC123" /></label>
      </div>}
      {form.mode === "flight" && !areFlightFieldsSupported() && <p className="form-hint">Uçuş detayları (IATA/uçuş no) sunucu güncellemesi tamamlanana kadar kaydedilmeyebilir; diğer bilgiler güvenle saklanır.</p>}
      <button className="primary-wide cockpit-submit" disabled={busy === "create" || loading} type="submit">
        {busy === "create" ? <span className="button-loader" /> : <Icon name="plus" size={18} />} {busy === "create" ? "Kaydediliyor" : "Kokpite ekle"}
      </button>
    </form>}

    {error && <div className="info-box error cockpit-native-error" role="alert"><Icon name="alert" size={20} /><p>{error}</p>{!formOpen && <button disabled={loading} onClick={() => void load()}>Tekrar dene</button>}</div>}

    {loading && !trips.length ? <div className="skeleton-list cockpit-native-loading" role="status" aria-label="Seyahatler yükleniyor"><div /><div /><div /></div>
      : error && !trips.length ? null
      : !trips.length ? <div className="empty-state cockpit-native-empty">
        <span><Icon name="suitcase" size={30} /></span><strong>Henüz kokpit seyahatin yok</strong><p>İlk seyahatini eklediğinde hazırlık listesi hesabında güvenle saklanır.</p><button className="primary-button empty-state-action" onClick={() => { setFormOpen(true); setError(""); }}><Icon name="plus" size={17} /> İlk seyahatimi ekle</button>
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
            {(selectedTrip.originIata || selectedTrip.destinationIata) && <div><span>Rota</span><strong>{selectedTrip.originIata || "—"} → {selectedTrip.destinationIata || "—"}</strong></div>}
            {(selectedTrip.airline || selectedTrip.flightNumber) && <div><span>Uçuş</span><strong>{[selectedTrip.airline, selectedTrip.flightNumber].filter(Boolean).join(" · ")}</strong></div>}
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
