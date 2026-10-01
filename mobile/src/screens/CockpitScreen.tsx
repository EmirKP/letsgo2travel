import { formatAppDate } from "../lib/localeFormatting";
import { eventDateLabel, eventTimeLabel } from "../../../lib/event-time";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { onAccountResume } from "../lib/accountResume";
import { AirportField } from "../components/AirportField";
import { CountryPicker } from "../components/CountryPicker";
import { DateTimeField } from "../components/DateTimeField";
import { Icon } from "../components/Icon";
import { PageHero } from "../components/PageHero";
import { Sheet } from "../components/Sheet";
import { CockpitFlightLookup } from "../components/CockpitFlightLookup";
import { CockpitFlightDetails } from "../components/CockpitFlightDetails";
import { PersonalTravelCards } from "../components/PersonalTravelCards";
import { CockpitTicketImport } from "../components/CockpitTicketImport";
import { CockpitTripEditor } from "../components/CockpitTripEditor";
import { CockpitJourneySection } from "../components/CockpitJourneySection";
import { validJourneyIntent, type CockpitJourneyIntent } from "../lib/cockpitJourney";
import { journeyCountry } from "../lib/journeyCountry";
import { activeFlightExpiry, canSaveFlightSelection, parseFlightMatch, type FlightSelection } from "../lib/flightSelection";
import { flightSelectionDeadline } from "../../../lib/flight-progress";
import type { TicketFields } from "../lib/ticketText";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, alpha3FromAlpha2 } from "../data/countryIso";
import { airportTimeZone } from "../../../lib/airport-time-zones";
import { zonedParts } from "../../../lib/zoned-time";
import { searchAirports, type AirportOption } from "../lib/airports";
import { clampLocalDate, localIsoDate } from "../lib/dates";
import { flightTimes, normalizeFlightNumber, normalizePnr, tripFormError } from "../lib/cockpitForm";
import { endAllFlightActivities, PROVIDER_ACTIVITY_MIN_RETENTION_MS, syncFlightReminders } from "../lib/liveActivity";
import { createId } from "../lib/id";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import {
  areFlightFieldsSupported,
  createCockpitTrip,
  deleteCockpitTrip,
  getSupabaseDataErrorMessage,
  listCockpitTrips,
  refreshCockpitFlight,
  updateCockpitChecklist,
  updateCockpitTrip,
  type ChecklistCategory,
  type ChecklistItem,
  type CockpitTrip,
  type TripStatus,
  type UpdateCockpitTripInput,
} from "../lib/supabaseData";
import type { AuthUser } from "../types";
import "./cockpit-journey.css";
import "./travel-flow-polish.css";

