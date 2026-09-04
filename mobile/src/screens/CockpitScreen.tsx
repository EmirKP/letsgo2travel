import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AirportField } from "../components/AirportField";
import { CountryPicker } from "../components/CountryPicker";
import { Icon } from "../components/Icon";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, alpha3FromAlpha2 } from "../data/countryIso";
import type { AirportOption } from "../lib/airports";
import { clampLocalDate, isPastLocalDateTime, localIsoDate, localIsoDateTime } from "../lib/dates";
import { normalizeFlightNumber, normalizePnr, tripFormError } from "../lib/cockpitForm";
import { endAllFlightActivities, syncFlightReminders } from "../lib/liveActivity";
import { createId } from "../lib/id";
import { useI18n } from "../lib/i18n";
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
  arrivalDate: string;
  arrivalTime: string;
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
  arrivalDate: "",
  arrivalTime: "",
  airline: "",
  flightNumber: "",
  flightPnr: "",
};

// Ülke listesi ada göre sıralı; seçim ülke adını ve ISO kodunu OTOMATİK doldurur.
const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  documents: "Belge",
  health: "Sağlık",
  technology: "Teknoloji",
  luggage: "Bavul",
  other: "Diğer",
};

function defaultChecklist(locale: "tr" | "en" = "tr"): ChecklistItem[] {
  const createdAt = new Date().toISOString();
  const labels = locale === "en" ? [
    "Check passport / ID validity",
    "Download flight and accommodation documents",
    "Pack a plug adapter",
    "Pack medication and prescriptions",
    "Set up an eSIM or data plan",
  ] : [
    "Pasaport / kimlik geçerliliğini kontrol et",
    "Uçuş ve konaklama belgelerini indir",
    "Priz adaptörü hazırla",
    "İlaçları ve reçeteleri hazırla",
    "eSIM veya internet paketini ayarla",
  ];
  return [
    { id: createId(), label: labels[0], completed: false, category: "documents", createdAt },
    { id: createId(), label: labels[1], completed: false, category: "documents", createdAt },
    { id: createId(), label: labels[2], completed: false, category: "technology", createdAt },
    { id: createId(), label: labels[3], completed: false, category: "health", createdAt },
    { id: createId(), label: labels[4], completed: false, category: "technology", createdAt },
  ];
}

const DEFAULT_CHECKLIST_LABELS = new Map<string, { tr: string; en: string }>([
  ["Pasaport / kimlik geçerliliğini kontrol et", { tr: "Pasaport / kimlik geçerliliğini kontrol et", en: "Check passport / ID validity" }],
  ["Check passport / ID validity", { tr: "Pasaport / kimlik geçerliliğini kontrol et", en: "Check passport / ID validity" }],
  ["Uçuş ve konaklama belgelerini indir", { tr: "Uçuş ve konaklama belgelerini indir", en: "Download flight and accommodation documents" }],
  ["Download flight and accommodation documents", { tr: "Uçuş ve konaklama belgelerini indir", en: "Download flight and accommodation documents" }],
  ["Priz adaptörü hazırla", { tr: "Priz adaptörü hazırla", en: "Pack a plug adapter" }],
  ["Pack a plug adapter", { tr: "Priz adaptörü hazırla", en: "Pack a plug adapter" }],
  ["İlaçları ve reçeteleri hazırla", { tr: "İlaçları ve reçeteleri hazırla", en: "Pack medication and prescriptions" }],
  ["Pack medication and prescriptions", { tr: "İlaçları ve reçeteleri hazırla", en: "Pack medication and prescriptions" }],
  ["eSIM veya internet paketini ayarla", { tr: "eSIM veya internet paketini ayarla", en: "Set up an eSIM or data plan" }],
  ["Set up an eSIM or data plan", { tr: "eSIM veya internet paketini ayarla", en: "Set up an eSIM or data plan" }],
]);

function checklistLabel(label: string, locale: "tr" | "en") {
  return DEFAULT_CHECKLIST_LABELS.get(label)?.[locale] || label;
}