type CockpitScreenProps = {
  user: AuthUser | null;
  accessToken: string;
  /** Derin bağlantı/bildirimden gelen kayıt: liste yüklenince otomatik seçilir. */
  focusTripId?: string;
  onFocusHandled?: () => void;
  onOpenAccount: () => void;
  onNotice: (message: string) => void;
  journeyIntent?: CockpitJourneyIntent | null;
  onJourneyHandled?: () => void;
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
  departureUtc?: string;
  arrivalUtc?: string;
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

function defaultChecklist(locale: "tr" | "en" | "sq" = "tr"): ChecklistItem[] {
  const createdAt = new Date().toISOString();
  const labels = locale === "sq" ? CHECKLIST_SQ : locale === "en" ? [
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

const CHECKLIST_SQ = ['Kontrollo vlefshmërinë e pasaportës / letërnjoftimit', 'Shkarko dokumentet e fluturimit dhe akomodimit', 'Përgatit një përshtatës prize', 'Përgatit ilaçet dhe recetat', 'Aktivizo eSIM-in ose paketën e internetit'];
CHECKLIST_SQ.forEach((label, index) => {
  const entry = [...DEFAULT_CHECKLIST_LABELS.values()][index * 2];
  if (entry) DEFAULT_CHECKLIST_LABELS.set(label, entry);
});

function checklistLabel(label: string, locale: "tr" | "en" | "sq") {
  const entry = DEFAULT_CHECKLIST_LABELS.get(label);
  if (!entry) return label;
  if (locale === 'sq') {
    const index = [...DEFAULT_CHECKLIST_LABELS.keys()].slice(0, 10).findIndex(key => key === entry.tr);
    return CHECKLIST_SQ[Math.floor(index / 2)] || label;
  }
  return entry[locale];
}

function formatDate(value: string, locale = "tr-TR") {
  try {
    return formatAppDate(new Date(`${value}T12:00:00`), locale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

function tripTitle(trip: CockpitTrip) {
  return [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ") || trip.flightNumber || "Seyahat / Trip";
}

function displayTrip(trip: CockpitTrip, now: number): CockpitTrip {
  const flight = trip.providerFlight;
  if ((trip.status !== "upcoming" && trip.status !== "active") || !trip.flightLookupManaged || !flight || !activeFlightExpiry(trip.flightLookupExpiresAt, flight.fetchedAt, now)) return trip;
  return { ...trip, destinationCity: flight.destination.city, destinationCountry: flight.destination.country, destinationCode: flight.destination.countryCode,
    originIata: flight.origin.iata, destinationIata: flight.destination.iata, airline: flight.airline, departureAt: flight.departureAt, arrivalAt: flight.arrivalAt };
}

function clearProviderForm(form: TripForm): TripForm {
  return { ...EMPTY_FORM, flightNumber: form.flightNumber, startDate: form.startDate, endDate: form.endDate, flightPnr: form.flightPnr };
}


function nativeFlightView(trip: CockpitTrip) {
  if ((trip.status !== "upcoming" && trip.status !== "active") || !trip.flightLookupManaged || trip.providerFlight?.nativeDisplayAllowed !== true || !trip.providerFlight.progress) return null;
  const flight = parseFlightMatch(trip.providerFlight, trip.flightNumber || undefined, trip.startDate);
  const expiresAt = trip.flightLookupExpiresAt;
  if (!flight?.progress || !activeFlightExpiry(expiresAt, flight.fetchedAt) || Date.parse(expiresAt) < Date.now() + PROVIDER_ACTIVITY_MIN_RETENTION_MS) return null;
  return { flight, expiresAt };
}

function reminderTrips(items: CockpitTrip[], language: "tr" | "en" | "sq") {
  return items.map(trip => {
    const native = nativeFlightView(trip), flight = native?.flight;
    const p = flight?.progress;
    const manual = !trip.flightLookupManaged;
    return { id: trip.id, title: flight ? [flight.destination.city, flight.destination.country].join(", ") : manual ? tripTitle(trip) : trip.flightNumber || (language === "sq" ? "Udhëtim" : language === "tr" ? "Seyahat" : "Trip"),
      departureAt: flight?.departureAt || (manual ? trip.departureAt : null), arrivalAt: flight?.arrivalAt || (manual ? trip.arrivalAt : null), status: trip.status,
      originIata: flight?.origin.iata || (manual ? trip.originIata : null), destinationIata: flight?.destination.iata || (manual ? trip.destinationIata : null),
      originTimeZone: flight?.origin.timeZone || (manual ? airportTimeZone(trip.originIata || "") : undefined),
      destinationTimeZone: flight?.destination.timeZone || (manual ? airportTimeZone(trip.destinationIata || "") : undefined), flightNumber: trip.flightNumber, language,
      ...(native && p ? { provider: { status: p.status, updatedAt: p.sourceUpdatedAt, freshUntil: p.freshUntil, expiresAt: native.expiresAt,
        revisedDepartureAt: p.departure.revisedAt, revisedArrivalAt: p.arrival.revisedAt, departureKind: p.departure.revisedKind, arrivalKind: p.arrival.revisedKind } } : {}),
    };
  });
}

function replaceTrip(items: CockpitTrip[], next: CockpitTrip) {
  return items
    .map((item) => {
      if (item.id !== next.id) return item;
      const base = { ...next }; delete base.providerFlight;
      if (!next.flightLookupManaged || (next.status !== "upcoming" && next.status !== "active")) return base;
      const flight = Object.hasOwn(next, "providerFlight") ? next.providerFlight : (next.flightLookupExpiresAt === item.flightLookupExpiresAt ? item.providerFlight : undefined);
      return flight && activeFlightExpiry(next.flightLookupExpiresAt, flight.fetchedAt) ? { ...base, providerFlight: flight } : base;
    })
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

type CockpitSessionSnapshot = {
  accessToken: string;
  generation: number;
  userId: string;
};

export function CockpitScreen({ user, accessToken, focusTripId, onFocusHandled, onOpenAccount, onNotice, journeyIntent, onJourneyHandled }: CockpitScreenProps) {
  const { copy, countryName, dateLocale, locale } = useI18n();
  const pastDepartureMessage = copy(
    "Planlanan kalkış saati geçti ve devam eden uçuş bilgisi doğrulanamadı. Biletindeki bilgilerle elle devam edebilirsin.",
    "The scheduled departure time has passed and ongoing flight details could not be verified. You can continue manually with your ticket.",
  );
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
  const [deleteTarget, setDeleteTarget] = useState<{ trip: CockpitTrip; session: CockpitSessionSnapshot } | null>(null);
  const pendingDelete = useRef<CockpitSessionSnapshot | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TripForm>(EMPTY_FORM);
  const [manualFlight, setManualFlight] = useState(false);
  const [matchedFlight, setMatchedFlight] = useState<FlightSelection | null>(null);
  const [lookupMode, setLookupMode] = useState<"trial" | "commercial">("trial");
  const [editTicket, setEditTicket] = useState(true);
  const [refreshAfter, setRefreshAfter] = useState<Record<string, number>>({});
  const pendingRefresh = useRef<object | null>(null);
  const [autoRefreshStopped, setAutoRefreshStopped] = useState(false);
  const autoRefresh = useRef<(trip: CockpitTrip, signal: AbortSignal) => void>(() => {});
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [newChecklistCategory, setNewChecklistCategory] = useState<ChecklistCategory>("other");
  const [editingTrip, setEditingTrip] = useState<CockpitTrip | null>(null);
  const [editError, setEditError] = useState("");
  const [editConflict, setEditConflict] = useState(false);
  const loadGeneration = useRef(0);
  const pendingCreate = useRef<CockpitSessionSnapshot | null>(null);
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
    setDeleteTarget(null); pendingDelete.current = null;
    setError("");
    setLoading(false);

    if (ownerChanged) {
      // Bir hesabın özel kokpit verisi diğer hesap yüklenirken bir kare bile
      // görünmesin; eski hesaba ait cihaz hatırlatmaları da taşınmasın.
      setTrips([]);
      setSelectedTripId("");
      setForm(EMPTY_FORM);
      pendingCreate.current = null;
      setManualFlight(false);
      setMatchedFlight(null);
      setEditTicket(true);
      setRefreshAfter({}); pendingRefresh.current = null; setAutoRefreshStopped(false);
      setFormOpen(false);
      setNewChecklistLabel("");
      setEditingTrip(null); setEditError(""); setEditConflict(false);
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
  const selectedTripEvents = useMemo(() => selectedTrip?.checklistItems.filter((item) => item.kind === "event") || [], [selectedTrip]);
  const selectedChecklistItems = useMemo(() => selectedTrip?.checklistItems.filter((item) => item.kind !== "event") || [], [selectedTrip]);

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
      const next = await listCockpitTrips(session.userId, session.accessToken, true, true);
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

  useEffect(() => onAccountResume(() => {
    // Keep an open editor's snapshot intact; its save uses the existing
    // conflict check instead of silently replacing the user's draft.
    if (userId && accessToken && !busy && !loading && !editingTrip && !deleteTarget) void load();
  }), [userId, accessToken, busy, loading, editingTrip, deleteTarget, load]);

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

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const check = () => setClock(Date.now());
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, []);
  useEffect(() => {
    const expiries = trips.filter(trip => trip.providerFlight).map(trip => Date.parse(trip.flightLookupExpiresAt || ""));
    if (matchedFlight) expiries.push(Date.parse(matchedFlight.expiresAt), flightSelectionDeadline(matchedFlight, new Date(clock)), Date.parse(matchedFlight.progress?.freshUntil || ""));
    for (const trip of trips) expiries.push(Date.parse(trip.providerFlight?.progress?.freshUntil || ""));
    const next = Math.min(...expiries.filter(value => Number.isFinite(value) && value > clock));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(Math.max(0, next - Date.now()), 2147483647));
    return () => clearTimeout(timer);
  }, [clock, matchedFlight, trips]);
  useLayoutEffect(() => {
    if (matchedFlight && !activeFlightExpiry(matchedFlight.expiresAt, matchedFlight.fetchedAt, clock)) {
      setMatchedFlight(null); setManualFlight(false); setForm(clearProviderForm);
      setError(copy("Uçuş bilgisinin süresi doldu. Yeniden ara; PNR ve seyahat bitiş tarihin duruyor.", "Flight details have expired. Search again; your PNR and trip end date are kept."));
    }
    if (trips.some(trip => trip.providerFlight && ((trip.status !== "upcoming" && trip.status !== "active") || !activeFlightExpiry(trip.flightLookupExpiresAt, trip.providerFlight.fetchedAt, clock)))) {
      const next = trips.map(trip => {
        if (!trip.providerFlight || ((trip.status === "upcoming" || trip.status === "active") && activeFlightExpiry(trip.flightLookupExpiresAt, trip.providerFlight.fetchedAt, clock))) return trip;
        const base = { ...trip }; delete base.providerFlight; return base;
      });
      setTrips(next);
      const session = captureSession(); if (session) syncRemindersForSession(session, next);
    }
  }, [clock, copy, matchedFlight, trips]);
  const selectedDisplay = selectedTrip ? displayTrip(selectedTrip, clock) : null;
  const departureZone = airportTimeZone(form.originAirport?.iata || "", form.originAirport?.timeZone);
  const arrivalZone = airportTimeZone(form.airport?.iata || "", form.airport?.timeZone);
  const earliestStart = form.mode === "flight" && departureZone ? zonedParts(clock, departureZone).date : localIsoDate(0);
  const earliestArrival = form.startDate ? new Date(Date.parse(`${form.startDate}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : localIsoDate(-1);
  const availableZones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const ambiguousTimes = flightTimes({ ...form, departureUtc: undefined, arrivalUtc: undefined });
  const nextChecklistItem = selectedChecklistItems.find(item => !item.completed);
  const selectedClosed = selectedTrip?.status === "completed" || selectedTrip?.status === "cancelled";

  async function applyTicket(fields: TicketFields) {
    const session = captureSession();
    if (!session || busy) return;
    setBusy("ticket"); setError("");
    const exact = async (code: string) => code ? (await searchAirports(code)).find(airport => airport.iata === code) || null : null;
    try {
      const [origin, destination] = await Promise.all([exact(fields.originIata).catch(() => null), exact(fields.destinationIata).catch(() => null)]);
      if (!isCurrentSession(session)) return;
      setForm(current => {
        const base = clearProviderForm(current);
        return { ...base, mode: "flight", flightNumber: fields.flightNumber || base.flightNumber, startDate: fields.departureDate || base.startDate,
          flightPnr: fields.flightPnr || base.flightPnr, originAirport: origin || base.originAirport, airport: destination || base.airport,
          destinationCity: destination?.city || base.destinationCity, destinationCountry: destination?.country || base.destinationCountry,
          destinationCode: destination?.countryCode || base.destinationCode, departureTime: fields.departureTime || base.departureTime,
          arrivalDate: fields.arrivalDate || base.arrivalDate, arrivalTime: fields.arrivalTime || base.arrivalTime,
          departureUtc: undefined, arrivalUtc: undefined };
      });
      setMatchedFlight(null); setManualFlight(true); setEditTicket(false);
      onNotice(copy("Onayladığın bilgiler aktarıldı. Yalnız eksik alanları tamamla.", "Your confirmed details are ready. Complete only the missing fields."));
      if (fields.originIata && !origin || fields.destinationIata && !destination) setError(copy("Havalimanı doğrulanamadı; aşağıdaki listeden seç. Diğer bilgiler duruyor.", "An airport could not be verified; select it from the list below. Your other details are kept."));
    } finally { if (isCurrentSession(session)) setBusy(""); }
  }

  const createTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const session = captureSession();
    if (!session || busy || loading || pendingCreate.current?.userId === session.userId) return;
    if (matchedFlight && !matchedFlight.progress && Date.parse(matchedFlight.departureAt) <= Date.now()) {
      setError(pastDepartureMessage);
      return;
    }
    if (matchedFlight && !canSaveFlightSelection(matchedFlight)) {
      setError(matchedFlight.maySave ? copy("Uçuş seçiminin kayıt süresi doldu. Yeniden arayıp seç.", "This flight selection has expired. Search and select it again.")
        : lookupMode === "trial" ? copy("Uçuş arama denemesi: sonuçlar görüntülenir, kokpite kaydedilemez.", "Flight lookup trial: results can be viewed but cannot be saved to Cockpit.")
        : copy("Bu bilgi şu an yalnız görüntülenebilir. Yeniden ara veya biletinle devam et.", "These details are currently view-only. Search again or continue with your ticket."));
      return;
    }
    if (form.mode === "flight" && !manualFlight && !matchedFlight) return;
    const validation = matchedFlight ? !form.endDate || form.endDate < [matchedFlight.departureDate, matchedFlight.arrivalDate].sort().at(-1)!
      ? copy("Varıştan önce olmayan bir seyahat bitiş tarihi seç.", "Choose a trip end date on or after arrival.") : form.flightPnr && !/^[A-Z0-9-]{3,20}$/.test(form.flightPnr)
        ? copy("PNR 3–20 harf, rakam veya tire içerebilir.", "PNR must contain 3–20 letters, numbers or hyphens.") : ""
      : tripFormError(form, new Date(), locale);
    if (validation) {
      setError(validation);
      return;
    }

    pendingCreate.current = session;
    setBusy("create");
    setError("");
    try {
      let departureAt: string | null = null;
      let arrivalAt: string | null = null;
      if (form.mode === "flight" && !matchedFlight) {
        const times = flightTimes(form);
        if (times.departure.ok === false || times.arrival.ok === false) throw new Error("invalid flight time");
        departureAt = times.departure.iso;
        arrivalAt = times.arrival.iso;
      }
      const created = await createCockpitTrip(session.userId, {
        ...(matchedFlight ? { flightSelectionReceipt: matchedFlight.receipt! } : {}),
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
      setMatchedFlight(null);
      setManualFlight(false);
      setFormOpen(false);
      onNotice(copy("Seyahatin kokpite eklendi.", "Your trip was added to the cockpit."));
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      setError(getSupabaseDataErrorMessage(requestError, copy("Seyahat kaydedilemedi. Bilgileri kontrol edip tekrar dene.", "The trip could not be saved. Check the details and try again.")));
    } finally {
      if (pendingCreate.current === session) pendingCreate.current = null;
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
      onNotice(copy(`Seyahat durumu “${statusLabel}” olarak güncellendi.`, `Trip status updated to “${statusLabel}”.`, `Statusi i udhëtimit u përditësua në “${statusLabel}”.`));
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      const message = getSupabaseDataErrorMessage(requestError, copy("Seyahat durumu güncellenemedi.", "Trip status could not be updated."));
      await load();
      if (isCurrentSession(session)) setError(message);
    } finally {
      if (isCurrentSession(session)) setBusy("");
    }
  };

  const refreshFlight = async (trip: CockpitTrip, options: { automatic?: boolean; signal?: AbortSignal } = {}) => {
    const session = captureSession();
    if (!session || busy || pendingRefresh.current || !trip.flightLookupManaged || (refreshAfter[trip.id] || 0) > Date.now() || options.signal?.aborted) return;
    const operation = {}; pendingRefresh.current = operation; setBusy(`refresh-${trip.id}`); setError("");
    try {
      const result = await refreshCockpitFlight(session.userId, trip.id, session.accessToken, options.signal);
      if (!isCurrentSession(session) || options.signal?.aborted) return;
      const next = replaceTrip(trips, result.trip);
      setTrips(next); syncRemindersForSession(session, next);
      setRefreshAfter(current => ({ ...current, [trip.id]: Date.now() + Math.max(options.automatic ? 600 : 300, result.refreshAfterSeconds) * 1000 }));
      if (!options.automatic) onNotice(result.trip.providerFlight ? copy("Uçuş bilgileri güncellendi.", "Flight details updated.") : copy("Bu uçuş için etkin takip bilgisi kaldırıldı. Hazırlık listen duruyor.", "Active flight details were removed. Your checklist is kept."));
    } catch (failure) {
      if (!isCurrentSession(session) || options.signal?.aborted) return;
      const limited = typeof failure === "object" && failure !== null && "status" in failure && failure.status === 429;
      if (limited) setAutoRefreshStopped(true);
      setRefreshAfter(current => ({ ...current, [trip.id]: Date.now() + 600000 }));
      setError(limited ? copy("Uçuş güncelleme sınırına ulaşıldı. Otomatik yenileme durdu; daha sonra tekrar dene.", "Flight update limit reached. Automatic updates stopped; try again later.") : copy("Uçuş bilgisi yenilenemedi. Son alınan bilgi duruyor; biraz sonra tekrar dene.", "Flight details could not be refreshed. The last retrieved details are kept; try again shortly."));
    } finally { if (pendingRefresh.current === operation) { pendingRefresh.current = null; if (isCurrentSession(session)) setBusy(""); } }
  };
  useLayoutEffect(() => { autoRefresh.current = (trip, signal) => { void refreshFlight(trip, { automatic: true, signal }); }; });
  // Refresh can repair near-expiry data before it qualifies for native display.
  const autoFlight = selectedTrip?.providerFlight?.nativeDisplayAllowed === true ? parseFlightMatch(selectedTrip.providerFlight) : null;
  const autoTrip = selectedTrip?.flightLookupManaged && !selectedClosed && autoFlight?.progress && activeFlightExpiry(selectedTrip.flightLookupExpiresAt, autoFlight.fetchedAt) ? selectedTrip : null;
  const autoDue = autoTrip ? Math.max(Date.parse(autoTrip.providerFlight!.fetchedAt) + 300000, refreshAfter[autoTrip.id] || 0) : 0;
  useEffect(() => {
    if (!autoTrip || autoRefreshStopped || !activeFlightExpiry(autoTrip.flightLookupExpiresAt, autoTrip.providerFlight!.fetchedAt)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    const stop = () => { clearTimeout(timer); controller?.abort(); };
    const visible = () => document.visibilityState !== "hidden" && navigator.onLine !== false;
    const run = () => {
      if (!visible()) return;
      controller = new AbortController(); autoRefresh.current(autoTrip, controller.signal);
      timer = setTimeout(run, 600000);
    };
    const schedule = () => { stop(); if (visible()) timer = setTimeout(run, Math.max(0, autoDue - Date.now())); };
    schedule();
    document.addEventListener("visibilitychange", schedule); window.addEventListener("online", schedule); window.addEventListener("offline", schedule);
    return () => { stop(); document.removeEventListener("visibilitychange", schedule); window.removeEventListener("online", schedule); window.removeEventListener("offline", schedule); };
  }, [autoTrip, autoDue, autoRefreshStopped, accessToken, userId]);

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
      return true;
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
    const submittedDraft = newChecklistLabel;
    void persistChecklist(selectedTrip, next, copy("Kontrol listesine yeni madde eklendi.", "A new checklist item was added.")).then(saved => {
      if (saved) setNewChecklistLabel(current => current === submittedDraft ? "" : current);
    });
  };

  const removeTripEvent = (trip: CockpitTrip, itemId: string) => {
    if (busy || loading) return;
    const item = trip.checklistItems.find((candidate) => candidate.id === itemId && candidate.kind === "event");
    if (!item || !window.confirm(copy(`“${item.label}” etkinliğini bu seyahatten çıkar?`, `Remove “${item.label}” from this trip?`, `Të hiqet aktiviteti “${item.label}” nga ky udhëtim?`))) return;
    void persistChecklist(
      trip,
      trip.checklistItems.filter((candidate) => candidate.id !== itemId),
      copy("Etkinlik seyahatten çıkarıldı.", "Event removed from the trip."),
    );
  };

  const removeTrip = async () => {
    if (!deleteTarget || busy || loading || pendingDelete.current || !isCurrentSession(deleteTarget.session)) return;
    const { trip, session } = deleteTarget;
    if (trip.userId !== session.userId) return;
    pendingDelete.current = session;
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
      setDeleteTarget(null);
      onNotice(copy("Seyahat kokpitten silindi.", "The trip was removed from your cockpit."));
    } catch (requestError) {
      if (!isCurrentSession(session)) return;
      const message = getSupabaseDataErrorMessage(requestError, copy("Seyahat silinemedi.", "The trip could not be deleted."));
      await load();
      if (isCurrentSession(session)) { setDeleteTarget(null); setError(message); }
    } finally {
      if (pendingDelete.current === session) pendingDelete.current = null;
      if (isCurrentSession(session)) setBusy("");
    }
  };

  const saveTripEdits = async (trip: CockpitTrip, update: UpdateCockpitTripInput) => {
    const session = captureSession();
    if (!session || busy || loading || editConflict || trip.userId !== session.userId) return false;
    setBusy(`edit-${trip.id}`); setEditError("");
    try {
      const updated = await updateCockpitTrip(session.userId, trip.id, update, session.accessToken, trip.updatedAt);
      if (!isCurrentSession(session)) return false;
      const next = replaceTrip(trips, updated);
      setTrips(next); syncRemindersForSession(session, next);
      onNotice(copy("Seyahat güncellendi.", "Trip updated.", "Udhëtimi u përditësua."));
      return true;
    } catch (requestError) {
      if (!isCurrentSession(session)) return false;
      if ((requestError as { status?: number })?.status === 409) setEditConflict(true);
      setEditError(getSupabaseDataErrorMessage(requestError, copy("Değişiklikler kaydedilemedi. Yazdıkların korunuyor.", "Changes could not be saved. Your draft is kept.", "Ndryshimet nuk u ruajtën. Shkrimi yt është ruajtur.")));
      return false;
    } finally { if (isCurrentSession(session)) setBusy(""); }
  };

  const reloadTripForEdit = async (trip: CockpitTrip): Promise<CockpitTrip | null> => {
    const session = captureSession();
    if (!session || busy || loading || trip.userId !== session.userId) return null;
    setBusy(`edit-reload-${trip.id}`); setEditError("");
    try {
      const current = await listCockpitTrips(session.userId, session.accessToken, true, true);
      if (!isCurrentSession(session)) return null;
      const latest = current.find(item => item.id === trip.id);
      if (!latest) {
        setEditError(copy("Bu seyahat artık bulunamıyor. Taslağın burada duruyor; silinen kaydın üzerine yazılmayacak.", "This trip no longer exists. Your draft is kept here; the deleted record will not be recreated.", "Ky udhëtim nuk ekziston më. Shkrimi yt ruhet këtu; regjistrimi i fshirë nuk do të rikrijohet."));
        return null;
      }
      setTrips(current); syncRemindersForSession(session, current);
      setEditingTrip(latest); setEditConflict(false);
      return latest;
    } catch (requestError) {
      if (isCurrentSession(session)) setEditError(getSupabaseDataErrorMessage(requestError, copy("Güncel kayıt yüklenemedi. Yazdıkların korunuyor.", "The latest record could not be loaded. Your edits are kept.", "Regjistrimi i fundit nuk u ngarkua. Ndryshimet e tua ruhen.")));
      return null;
    } finally { if (isCurrentSession(session)) setBusy(""); }
  };

  if (!user || !accessToken) {
    return <div className="screen cockpit-native-screen">
      <PageHero scene="airport" title={copy("Seyahat Kokpiti", "Travel Cockpit")} subtitle={copy("Kalkıştan varışa, yolculuğun elinin altında.", "Your journey at a glance, from takeoff to arrival.")} />
      <div className="login-required cockpit-auth-state">
        <span><Icon name="lock" size={28} /></span>
        <h2>{copy("Kokpitini açmak için giriş yap", "Sign in to open your cockpit")}</h2>
        <p>{copy("Seyahat tarihlerin ve hazırlık listen yalnızca hesabına bağlı olarak saklanır.", "Your trip dates and checklist are stored securely with your account.")}</p>
        <button className="primary-wide" onClick={onOpenAccount}><Icon name="user" size={18} /> {copy("Giriş yap / hesap aç", "Sign in / create account")}</button>
      </div>
    </div>;
  }

  const prepareJourneyTrip = (intent: CockpitJourneyIntent) => {
    if (!validJourneyIntent(intent, userId) || busy || loading) return;
    const country = journeyCountry(intent);
    setForm({ ...EMPTY_FORM, mode: "other", countryAlpha3: country?.alpha3 || "", destinationCode: country ? alpha2FromAlpha3(country.alpha3) : "",
      destinationCountry: country ? countryName(country.alpha3, country.name) : "", destinationCity: (intent.kind === "saved-route" ? intent.route.cityOrRegion : intent.city) || "",
      startDate: intent.kind === "saved-route" ? intent.dates?.startDate || "" : "", endDate: intent.kind === "saved-route" ? intent.dates?.endDate || "" : "" });
    setMatchedFlight(null); setManualFlight(false); setFormOpen(true); setError("");
    window.requestAnimationFrame(() => document.getElementById("cockpit-trip-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return <div className="screen cockpit-native-screen">
    <PageHero scene="airport" title={copy("Seyahat Kokpiti", "Travel Cockpit")} subtitle={copy("Kalkıştan varışa, yolculuğun elinin altında.", "Your journey at a glance, from takeoff to arrival.")} />

    <div className="cockpit-native-toolbar">
      <button className="primary-button" aria-expanded={formOpen} aria-controls="cockpit-trip-form" disabled={Boolean(busy) || loading} onClick={() => { setFormOpen((open) => !open); setError(""); }}>
        <Icon name={formOpen ? "close" : "plus"} size={18} /> {formOpen ? copy("Kapat", "Close") : copy("Seyahat ekle", "Add trip")}
      </button>
      <button className="secondary-button icon-only" aria-label={copy("Listeyi yenile", "Refresh list")} disabled={loading || Boolean(busy)} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />}
      </button>
    </div>

    <CockpitJourneySection ownerId={userId} accessToken={accessToken} trips={trips} selectedTrip={selectedTrip} intent={journeyIntent} onSelectTrip={setSelectedTripId} onCreateTrip={prepareJourneyTrip} onHandled={() => onJourneyHandled?.()} onRefreshTrips={load}/>

    {formOpen && <form id="cockpit-trip-form" className="form-card cockpit-trip-form" onSubmit={createTrip}>
      <ol className="cockpit-journey-steps" aria-label={copy("Seyahat ekleme adımları", "Add a trip steps")}><li className={!matchedFlight && !manualFlight ? "current" : "done"}>1 · {copy("Uçuşunu bul", "Find your flight")}</li><li className={matchedFlight || manualFlight || form.mode === "other" ? "current" : ""}>2 · {copy("Doğrula ve tamamla", "Review and complete")}</li><li>3 · {copy("Yolculuğun hazır", "Your trip is ready")}</li></ol>
      <div className="cockpit-mode-tabs" role="group" aria-label={copy("Seyahat türü", "Trip type")}>
        <button type="button" aria-pressed={form.mode === "flight"} className={form.mode === "flight" ? "active" : ""} onClick={() => { if (form.mode === "flight") return; setForm({ ...EMPTY_FORM, mode: "flight" }); setMatchedFlight(null); setManualFlight(false); }}><Icon name="plane" size={16} /> {copy("Uçuşlu", "Flight")}</button>
        <button type="button" aria-pressed={form.mode === "other"} className={form.mode === "other" ? "active" : ""} onClick={() => { if (form.mode === "other") return; setForm({ ...EMPTY_FORM, mode: "other" }); setMatchedFlight(null); setManualFlight(false); }}><Icon name="suitcase" size={16} /> {copy("Uçuşsuz", "No flight")}</button>
      </div>

      {form.mode === "flight" && <CockpitTicketImport key={`ticket-${userId}`} disabled={Boolean(busy)} onConfirm={applyTicket}/>}
      {form.mode === "flight" && <CockpitFlightLookup key={userId} accessToken={accessToken} flightNumber={form.flightNumber} date={form.startDate}
        compact={Boolean(matchedFlight || manualFlight && form.flightNumber && form.startDate)}
        onExpand={() => { if (matchedFlight) setForm(clearProviderForm); setMatchedFlight(null); setManualFlight(false); setError(""); }}
        onQueryChange={(flightNumber, startDate) => {
          setError("");
          if (matchedFlight) { setMatchedFlight(null); setManualFlight(false); setForm({ ...EMPTY_FORM, flightNumber, startDate, endDate: form.endDate, flightPnr: form.flightPnr }); }
          else setForm({ ...form, flightNumber, startDate, departureUtc: undefined });
        }}
        onManual={() => { if (matchedFlight) setForm(clearProviderForm); setMatchedFlight(null); setManualFlight(true); setEditTicket(true); setError(""); }}
        onSelect={(flight, mode) => {
          setMatchedFlight(flight); setLookupMode(mode || "commercial"); setManualFlight(false); setError("");
          setForm({ ...form, originAirport: flight.origin, airport: flight.destination,
            destinationCity: flight.destination.city, destinationCountry: flight.destination.country, destinationCode: flight.destination.countryCode, countryAlpha3: "",
            startDate: flight.departureDate, departureTime: flight.departureTime, departureUtc: flight.departureAt,
            arrivalDate: flight.arrivalDate, arrivalTime: flight.arrivalTime, arrivalUtc: flight.arrivalAt,
            airline: flight.airline, flightNumber: flight.flightNumber });
        }}/>}
      {form.mode === "flight" && matchedFlight && <section className="cockpit-flight-summary" aria-label={copy("Uçuş özeti", "Flight summary")}>
        <header><h3>{matchedFlight.flightNumber}</h3><span>{matchedFlight.airline}</span></header>
        <CockpitFlightDetails flight={matchedFlight} now={clock}/>
        {!matchedFlight.maySave && <p role="status">{lookupMode === "trial" ? copy("Uçuş arama denemesi: sonuçlar görüntülenir, kokpite kaydedilemez.", "Flight lookup trial: results can be viewed but cannot be saved to Cockpit.")
          : copy("Bu sonuç yalnız görüntülenebilir; güncel bilgi için yeniden ara.", "This result is view-only; search again for current details.")}</p>}
        {matchedFlight.maySave && !canSaveFlightSelection(matchedFlight, clock) && <p role="status">{copy("Seçimin güncelliğini yeniden kontrol et; tekrar araman gerekiyor.", "Check this selection again; a new search is needed.")}</p>}
        <details className="cockpit-data-note"><summary>{copy("Bilgiler nasıl kullanılır?", "How are these details used?")}</summary><p>{copy("Bu ekran sürekli canlı takip yapmaz. Sağlayıcı bilgileri süreli saklanır. Cihaz bildirimleri yalnız izin verilen verilerle çalışır; PNR ve hazırlık listen korunur.", "This screen does not track flights continuously. Provider details are temporary. Device notifications only use permitted data; your PNR and checklist are kept.")}</p></details>
        <button className="secondary-button" type="button" onClick={() => { setForm(clearProviderForm); setMatchedFlight(null); setManualFlight(true); setEditTicket(true); }}>{copy("Biletimdeki bilgileri elle gireceğim", "I'll enter my ticket details manually")}</button>
      </section>}
      {manualFlight && !editTicket && <section className="cockpit-confirmed-ticket" aria-label={copy("Onayladığın bilet bilgileri", "Confirmed ticket details")}><h3>{copy("Biletinden aktarıldı", "Imported from your ticket")}</h3><p>{[form.originAirport?.iata, form.airport?.iata].filter(Boolean).join(" → ")}</p><p>{[form.departureTime, form.arrivalDate, form.arrivalTime].filter(Boolean).join(" · ")}</p><small>{copy("Aşağıda yalnız eksik alanlar var.", "Only missing fields appear below.")}</small><button type="button" onClick={() => setEditTicket(true)}>{copy("Aktarılan bilgileri düzenle", "Edit imported details")}</button></section>}
      {(form.mode === "other" || manualFlight) && <div className="cockpit-manual-fields">
      {form.mode === "flight" && (editTicket || !form.originAirport) && (
        <AirportField
          label={copy("Kalkış havalimanı", "Departure airport")}
          required
          value={form.originAirport}
          onChange={(airport) => setForm({ ...form, originAirport: airport, departureUtc: undefined })}
        />
      )}

      {form.mode === "flight" && (editTicket || !form.airport) && (
        <AirportField
          label={copy("Varış havalimanı", "Arrival airport")}
          required
          value={form.airport}
          onChange={(airport) => {
            if (!airport) {
              setForm({ ...form, airport: null, arrivalUtc: undefined });
              return;
            }
            // Havalimanı seçimi ülke, şehir ve ISO kodunu OTOMATİK doldurur.
            setForm({
              ...form,
              airport,
              arrivalUtc: undefined,
              destinationCity: airport.city || form.destinationCity,
              destinationCountry: airport.country,
              destinationCode: airport.countryCode,
              countryAlpha3: "",
            });
          }}
        />
      )}

      {form.mode === "other" && <><CountryPicker
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

      <label>{copy("Şehir (isteğe bağlı)", "City (optional)")}<input value={form.destinationCity} maxLength={100} onChange={(event) => setForm({ ...form, destinationCity: event.target.value })} placeholder={copy("Roma", "Rome")} /></label></>}
      <div className="form-grid two stack-narrow">
        {form.mode === "other" && <DateTimeField type="date" required label={copy("Başlangıç", "Start")} min={earliestStart} max={localIsoDate(730)} value={form.startDate} onChange={(requested) => {
          const next = clampLocalDate(requested, earliestStart, localIsoDate(730));
          setForm({ ...form, startDate: next, endDate: form.endDate && form.endDate < next ? next : form.endDate, arrivalDate: form.arrivalDate || next });
          if (requested && requested !== next) onNotice(copy("Geçmiş bir başlangıç tarihi seçilemez.", "A past start date cannot be selected."));
        }} />}
      </div>
      {form.mode === "flight" && (editTicket || !form.departureTime) && <div className="form-grid two stack-narrow">
        <DateTimeField type="time" required label={copy("Kalkış · havalimanı yerel saati", "Departure · airport local time")} value={form.departureTime} onChange={departureTime => setForm({ ...form, departureTime, departureUtc: undefined })} />
      </div>}
      {form.mode === "flight" && <div className="form-grid two stack-narrow cockpit-arrival-fields">
        {(editTicket || !form.arrivalDate) && <DateTimeField type="date" required label={copy("Planlanan varış tarihi", "Scheduled arrival date")} min={earliestArrival} max={form.endDate || localIsoDate(730)} value={form.arrivalDate} onChange={(requested) => {
          const next = clampLocalDate(requested, earliestArrival, form.endDate || localIsoDate(730));
          setForm({ ...form, arrivalDate: next, arrivalUtc: undefined });
          if (requested && requested !== next) onNotice(copy("Varış tarihi seyahat aralığının dışında olamaz.", "Arrival must stay within the trip dates."));
        }} />}
        {(editTicket || !form.arrivalTime) && <DateTimeField type="time" required label={copy("Varış · havalimanı yerel saati", "Arrival · airport local time")} value={form.arrivalTime} onChange={arrivalTime => setForm({ ...form, arrivalTime, arrivalUtc: undefined })} />}
      </div>}
      {form.mode === "flight" && <div className="form-grid two stack-narrow">
        {(["originAirport", "airport"] as const).map((field, index) => {
          const airport = form[field];
          const zone = index === 0 ? departureZone : arrivalZone;
          const label = index === 0 ? copy("Kalkış saat dilimi", "Departure time zone") : copy("Varış saat dilimi", "Arrival time zone");
          return airport && (editTicket || !zone) && <label key={field}>{label}{airportTimeZone(airport.iata) ? <span>{zone}</span> : <select required value={zone} onChange={event => setForm({ ...form, [field]: { ...airport, timeZone: event.target.value }, [field === "originAirport" ? "departureUtc" : "arrivalUtc"]: undefined })}><option value="">{copy("Biletteki şehrin saat dilimini seç", "Choose the time zone of the ticket city")}</option>{availableZones.map(value => <option key={value} value={value}>{value}</option>)}</select>}</label>;
        })}
      </div>}
      {form.mode === "flight" && !areFlightFieldsSupported() && <p className="form-hint">{copy("Uçuş detayları (IATA/uçuş no) sunucu güncellemesi tamamlanana kadar kaydedilmeyebilir; diğer bilgiler güvenle saklanır.", "Flight details (IATA/flight number) may not save until the server update is complete; other details remain safe.")}</p>}
      {form.mode === "flight" && (["departure", "arrival"] as const).map(field => {
        const result = ambiguousTimes[field];
        const key = field === "departure" ? "departureUtc" : "arrivalUtc";
        return result.ok === false && result.reason === "ambiguous" && <label key={field}>{copy("Saat geri alınıyor: biletteki UTC karşılığını seç", "Clocks go back: choose the UTC time on your ticket")} · {field === "departure" ? copy("Kalkış", "Departure") : copy("Varış", "Arrival")}<select required value={form[key] || ""} onChange={event => setForm({ ...form, [key]: event.target.value })}><option value="">{copy("Seç", "Choose")}</option>{result.candidates?.map(value => <option key={value} value={value}>{value.replace("T", " ").replace(":00.000Z", " UTC")}</option>)}</select></label>;
      })}
      </div>}
      {(form.mode === "other" || manualFlight || matchedFlight?.maySave) && <>
        <DateTimeField type="date" required label={copy("Seyahatin ne zaman bitiyor?", "When does your trip end?")} min={[form.startDate, form.arrivalDate].sort().at(-1) || localIsoDate(0)} max={localIsoDate(730)} value={form.endDate} onChange={endDate => setForm({ ...form, endDate })}/>
        {form.mode === "flight" && <details className="cockpit-optional-details"><summary>{copy("Ek bilgiler · isteğe bağlı", "Extra details · optional")}</summary><div className="form-grid two stack-narrow">
          <label>{copy("PNR · rezervasyon kodu", "PNR · booking reference")}<input value={form.flightPnr} maxLength={20} autoCapitalize="characters" onChange={event => setForm({ ...form, flightPnr: normalizePnr(event.target.value) })} placeholder="ABC123"/></label>
          {!matchedFlight && <label>{copy("Havayolu", "Airline")}<input value={form.airline} maxLength={80} onChange={event => setForm({ ...form, airline: event.target.value })}/></label>}
        </div></details>}
      </>}
      {(form.mode === "other" || manualFlight || matchedFlight?.maySave) && <button className="primary-wide cockpit-submit" disabled={busy === "create" || loading || Boolean(matchedFlight && !canSaveFlightSelection(matchedFlight, clock)) || (form.mode === "flight" && !manualFlight && !matchedFlight)} type="submit">
        {busy === "create" ? <span className="button-loader" /> : <Icon name="plus" size={18} />} {busy === "create" ? copy("Kaydediliyor", "Saving") : copy("Kokpite ekle", "Add to cockpit")}
      </button>}
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
            {tripTitle(displayTrip(trip, clock))}
          </button>)}
        </div>

        {selectedTrip && <article className="cockpit-native-card">
          <header className="cockpit-native-card-head">
            <span className="saved-icon"><Icon name="plane" size={21} /></span>
            <div><small>{selectedTrip.status === "upcoming" ? copy("Yaklaşan", "Upcoming") : selectedTrip.status === "active" ? copy("Devam ediyor", "In progress") : selectedTrip.status === "completed" ? copy("Tamamlandı", "Completed") : copy("İptal edildi", "Cancelled")}</small><h2>{tripTitle(selectedDisplay!)}</h2><p>{formatDate(selectedTrip.startDate, dateLocale)} – {formatDate(selectedTrip.endDate, dateLocale)}</p></div>
            <button disabled={Boolean(busy) || loading} onClick={() => { const session = captureSession(); if (session && selectedTrip.userId === session.userId && !busy && !loading) setDeleteTarget({ trip: selectedTrip, session }); }} aria-label={copy("Seyahati sil", "Delete trip")}><Icon name="trash" size={18} /></button>
          </header>

          <div className="cockpit-native-details">
            <div><span>{copy("Başlangıç", "Start")}</span><strong>{formatDate(selectedTrip.startDate, dateLocale)}</strong></div>
            <div><span>PNR</span><strong>{selectedTrip.flightPnr || copy("Eklenmedi", "Not added")}</strong></div>
            {(selectedDisplay?.originIata || selectedDisplay?.destinationIata) && <div><span>{copy("Rota", "Route")}</span><strong>{selectedDisplay.originIata || "—"} → {selectedDisplay.destinationIata || "—"}</strong></div>}
            {(selectedDisplay?.airline || selectedDisplay?.flightNumber) && <div><span>{copy("Uçuş", "Flight")}</span><strong>{[selectedDisplay.airline, selectedDisplay.flightNumber].filter(Boolean).join(" · ")}</strong></div>}
            {selectedDisplay?.arrivalAt && <div><span>{copy("Planlanan varış", "Scheduled arrival")}</span><strong>{formatAppDate(new Date(selectedDisplay.arrivalAt), dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: airportTimeZone(selectedDisplay.destinationIata || "", selectedDisplay.providerFlight?.destination.timeZone) || "UTC", timeZoneName: "short" })}</strong></div>}
          </div>
          {selectedTrip.providerFlight && selectedDisplay?.arrivalAt && <CockpitFlightDetails flight={selectedTrip.providerFlight} now={clock}/>}
          {autoTrip && <p className="form-hint">{copy("Bu ekran açık ve internete bağlıyken uçuş bilgisi aralıklarla güncellenir.", "Flight details update periodically while this screen is open and online.")}</p>}
          {selectedTrip.flightLookupManaged && !selectedClosed && <button type="button" className="secondary-wide" disabled={Boolean(busy) || loading || (refreshAfter[selectedTrip.id] || 0) > clock} onClick={() => void refreshFlight(selectedTrip)}><Icon name="refresh" size={17}/>{busy === `refresh-${selectedTrip.id}` ? copy("Yenileniyor…", "Refreshing…") : (refreshAfter[selectedTrip.id] || 0) > clock ? copy("Son bilgi alındı · biraz sonra yenilenebilir", "Latest details retrieved · refresh again shortly") : copy("Uçuş bilgisini yenile", "Refresh flight details")}</button>}
          {selectedTrip.flightLookupManaged && (selectedDisplay?.arrivalAt
            ? <p>{copy("Planlanan uçuş verisi", "Scheduled flight data")}: <a href="https://aerodatabox.com/" target="_blank" rel="noopener">AeroDataBox</a>. {copy("Bu ayrıntılar süreli saklanır. Ada desteği veri sağlayıcısının iznine bağlıdır; cihaz bildirimlerine eklenmez.", "These details are temporary. Live Activity depends on provider permission; device notifications do not include them.")}</p>
            : <p role="status">{selectedTrip.status === "completed" || selectedTrip.status === "cancelled"
              ? copy("Seyahat kapandığı için uçuş ayrıntıları kaldırıldı. PNR ve hazırlık listen duruyor.", "Flight details were removed because the trip is closed. Your PNR and checklist are kept.")
              : copy("Uçuş bilgilerini tekrar kontrol et. PNR ve hazırlık listen duruyor.", "Check your flight details again. Your PNR and checklist are kept.")}</p>)}

          {!selectedClosed && <section className="cockpit-next-action"><span><small>{copy("SIRADAKİ ADIM", "NEXT STEP")}</small><strong>{nextChecklistItem ? checklistLabel(nextChecklistItem.label, locale) : copy("Hazırlık listen tamam", "Your checklist is complete")}</strong></span><button type="button" onClick={() => { const target = document.getElementById("cockpit-checklist"); target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); target?.focus({ preventScroll: true }); }}>{copy("Hazırlığa git", "Open checklist")}</button></section>}

          <label className="cockpit-status-field">{copy("Seyahat durumu", "Trip status")}
            <select value={selectedTrip.status} disabled={Boolean(busy) || loading} onChange={(event) => void changeStatus(selectedTrip, event.target.value as TripStatus)}>
              <option value="upcoming">{copy("Yaklaşan", "Upcoming")}</option>
              <option value="active">{copy("Devam ediyor", "In progress")}</option>
              <option value="completed">{copy("Tamamlandı", "Completed")}</option>
              <option value="cancelled">{copy("İptal edildi", "Cancelled")}</option>
            </select>
          </label>

          <PersonalTravelCards ownerId={user?.id} tripId={selectedTrip.id}/>
          <button type="button" className="secondary-wide" disabled={Boolean(busy) || loading} onClick={() => { setEditError(""); setEditConflict(false); setEditingTrip(selectedTrip); }}><Icon name="settings" size={18}/>{copy("Seyahati düzenle", "Edit trip", "Ndrysho udhëtimin")}</button>

          {selectedTripEvents.length > 0 && <section className="cockpit-events-section">
            <div className="section-heading"><div><span>{copy("SEYAHAT TAKVİMİ", "TRIP CALENDAR")}</span><h2>{copy("Eklediğin etkinlikler", "Events in this trip")}</h2></div><small>{selectedTripEvents.length}</small></div>
            <div className="cockpit-event-list">{selectedTripEvents.map((item) => <article key={item.id}>
              <span className="cockpit-event-date"><strong>{eventDateLabel({ startsAt: item.eventStartsAt || item.createdAt, localDate: item.eventLocalDate, timeZone: item.eventTimeZone }, dateLocale, { day: "2-digit" }, formatAppDate)}</strong><small>{eventDateLabel({ startsAt: item.eventStartsAt || item.createdAt, localDate: item.eventLocalDate, timeZone: item.eventTimeZone }, dateLocale, { month: "short" }, formatAppDate)}</small></span>
              <button type="button" className="cockpit-event-open" disabled={!item.eventSourceUrl} onClick={() => item.eventSourceUrl && void openExternal(item.eventSourceUrl)}><small>{[item.eventCity, item.eventVenue].filter(Boolean).join(" · ") || copy("Etkinlik", "Event")}</small><strong>{item.label}</strong><em>{eventTimeLabel({ startsAt: item.eventStartsAt || item.createdAt, timeZone: item.eventTimeZone, timePrecision: item.eventTimePrecision }, dateLocale, formatAppDate)}</em></button>
              <button type="button" className="cockpit-event-remove" disabled={Boolean(busy) || loading} aria-label={copy("Etkinliği seyahatten çıkar", "Remove event from trip")} onClick={() => removeTripEvent(selectedTrip, item.id)}><Icon name="trash" size={17} /></button>
            </article>)}</div>
          </section>}

          <section id="cockpit-checklist" tabIndex={-1} className="cockpit-checklist-section">
            <div className="section-heading"><div><span>{copy("HAZIRLIK", "PREPARATION")}</span><h2>{copy("Kontrol listesi", "Checklist")}</h2></div><small>{selectedChecklistItems.filter((item) => item.completed).length}/{selectedChecklistItems.length}</small></div>
            <progress value={selectedChecklistItems.filter((item) => item.completed).length} max={Math.max(1, selectedChecklistItems.length)} aria-label={copy("Hazırlık ilerlemesi", "Preparation progress")} />
            <div className="cockpit-checklist-list">
              {selectedChecklistItems.map((item) => <button type="button" key={item.id} className={item.completed ? "completed" : ""} aria-pressed={item.completed} aria-label={`${checklistLabel(item.label, locale)}: ${item.completed ? copy("tamamlandı", "complete") : copy("tamamlanmadı", "incomplete")}`} disabled={Boolean(busy) || loading} onClick={() => toggleChecklistItem(selectedTrip, item.id)}>
                <span><Icon name={item.completed ? "check" : "plus"} size={17} /></span><strong>{checklistLabel(item.label, locale)}</strong><small>{item.category === "documents" ? copy("Belge", "Documents") : item.category === "health" ? copy("Sağlık", "Health") : item.category === "technology" ? copy("Teknoloji", "Technology") : item.category === "luggage" ? copy("Bavul", "Luggage") : copy("Diğer", "Other")}</small>
              </button>)}
              {!selectedChecklistItems.length && <div className="empty-inline"><Icon name="info" size={19} /><div><strong>{copy("Liste boş", "The list is empty")}</strong><span>{copy("Aşağıdan ilk hazırlık maddeni ekleyebilirsin.", "Add your first preparation item below.")}</span></div></div>}
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
      <Sheet open={!!deleteTarget} title={copy("Seyahati sil", "Delete trip", "Fshi udhëtimin")} dismissible={!busy} onClose={() => { if (!busy) setDeleteTarget(null); }}>
        {deleteTarget && <><p>{copy(`${tripTitle(deleteTarget.trip)} seyahatini kalıcı olarak silmek istiyor musun?`, `Permanently delete the ${tripTitle(deleteTarget.trip)} trip?`, `Dëshiron ta fshish përgjithmonë udhëtimin ${tripTitle(deleteTarget.trip)}?`)}</p>
          <p>{copy("Seyahate bağlı rota, bütçe ve hazırlık listesi de kaldırılır. Bu işlem geri alınamaz.", "The trip's attached route, budget and checklist are also removed. This cannot be undone.", "Hiqen edhe itinerari, buxheti dhe lista e përgatitjeve të udhëtimit. Ky veprim nuk zhbëhet.")}</p>
          <button type="button" className="secondary-wide" disabled={!!busy} onClick={() => setDeleteTarget(null)}>{copy("Vazgeç", "Cancel", "Anulo")}</button>
          <button type="button" className="primary-wide" disabled={!!busy || loading} onClick={() => void removeTrip()}>{busy === `delete-${deleteTarget.trip.id}` ? copy("Siliniyor…", "Deleting…", "Po fshihet…") : copy("Evet, seyahati sil", "Yes, delete trip", "Po, fshi udhëtimin")}</button>
        </>}
      </Sheet>
      {editingTrip && <CockpitTripEditor key={editingTrip.id} trip={editingTrip} busy={Boolean(busy)} error={editError} conflict={editConflict} onReload={reloadTripForEdit} onSave={saveTripEdits} onClose={() => setEditingTrip(null)}/>}
  </div>;
}