function formatDate(value: string, locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function minuteAfter(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return "";
  const minutes = Number(match[1]) * 60 + Number(match[2]) + 1;
  if (minutes >= 24 * 60) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function tripTitle(trip: CockpitTrip) {
  return [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ");
}



function reminderTrips(items: CockpitTrip[], language: "tr" | "en") {
  return items.map((trip) => ({
    id: trip.id,
    title: tripTitle(trip),
    departureAt: trip.departureAt,
    arrivalAt: trip.arrivalAt,
    status: trip.status,
    originIata: trip.originIata,
    destinationIata: trip.destinationIata,
    language,
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
  const { copy, countryName, dateLocale, locale } = useI18n();
  const countryOptions = useMemo(() => [...COUNTRY_LIST]
    .sort((a, b) => countryName(a.alpha3, a.name).localeCompare(countryName(b.alpha3, b.name), locale)), [countryName, locale]);
  const countryPickerOptions = useMemo(() => countryOptions.map((country) => ({
    code: country.alpha3,
    flagCode: alpha2FromAlpha3(country.alpha3),
    name: countryName(country.alpha3, country.name),
  })), [countryName, countryOptions]);
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
        return syncFlightReminders(reminderTrips(items, locale));
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
        setError(getSupabaseDataErrorMessage(requestError, copy("Seyahatlerin yüklenemedi.", "Your trips could not be loaded.")));
      }
    } finally {
      if (generation === loadGeneration.current && isCurrentSession(session)) setLoading(false);
    }
  }, [accessToken, copy, locale, userId]);

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
    const validation = tripFormError(form, new Date(), locale);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy("create");
    setError("");
    try {
      let departureAt: string | null = null;
      let arrivalAt: string | null = null;
      if (form.departureTime) {
        const departure = new Date(`${form.startDate}T${form.departureTime}:00`);
        if (Number.isNaN(departure.getTime())) throw new Error("invalid departure");
        departureAt = departure.toISOString();
        const arrival = new Date(`${form.arrivalDate}T${form.arrivalTime}:00`);
        if (Number.isNaN(arrival.getTime()) || arrival <= departure) throw new Error("invalid arrival");
        arrivalAt = arrival.toISOString();
      }
      const created = await createCockpitTrip(session.userId, {
        destinationCountry: form.destinationCountry,
        destinationCode: form.destinationCode,
        destinationCity: form.destinationCity || (form.airport ? form.airport.city : ""),
        startDate: form.startDate,
        endDate: form.endDate,
        departureAt,
        arrivalAt,
        appLanguage: locale,
        flightPnr: normalizePnr(form.flightPnr),
        originIata: form.mode === "flight" ? form.originAirport?.iata || "" : "",
        destinationIata: form.mode === "flight" ? form.airport?.iata || "" : "",
        airline: form.mode === "flight" ? form.airline.trim() : "",
        flightNumber: form.mode === "flight" ? normalizeFlightNumber(form.flightNumber) : "",
        checklistItems: defaultChecklist(locale),
      }, session.accessToken);
      if (!isCurrentSession(session)) return;
      const next = [...trips, created].sort((left, right) => left.startDate.localeCompare(right.startDate));
      setTrips(next);
      syncRemindersForSession(session, next);
      setSelectedTripId(created.id);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      onNotice(copy("Seyahatin kokpite eklendi.", "Your trip was added to the cockpit."));
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      setError(getSupabaseDataErrorMessage(requestError, copy("Seyahat kaydedilemedi. Bilgileri kontrol edip tekrar dene.", "The trip could not be saved. Check the details and try again.")));
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
      const statusLabel = status === "upcoming" ? copy("Yaklaşan", "Upcoming") : status === "active" ? copy("Devam ediyor", "In progress") : status === "completed" ? copy("Tamamlandı", "Completed") : copy("İptal edildi", "Cancelled");
      onNotice(copy(`Seyahat durumu “${statusLabel}” olarak güncellendi.`, `Trip status updated to “${statusLabel}”.`));
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      const message = getSupabaseDataErrorMessage(requestError, copy("Seyahat durumu güncellenemedi.", "Trip status could not be updated."));
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
      const message = getSupabaseDataErrorMessage(requestError, copy("Kontrol listesi kaydedilemedi.", "The checklist could not be saved."));
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
      setError(copy("Bir seyahatte en fazla 50 kontrol listesi maddesi olabilir.", "A trip can have at most 50 checklist items."));
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
    void persistChecklist(selectedTrip, next, copy("Kontrol listesine yeni madde eklendi.", "A new checklist item was added."));
  };

  const removeTrip = async (trip: CockpitTrip) => {
    const session = captureSession();
    if (!session || busy || loading) return;
    if (!window.confirm(copy(`${tripTitle(trip)} seyahatini kalıcı olarak silmek istiyor musun?`, `Permanently delete the ${tripTitle(trip)} trip?`))) return;
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
      onNotice(copy("Seyahat kokpitten silindi.", "The trip was removed from your cockpit."));
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      const message = getSupabaseDataErrorMessage(requestError, copy("Seyahat silinemedi.", "The trip could not be deleted."));
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
        <div><small>{copy("AKILLI SEYAHAT KOKPİTİ", "SMART TRAVEL COCKPIT")}</small><h1>{copy("Yolculuğunu yönet", "Manage your journey")}</h1><p>{copy("Seyahatlerin aynı hesabınla web ve mobilde birlikte çalışır.", "Your trips stay in sync across web and mobile.")}</p></div>
      </section>
      <div className="login-required cockpit-auth-state">
        <span><Icon name="lock" size={28} /></span>
        <h2>{copy("Kokpitini açmak için giriş yap", "Sign in to open your cockpit")}</h2>
        <p>{copy("Seyahat tarihlerin ve hazırlık listen yalnızca hesabına bağlı olarak saklanır.", "Your trip dates and checklist are stored securely with your account.")}</p>
        <button className="primary-wide" onClick={onOpenAccount}><Icon name="user" size={18} /> {copy("Giriş yap / hesap aç", "Sign in / create account")}</button>
      </div>
    </div>;
  }

  return <div className="screen cockpit-native-screen">
    <section className="page-intro compact-intro cockpit-native-intro">
      <span className="page-icon"><Icon name="suitcase" size={27} /></span>
      <div><small>{copy("AKILLI SEYAHAT KOKPİTİ", "SMART TRAVEL COCKPIT")}</small><h1>{copy("Yolculuğuna hazır ol", "Be ready for your journey")}</h1><p>{copy("Tarihlerini, seyahat durumunu ve hazırlık listesini tek yerde yönet.", "Manage dates, trip status and your checklist in one place.")}</p></div>
    </section>

    <div className="cockpit-native-toolbar">
      <button className="primary-button" aria-expanded={formOpen} aria-controls="cockpit-trip-form" disabled={Boolean(busy) || loading} onClick={() => { setFormOpen((open) => !open); setError(""); }}>
        <Icon name={formOpen ? "close" : "plus"} size={18} /> {formOpen ? copy("Kapat", "Close") : copy("Seyahat ekle", "Add trip")}
      </button>
      <button className="secondary-button icon-only" aria-label={copy("Listeyi yenile", "Refresh list")} disabled={loading || Boolean(busy)} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />}
      </button>
    </div>

    {formOpen && <form id="cockpit-trip-form" className="form-card cockpit-trip-form" onSubmit={createTrip}>
      <p className="required-note"><span>*</span> {copy("Zorunlu alanlar", "Required fields")}</p>
      <div className="cockpit-mode-tabs" role="group" aria-label={copy("Seyahat türü", "Trip type")}>
        <button type="button" aria-pressed={form.mode === "flight"} className={form.mode === "flight" ? "active" : ""} onClick={() => setForm({ ...form, mode: "flight" })}><Icon name="plane" size={16} /> {copy("Uçuşlu", "Flight")}</button>
        <button type="button" aria-pressed={form.mode === "other"} className={form.mode === "other" ? "active" : ""} onClick={() => setForm({ ...form, mode: "other", originAirport: null, airport: null })}><Icon name="suitcase" size={16} /> {copy("Uçuşsuz", "No flight")}</button>
      </div>

      {form.mode === "flight" && (
        <AirportField
          label={copy("Kalkış havalimanı", "Departure airport")}
          required
          value={form.originAirport}
          onChange={(airport) => setForm({ ...form, originAirport: airport })}
        />
      )}

      {form.mode === "flight" && (
        <AirportField
          label={copy("Varış havalimanı", "Arrival airport")}
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

      <CountryPicker
          label={copy("Ülke · zorunlu", "Country · required")}
          placeholder={copy("Ülke seç", "Choose country")}
          options={countryPickerOptions}
          value={form.countryAlpha3 || alpha3FromAlpha2(form.destinationCode)}
          onChange={(alpha3) => {
            const country = countryOptions.find((item) => item.alpha3 === alpha3);
            if (!country) return;
            setForm({
              ...form,
              countryAlpha3: alpha3,
              destinationCountry: country.name,
              destinationCode: alpha2FromAlpha3(alpha3),
            });
          }}
      />

      <label>{copy("Şehir (isteğe bağlı)", "City (optional)")}<input value={form.destinationCity} maxLength={100} onChange={(event) => setForm({ ...form, destinationCity: event.target.value })} placeholder={copy("Roma", "Rome")} /></label>
      <div className="form-grid two stack-narrow">
        <label><span>{copy("Başlangıç", "Start")} <em className="required-mark">· {copy("zorunlu", "required")}</em></span><input required aria-required="true" type="date" min={localIsoDate(0)} max={localIsoDate(730)} value={form.startDate} onChange={(event) => {
          const requested = event.target.value;
          const next = clampLocalDate(requested, localIsoDate(0), localIsoDate(730));
          setForm({ ...form, startDate: next, endDate: form.endDate && form.endDate < next ? next : form.endDate, arrivalDate: form.arrivalDate && form.arrivalDate < next ? next : form.arrivalDate || next });
          if (requested && requested !== next) onNotice(copy("Geçmiş bir başlangıç tarihi seçilemez.", "A past start date cannot be selected."));
        }} /></label>
        <label><span>{copy("Seyahat bitişi", "Trip end")} <em className="required-mark">· {copy("zorunlu", "required")}</em></span><input required aria-required="true" type="date" min={form.startDate || localIsoDate(0)} max={localIsoDate(730)} value={form.endDate} onChange={(event) => {
          const requested = event.target.value;
          const next = clampLocalDate(requested, form.startDate || localIsoDate(0), localIsoDate(730));
          setForm({ ...form, endDate: next, arrivalDate: form.arrivalDate && form.arrivalDate > next ? next : form.arrivalDate });
          if (requested && requested !== next) onNotice(copy("Bitiş tarihi başlangıçtan önce olamaz.", "The end date cannot be before the start date."));
        }} /></label>
      </div>
      {form.mode === "flight" && <div className="form-grid two stack-narrow">
        <label>{copy("Havayolu (isteğe bağlı)", "Airline (optional)")}<input value={form.airline} maxLength={80} onChange={(event) => setForm({ ...form, airline: event.target.value })} placeholder={copy("Türk Hava Yolları", "Turkish Airlines")} /></label>
        <label>{copy("Uçuş no (isteğe bağlı)", "Flight no. (optional)")}<input value={form.flightNumber} maxLength={8} autoCapitalize="characters" onChange={(event) => setForm({ ...form, flightNumber: normalizeFlightNumber(event.target.value) })} placeholder="TK1979" /></label>
      </div>}
      {form.mode === "flight" && <div className="form-grid two stack-narrow">
        <label><span>{copy("Kalkış saati", "Departure time")} <em className="required-mark">· {copy("zorunlu", "required")}</em></span><input required aria-required="true" type="time" value={form.departureTime} onChange={(event) => {
          const requested = event.target.value;
          const next = form.startDate && isPastLocalDateTime(form.startDate, requested) ? localIsoDateTime(5).slice(11, 16) : requested;
          setForm({ ...form, departureTime: next });
          if (requested && requested !== next) onNotice(copy("Geçmiş bir kalkış saati seçilemez.", "A past departure time cannot be selected."));
        }} /></label>
        <label><span>PNR <em className="required-mark">· {copy("rezervasyon kodu", "booking code")}</em></span><input required aria-required="true" value={form.flightPnr} maxLength={20} autoCapitalize="characters" onChange={(event) => setForm({ ...form, flightPnr: normalizePnr(event.target.value) })} placeholder={copy("Örn. ABC123", "E.g. ABC123")} /></label>
      </div>}
      {form.mode === "flight" && <div className="form-grid two stack-narrow cockpit-arrival-fields">
        <label><span>{copy("Planlanan varış tarihi", "Scheduled arrival date")} <em className="required-mark">· {copy("zorunlu", "required")}</em></span><input required aria-required="true" type="date" min={form.startDate || localIsoDate(0)} max={form.endDate || localIsoDate(730)} value={form.arrivalDate} onChange={(event) => {
          const requested = event.target.value;
          const next = clampLocalDate(requested, form.startDate || localIsoDate(0), form.endDate || localIsoDate(730));
          setForm({ ...form, arrivalDate: next });
          if (requested && requested !== next) onNotice(copy("Varış tarihi seyahat aralığının dışında olamaz.", "Arrival must stay within the trip dates."));
        }} /></label>
        <label><span>{copy("Planlanan varış saati", "Scheduled arrival time")} <em className="required-mark">· {copy("zorunlu", "required")}</em></span><input required aria-required="true" type="time" min={form.arrivalDate === form.startDate ? minuteAfter(form.departureTime) || undefined : undefined} value={form.arrivalTime} onChange={(event) => {
          const requested = event.target.value;
          const earliest = form.arrivalDate === form.startDate ? form.departureTime : "";
          const next = earliest && requested <= earliest ? minuteAfter(earliest) || requested : requested;
          setForm({ ...form, arrivalTime: next });
          if (requested && requested !== next) onNotice(copy("Varış saati kalkıştan sonra olmalı.", "Arrival time must be after departure."));
        }} /></label>
      </div>}
      {form.mode === "flight" && !areFlightFieldsSupported() && <p className="form-hint">{copy("Uçuş detayları (IATA/uçuş no) sunucu güncellemesi tamamlanana kadar kaydedilmeyebilir; diğer bilgiler güvenle saklanır.", "Flight details (IATA/flight number) may not save until the server update is complete; other details remain safe.")}</p>}
      <button className="primary-wide cockpit-submit" disabled={busy === "create" || loading} type="submit">
        {busy === "create" ? <span className="button-loader" /> : <Icon name="plus" size={18} />} {busy === "create" ? copy("Kaydediliyor", "Saving") : copy("Kokpite ekle", "Add to cockpit")}
      </button>
    </form>}

    {error && <div className="info-box error cockpit-native-error" role="alert"><Icon name="alert" size={20} /><p>{error}</p>{!formOpen && <button disabled={loading} onClick={() => void load()}>{copy("Tekrar dene", "Try again")}</button>}</div>}

    {loading && !trips.length ? <div className="skeleton-list cockpit-native-loading" role="status" aria-label={copy("Seyahatler yükleniyor", "Loading trips")}><div /><div /><div /></div>
      : error && !trips.length ? null
      : !trips.length ? <div className="empty-state cockpit-native-empty">
        <span><Icon name="suitcase" size={30} /></span><strong>{copy("Henüz kokpit seyahatin yok", "No cockpit trips yet")}</strong><p>{copy("İlk seyahatini eklediğinde hazırlık listesi hesabında güvenle saklanır.", "Add your first trip and its checklist will be stored safely with your account.")}</p><button className="primary-button empty-state-action" onClick={() => { setFormOpen(true); setError(""); }}><Icon name="plus" size={17} /> {copy("İlk seyahatimi ekle", "Add my first trip")}</button>
      </div>
      : <>
        <div className="chip-scroll cockpit-trip-selector" role="group" aria-label={copy("Seyahat seçimi", "Choose trip")}>
          {trips.map((trip) => <button type="button" key={trip.id} className={selectedTrip?.id === trip.id ? "active" : ""} aria-pressed={selectedTrip?.id === trip.id} onClick={() => setSelectedTripId(trip.id)}>
            {trip.destinationCode} · {trip.destinationCity || trip.destinationCountry}
          </button>)}
        </div>

        {selectedTrip && <article className="cockpit-native-card">
          <header className="cockpit-native-card-head">
            <span className="saved-icon"><Icon name="plane" size={21} /></span>
            <div><small>{selectedTrip.status === "upcoming" ? copy("Yaklaşan", "Upcoming") : selectedTrip.status === "active" ? copy("Devam ediyor", "In progress") : selectedTrip.status === "completed" ? copy("Tamamlandı", "Completed") : copy("İptal edildi", "Cancelled")}</small><h2>{tripTitle(selectedTrip)}</h2><p>{formatDate(selectedTrip.startDate, dateLocale)} – {formatDate(selectedTrip.endDate, dateLocale)}</p></div>
            <button disabled={Boolean(busy) || loading} onClick={() => void removeTrip(selectedTrip)} aria-label={copy("Seyahati sil", "Delete trip")}><Icon name="trash" size={18} /></button>
          </header>

          <div className="cockpit-native-details">
            <div><span>{copy("Başlangıç", "Start")}</span><strong>{formatDate(selectedTrip.startDate, dateLocale)}</strong></div>
            <div><span>PNR</span><strong>{selectedTrip.flightPnr || copy("Eklenmedi", "Not added")}</strong></div>
            {(selectedTrip.originIata || selectedTrip.destinationIata) && <div><span>{copy("Rota", "Route")}</span><strong>{selectedTrip.originIata || "—"} → {selectedTrip.destinationIata || "—"}</strong></div>}
            {(selectedTrip.airline || selectedTrip.flightNumber) && <div><span>{copy("Uçuş", "Flight")}</span><strong>{[selectedTrip.airline, selectedTrip.flightNumber].filter(Boolean).join(" · ")}</strong></div>}
            {selectedTrip.arrivalAt && <div><span>{copy("Planlanan varış", "Scheduled arrival")}</span><strong>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(selectedTrip.arrivalAt))}</strong></div>}
          </div>

          <label className="cockpit-status-field">{copy("Seyahat durumu", "Trip status")}
            <select value={selectedTrip.status} disabled={Boolean(busy) || loading} onChange={(event) => void changeStatus(selectedTrip, event.target.value as TripStatus)}>
              <option value="upcoming">{copy("Yaklaşan", "Upcoming")}</option>
              <option value="active">{copy("Devam ediyor", "In progress")}</option>
              <option value="completed">{copy("Tamamlandı", "Completed")}</option>
              <option value="cancelled">{copy("İptal edildi", "Cancelled")}</option>
            </select>
          </label>

          <section className="cockpit-checklist-section">
            <div className="section-heading"><div><span>{copy("HAZIRLIK", "PREPARATION")}</span><h2>{copy("Kontrol listesi", "Checklist")}</h2></div><small>{selectedTrip.checklistItems.filter((item) => item.completed).length}/{selectedTrip.checklistItems.length}</small></div>
            <progress value={selectedTrip.checklistItems.filter((item) => item.completed).length} max={Math.max(1, selectedTrip.checklistItems.length)} aria-label={copy("Hazırlık ilerlemesi", "Preparation progress")} />
            <div className="cockpit-checklist-list">
              {selectedTrip.checklistItems.map((item) => <button type="button" key={item.id} className={item.completed ? "completed" : ""} aria-pressed={item.completed} aria-label={`${checklistLabel(item.label, locale)}: ${item.completed ? copy("tamamlandı", "complete") : copy("tamamlanmadı", "incomplete")}`} disabled={Boolean(busy) || loading} onClick={() => toggleChecklistItem(selectedTrip, item.id)}>
                <span><Icon name={item.completed ? "check" : "plus"} size={17} /></span><strong>{checklistLabel(item.label, locale)}</strong><small>{item.category === "documents" ? copy("Belge", "Documents") : item.category === "health" ? copy("Sağlık", "Health") : item.category === "technology" ? copy("Teknoloji", "Technology") : item.category === "luggage" ? copy("Bavul", "Luggage") : copy("Diğer", "Other")}</small>
              </button>)}
              {!selectedTrip.checklistItems.length && <div className="empty-inline"><Icon name="info" size={19} /><div><strong>{copy("Liste boş", "The list is empty")}</strong><span>{copy("Aşağıdan ilk hazırlık maddeni ekleyebilirsin.", "Add your first preparation item below.")}</span></div></div>}
            </div>
            <form className="cockpit-checklist-form" onSubmit={addChecklistItem}>
              <input value={newChecklistLabel} maxLength={90} onChange={(event) => setNewChecklistLabel(event.target.value)} placeholder={copy("Yeni hazırlık maddesi", "New checklist item")} aria-label={copy("Yeni hazırlık maddesi", "New checklist item")} />
              <select value={newChecklistCategory} onChange={(event) => setNewChecklistCategory(event.target.value as ChecklistCategory)} aria-label={copy("Hazırlık kategorisi", "Checklist category")}>
                {Object.keys(CATEGORY_LABELS).map((value) => <option key={value} value={value}>{value === "documents" ? copy("Belge", "Documents") : value === "health" ? copy("Sağlık", "Health") : value === "technology" ? copy("Teknoloji", "Technology") : value === "luggage" ? copy("Bavul", "Luggage") : copy("Diğer", "Other")}</option>)}
              </select>
              <button type="submit" disabled={Boolean(busy) || loading || !newChecklistLabel.trim()} aria-label={copy("Madde ekle", "Add item")}><Icon name="plus" size={18} /></button>
            </form>
          </section>
        </article>}
      </>}
  </div>;
}
