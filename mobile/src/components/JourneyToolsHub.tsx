import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { CountryFlag } from "./CountryFlag";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { COUNTRY_LIST } from "../data/countries";
import type { TravelEssentialProfile } from "../data/travelEssentials";
import type { AirportOption } from "../lib/airports";
import { localIsoDate } from "../lib/dates";
import { createId } from "../lib/id";
import { useI18n } from "../lib/i18n";
import { shareContent } from "../lib/native";
import { getVisitedCountries } from "../lib/storage";
import { deleteUserTrip, listCockpitTrips, upsertUserTrip, type CockpitTrip, type UserTripData } from "../lib/supabaseData";
import type { AuthUser, ViewId } from "../types";

const PassportWorldMap = lazy(() => import("./PassportWorldMap").then((module) => ({ default: module.PassportWorldMap })));
const AirportField = lazy(() => import("./AirportField").then((module) => ({ default: module.AirportField })));

type ToolId = "journal" | "map" | "airport" | "safety" | "summary";

type JournalEntry = {
  id: string;
  remoteId?: number | string;
  title: string;
  note: string;
  place: string;
  countryCode: string;
  entryDate: string;
  mood: string;
};

const LOCAL_JOURNAL_KEY = "l2t.mobile.travel-journal.v1";

const tools: Array<{ id: ToolId; icon: IconName; tr: string; en: string; detailTr: string; detailEn: string }> = [
  { id: "journal", icon: "plans", tr: "Seyahat günlüğüm", en: "Travel journal", detailTr: "Anılarını ve notlarını sakla", detailEn: "Save memories and notes" },
  { id: "map", icon: "globe", tr: "Dünya haritam", en: "My world map", detailTr: "Gezdiğin ülkeleri tek haritada gör", detailEn: "See visited countries on one map" },
  { id: "airport", icon: "plane", tr: "Aktarma yardımcısı", en: "Transfer assistant", detailTr: "Süreni ve aktarma adımlarını kontrol et", detailEn: "Check timing and transfer steps" },
  { id: "safety", icon: "shield", tr: "Güvenli seyahat", en: "Travel safety", detailTr: "Acil numaralar ve çevrimdışı plan", detailEn: "Emergency numbers and offline plan" },
  { id: "summary", icon: "sparkles", tr: "Yıllık seyahat özetim", en: "Year in travel", detailTr: "Bu yılın rotalarını ve anılarını gör", detailEn: "Review this year's routes and memories" },
];

const emergencyNumbers: Record<string, { general: string; police?: string; ambulance?: string }> = {
  TR: { general: "112" }, XK: { general: "112", police: "192", ambulance: "194" }, AL: { general: "112", police: "129", ambulance: "127" },
  AE: { general: "999", police: "999", ambulance: "998" }, GB: { general: "999 / 112" }, US: { general: "911" }, CA: { general: "911" },
  JP: { general: "110 / 119", police: "110", ambulance: "119" }, TH: { general: "191", police: "191", ambulance: "1669" },
  DE: { general: "112", police: "110", ambulance: "112" }, FR: { general: "112", police: "17", ambulance: "15" }, IT: { general: "112" }, ES: { general: "112" },
};

function safeEntries(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Partial<JournalEntry>;
    if (!row.id || !row.title || !row.entryDate) return [];
    return [{
      id: String(row.id).slice(0, 160), remoteId: row.remoteId, title: String(row.title).slice(0, 120), note: String(row.note || "").slice(0, 1200),
      place: String(row.place || "").slice(0, 120), countryCode: String(row.countryCode || "").slice(0, 2).toUpperCase(), entryDate: String(row.entryDate).slice(0, 10), mood: String(row.mood || "✨").slice(0, 4),
    }];
  });
}

function localJournalKey(ownerId?: string | null) {
  return `${LOCAL_JOURNAL_KEY}:${ownerId || "guest"}`;
}

function loadLocalJournal(ownerId?: string | null) {
  try { return safeEntries(JSON.parse(localStorage.getItem(localJournalKey(ownerId)) || "[]")); } catch { return []; }
}

function saveLocalJournal(ownerId: string | null | undefined, entries: JournalEntry[]) {
  try {
    localStorage.setItem(localJournalKey(ownerId), JSON.stringify(entries.slice(0, 150)));
    return true;
  } catch {
    return false;
  }
}

function remoteJournal(item: UserTripData): JournalEntry | null {
  const data = item.tripData;
  const title = String(data.title || item.title || "").trim();
  const entryDate = String(data.entry_date || item.createdAt.slice(0, 10));
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return null;
  return {
    id: item.clientKey || `journal-${item.id}`,
    remoteId: item.id,
    title: title.slice(0, 120),
    note: String(data.note || "").slice(0, 1200),
    place: String(data.place || item.destination || "").slice(0, 120),
    countryCode: String(data.country_code || "").slice(0, 2).toUpperCase(),
    entryDate,
    mood: String(data.mood || "✨").slice(0, 4),
  };
}

function journalPayload(entry: JournalEntry, fallbackTitle: string) {
  return {
    title: entry.title,
    destination: entry.place || fallbackTitle,
    mobileKind: "travel_journal" as const,
    clientKey: entry.id,
    tripData: {
      title: entry.title,
      note: entry.note,
      entry_date: entry.entryDate,
      mood: entry.mood,
      place: entry.place,
      country_code: entry.countryCode,
    },
  };
}

function tripLabel(trip: CockpitTrip) {
  return [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ");
}

function daysBetween(start: string, end: string) {
  const difference = Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`);
  return Math.max(1, Math.round(difference / 86_400_000) + 1);
}

export function JourneyToolsHub({ user, ownerId, accessToken, cloudItems, cloudLoading, onNavigate, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  cloudItems: UserTripData[];
  cloudLoading: boolean;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { copy, locale, countryName, dateLocale } = useI18n();
  const [active, setActive] = useState<ToolId | null>(null);
  const [trips, setTrips] = useState<CockpitTrip[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadLocalJournal(ownerId));
  const [busy, setBusy] = useState("");
  const [journalTitle, setJournalTitle] = useState("");
  const [journalNote, setJournalNote] = useState("");
  const [journalDate, setJournalDate] = useState(() => localIsoDate(0));
  const [journalTripId, setJournalTripId] = useState("");
  const [mood, setMood] = useState("✨");
  const [selectedMapCountry, setSelectedMapCountry] = useState<string | null>(null);
  const [transferAirport, setTransferAirport] = useState<AirportOption | null>(null);
  const [transferMinutes, setTransferMinutes] = useState("120");
  const [checkedBag, setCheckedBag] = useState(false);
  const [safetyTripId, setSafetyTripId] = useState("");
  const [essential, setEssential] = useState<TravelEssentialProfile | null>(null);
  const visited = useMemo(() => getVisitedCountries(ownerId), [ownerId, active]);
  const visitedCodes = useMemo(() => new Set(visited.map((item) => item.alpha3)), [visited]);

  useEffect(() => {
    setJournal(loadLocalJournal(ownerId));
  }, [ownerId]);

  useEffect(() => {
    let live = true;
    if (!user || !accessToken) {
      setTrips([]);
      return () => { live = false; };
    }
    void listCockpitTrips(user.id, accessToken, true)
      .then((nextTrips) => { if (live) setTrips(nextTrips); })
      .catch(() => { if (live) onNotice(copy("Seyahat kayıtları şu an alınamadı; araçları cihazındaki verilerle kullanabilirsin.", "Trip records are unavailable right now; you can still use the tools with on-device data.")); });
    return () => { live = false; };
  }, [accessToken, copy, onNotice, user]);

  useEffect(() => {
    if (cloudLoading) return;
    let live = true;
    const remoteEntries = cloudItems
      .filter((item) => item.mobileKind === "travel_journal")
      .map(remoteJournal)
      .filter((entry): entry is JournalEntry => Boolean(entry));
    const localEntries = loadLocalJournal(ownerId);
    const merged = [...remoteEntries, ...localEntries.filter((entry) => !remoteEntries.some((remoteEntry) => remoteEntry.id === entry.id))];
    setJournal(merged);
    saveLocalJournal(ownerId, merged);

    if (!user || !accessToken) return () => { live = false; };
    const pending = merged.filter((entry) => entry.remoteId === undefined).slice(0, 25);
    if (!pending.length) return () => { live = false; };

    void Promise.allSettled(pending.map((entry) => upsertUserTrip(user.id, journalPayload(entry, copy("Seyahat günlüğü", "Travel journal")), accessToken)))
      .then((results) => {
        if (!live) return;
        const synced = new Map<string, number | string>();
        results.forEach((result, index) => {
          if (result.status === "fulfilled") synced.set(pending[index].id, result.value.id);
        });
        if (!synced.size) return;
        setJournal((current) => {
          const next = current.map((entry) => synced.has(entry.id) ? { ...entry, remoteId: synced.get(entry.id) } : entry);
          saveLocalJournal(ownerId, next);
          return next;
        });
        onNotice(copy(`${synced.size} bekleyen günlük kaydı hesabınla eşitlendi.`, `${synced.size} pending journal ${synced.size === 1 ? "entry was" : "entries were"} synced to your account.`));
      });
    return () => { live = false; };
  }, [accessToken, cloudItems, cloudLoading, copy, onNotice, ownerId, user]);

  const selectedJournalTrip = trips.find((trip) => trip.id === journalTripId);
  const safetyTrip = trips.find((trip) => trip.id === safetyTripId) || trips.find((trip) => trip.status === "active") || trips[0];
  const selectedEmergency = emergencyNumbers[safetyTrip?.destinationCode || ""] || null;
  useEffect(() => {
    let live = true;
    if (active !== "safety" || !safetyTrip?.destinationCode) {
      setEssential(null);
      return () => { live = false; };
    }
    void import("../data/travelEssentials").then(({ essentialProfile }) => {
      if (live) setEssential(essentialProfile(safetyTrip.destinationCode));
    });
    return () => { live = false; };
  }, [active, safetyTrip?.destinationCode]);
  const year = new Date().getFullYear();
  const yearTrips = trips.filter((trip) => Number(trip.startDate.slice(0, 4)) === year && trip.status !== "cancelled");
  const yearJournal = journal.filter((entry) => Number(entry.entryDate.slice(0, 4)) === year);
  const yearCountries = new Set(yearTrips.map((trip) => trip.destinationCode).filter(Boolean));
  const travelDays = yearTrips.reduce((sum, trip) => sum + daysBetween(trip.startDate, trip.endDate), 0);

  const addJournal = async (event: FormEvent) => {
    event.preventDefault();
    const title = journalTitle.trim();
    const note = journalNote.trim();
    if (title.length < 2 || note.length < 2 || busy) return;
    const id = `journal:${createId()}`;
    const entry: JournalEntry = {
      id, title, note, entryDate: journalDate, mood,
      place: selectedJournalTrip ? tripLabel(selectedJournalTrip) : "",
      countryCode: selectedJournalTrip?.destinationCode || "",
    };
    setBusy("journal");
    let saved = entry;
    let synced = false;
    try {
      if (user && accessToken) {
        const remote = await upsertUserTrip(user.id, journalPayload(entry, copy("Seyahat günlüğü", "Travel journal")), accessToken);
        saved = { ...entry, remoteId: remote.id };
        synced = true;
      }
      const next = [saved, ...journal];
      setJournal(next);
      const stored = saveLocalJournal(ownerId, next);
      setJournalTitle(""); setJournalNote("");
      onNotice(synced ? copy("Anın seyahat günlüğüne eklendi ve hesabınla eşitlendi.", "Memory added and synced to your account.") : stored ? copy("Anın seyahat günlüğüne eklendi.", "Memory added to your travel journal.") : copy("Bu cihazda yeterli saklama alanı olmadığı için anı kaydedilemedi.", "The memory could not be saved because on-device storage is unavailable."));
    } catch {
      const next = [entry, ...journal];
      setJournal(next);
      const stored = saveLocalJournal(ownerId, next);
      setJournalTitle(""); setJournalNote("");
      onNotice(stored ? copy("Anın cihazda güvende; bağlantı gelince eşitleme yeniden denenecek.", "Your memory is safe on this device; sync will retry when the connection returns.") : copy("Anı ne hesabına ne de bu cihaza kaydedilebildi. Bağlantını ve saklama alanını kontrol et.", "The memory could not be saved to your account or this device. Check your connection and storage."));
    } finally { setBusy(""); }
  };

  const removeJournal = async (entry: JournalEntry) => {
    if (busy) return;
    setBusy(`delete-${entry.id}`);
    try {
      if (user && accessToken && entry.remoteId !== undefined) await deleteUserTrip(user.id, entry.remoteId, accessToken);
      const next = journal.filter((item) => item.id !== entry.id);
      setJournal(next);
      const stored = saveLocalJournal(ownerId, next);
      onNotice(stored ? copy("Günlük kaydı silindi.", "Journal entry deleted.") : copy("Kayıt hesaptan silindi ancak cihazdaki liste güncellenemedi.", "The entry was deleted from your account, but the on-device list could not be updated."));
    } catch { onNotice(copy("Günlük kaydı silinemedi.", "Journal entry could not be deleted.")); }
    finally { setBusy(""); }
  };

  const transfer = Math.max(0, Number(transferMinutes) || 0);
  const transferLevel = transfer < (checkedBag ? 120 : 75) ? "risk" : transfer < (checkedBag ? 180 : 120) ? "tight" : "good";
  const selectedMapName = selectedMapCountry ? countryName(selectedMapCountry, COUNTRY_LIST.find((item) => item.alpha3 === selectedMapCountry)?.name || selectedMapCountry) : "";

  const shareYear = async () => {
    const text = copy(`${year} seyahat özetim: ${yearCountries.size} ülke, ${yearTrips.length} seyahat, ${travelDays} gün ve ${yearJournal.length} anı.`, `My ${year} travel recap: ${yearCountries.size} countries, ${yearTrips.length} trips, ${travelDays} days and ${yearJournal.length} memories.`);
    const shared = await shareContent({ title: copy("LetsGo2Travel yıllık özetim", "My LetsGo2Travel year"), text, url: "https://www.letsgo2travel.com.tr" });
    onNotice(shared ? copy("Yıllık özetin paylaşmaya hazır.", "Your yearly recap is ready to share.") : copy("Paylaşım açılamadı.", "Sharing could not be opened."));
  };

  return <section className="journey-tools" aria-labelledby="journey-tools-title">
    <div className="journey-tools-heading"><div><small>{copy("YENİ · SEYAHATİNİN TAMAMI", "NEW · YOUR WHOLE JOURNEY")}</small><h2 id="journey-tools-title">{copy("Seyahat araçlarım", "My travel tools")}</h2><p>{copy("Anından güvenliğine kadar her şey tek yerde; aramana gerek yok.", "Everything from memories to safety in one place—no hunting around.")}</p></div><span><Icon name="sparkles" size={22} /></span></div>
    <div className="journey-tool-grid">{tools.map((tool) => <button type="button" key={tool.id} onClick={() => setActive(tool.id)}><span><Icon name={tool.icon} size={22} /></span><strong>{locale === "tr" ? tool.tr : tool.en}</strong><small>{locale === "tr" ? tool.detailTr : tool.detailEn}</small><Icon name="chevron" size={15} /></button>)}</div>

    <Sheet open={active === "journal"} title={copy("Seyahat günlüğüm", "Travel journal")} size="large" onClose={() => setActive(null)}>
      <div className="journey-sheet-intro"><span>📔</span><div><small>{copy("ANILARIN SENİNLE KALSIN", "KEEP YOUR MEMORIES")}</small><h3>{copy("Bugünden bir şey yaz", "Write something from today")}</h3><p>{copy("Giriş yaptıysan kayıtların hesabınla eşitlenir.", "When signed in, entries sync with your account.")}</p></div></div>
      <form className="journey-journal-form" onSubmit={addJournal}>
        <div className="journey-form-row"><label>{copy("Tarih", "Date")}<input type="date" value={journalDate} max={localIsoDate(0)} onChange={(event) => setJournalDate(event.target.value)} /></label><label>{copy("Hissettiğin", "Mood")}<select value={mood} onChange={(event) => setMood(event.target.value)}><option>✨</option><option>😍</option><option>🌍</option><option>😌</option><option>🔥</option></select></label></div>
        {trips.length > 0 && <label>{copy("Seyahat", "Trip")}<select value={journalTripId} onChange={(event) => setJournalTripId(event.target.value)}><option value="">{copy("Seyahat seçmeden kaydet", "Save without choosing a trip")}</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{tripLabel(trip)}</option>)}</select></label>}
        <label>{copy("Anı başlığı", "Memory title")}<input value={journalTitle} maxLength={120} onChange={(event) => setJournalTitle(event.target.value)} placeholder={copy("Örn. Tiran'daki ilk sabah", "E.g. First morning in Tirana")} /></label>
        <label>{copy("Neyi hatırlamak istiyorsun?", "What do you want to remember?")}<textarea value={journalNote} maxLength={1200} onChange={(event) => setJournalNote(event.target.value)} placeholder={copy("Gördüklerini, hissettiklerini ve küçük ayrıntıları yaz…", "Write what you saw, felt and the little details…")} /></label>
        <button type="submit" disabled={Boolean(busy) || journalTitle.trim().length < 2 || journalNote.trim().length < 2}>{busy === "journal" ? <span className="button-loader dark" /> : <Icon name="plus" size={17} />} {copy("Günlüğe ekle", "Add to journal")}</button>
      </form>
      <div className="journey-journal-list">{journal.map((entry) => <article key={entry.id}><span>{entry.mood}</span><div><small>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${entry.entryDate}T12:00:00`))}{entry.place ? ` · ${entry.place}` : ""}</small><strong>{entry.title}</strong><p>{entry.note}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => void removeJournal(entry)} aria-label={copy("Anıyı sil", "Delete memory")}><Icon name="trash" size={16} /></button></article>)}{!journal.length && <p className="journey-empty">{copy("Henüz bir anı eklemedin. İlk seyahat notun burada görünecek.", "No memories yet. Your first travel note will appear here.")}</p>}</div>
    </Sheet>

    <Sheet open={active === "map"} title={copy("Dünya haritam", "My world map")} size="large" onClose={() => setActive(null)}>
      <div className="journey-map-summary"><span><strong>{visited.length}</strong><small>{copy("ülke", "countries")}</small></span><div><h3>{copy("Ayak izlerin dünyada", "Your footprints around the world")}</h3><p>{copy("Yeşil ülkeler ziyaret ettiklerin. Haritaya dokunup ayrıntıyı gör.", "Green countries are places you've visited. Tap the map for details.")}</p></div></div>
      <Suspense fallback={<div className="journey-map-loading" role="status"><span className="button-loader dark" /> {copy("Harita hazırlanıyor", "Preparing map")}</div>}>
        <PassportWorldMap statusFor={(alpha3) => alpha3 && visitedCodes.has(alpha3) ? "free" : "unknown"} isHighlighted={(alpha3) => Boolean(alpha3 && visitedCodes.has(alpha3))} selectedAlpha3={selectedMapCountry} onSelectCountry={setSelectedMapCountry} />
      </Suspense>
      {selectedMapCountry && <div className="journey-map-selected"><CountryFlag code={selectedMapCountry === "XKK" ? "XK" : alpha2FromAlpha3(selectedMapCountry)} label={selectedMapName} /><div><small>{visitedCodes.has(selectedMapCountry) ? copy("ZİYARET EDİLDİ", "VISITED") : copy("HENÜZ EKLENMEDİ", "NOT ADDED YET")}</small><strong>{selectedMapName}</strong></div></div>}
      <button className="secondary-wide" type="button" onClick={() => { setActive(null); onNavigate("profile"); }}><Icon name="plus" size={17} /> {copy("Gezdiğim ülkeleri düzenle", "Edit visited countries")}</button>
    </Sheet>

    <Sheet open={active === "airport"} title={copy("Havalimanı ve aktarma yardımcısı", "Airport & transfer assistant")} size="large" onClose={() => setActive(null)}>
      <div className="journey-sheet-intro"><span>✈️</span><div><small>{copy("AKTARMANI KAÇIRMA", "MAKE YOUR CONNECTION")}</small><h3>{copy("Aktarma planını kontrol et", "Check your connection plan")}</h3><p>{copy("Son terminal ve kapı bilgisini her zaman havayolundan doğrula.", "Always verify the latest terminal and gate with your airline.")}</p></div></div>
      <div className="transfer-form"><Suspense fallback={<div className="journey-inline-loading" role="status"><span className="button-loader dark" /> {copy("Havalimanları hazırlanıyor", "Preparing airports")}</div>}><AirportField label={copy("Aktarma havalimanı", "Transfer airport")} value={transferAirport} onChange={setTransferAirport} /></Suspense><div className="journey-form-row"><label>{copy("Aktarma süresi (dk)", "Connection time (min)")}<input type="number" min="20" max="1440" value={transferMinutes} onChange={(event) => setTransferMinutes(event.target.value)} /></label><label className="journey-toggle"><span>{copy("Bagajı yeniden vereceğim", "I must recheck baggage")}</span><input type="checkbox" checked={checkedBag} onChange={(event) => setCheckedBag(event.target.checked)} /></label></div></div>
      {transferAirport && <div className={`transfer-result ${transferLevel}`}><span><Icon name={transferLevel === "risk" ? "alert" : transferLevel === "tight" ? "clock" : "check"} size={24} /></span><div><small>{transferAirport.iata} · {transferAirport.city}</small><h3>{transferLevel === "risk" ? copy("Aktarma riski yüksek", "High connection risk") : transferLevel === "tight" ? copy("Aktarma süresi sınırda", "Connection time is tight") : copy("Süren makul görünüyor", "Your connection looks reasonable")}</h3><p>{transferLevel === "risk" ? copy("Terminal değişimi, güvenlik ve bagaj için süre yetmeyebilir. Havayoluyla görüş.", "There may not be enough time for terminals, security and baggage. Contact the airline.") : copy("Yine de kapıya ilerlemeden önce ekranları ve terminali doğrula.", "Still verify displays and terminal before heading to the gate.")}</p></div></div>}
      <ol className="transfer-steps"><li><span>1</span><div><strong>{copy("Uçaktan iner inmez ekranı kontrol et", "Check displays after landing")}</strong><small>{copy("Yeni uçuşunun kapısını ve terminalini doğrula.", "Confirm your next gate and terminal.")}</small></div></li><li><span>2</span><div><strong>{copy("Transfer tabelalarını takip et", "Follow transfer signs")}</strong><small>{copy("Gerekmiyorsa bagaj teslim alanına çıkma.", "Avoid baggage claim unless required.")}</small></div></li><li><span>3</span><div><strong>{copy("Güvenlik ve pasaport süresini hesaba kat", "Allow for security and immigration")}</strong><small>{copy("Uluslararası aktarmalarda ek kontrol olabilir.", "International connections may require extra checks.")}</small></div></li><li><span>4</span><div><strong>{copy("Kapıya erken git", "Reach the gate early")}</strong><small>{copy("Kapı kapanış saati kalkış saatinden erkendir.", "Gate closing time is earlier than departure.")}</small></div></li></ol>
    </Sheet>

    <Sheet open={active === "safety"} title={copy("Güvenli seyahat merkezi", "Travel safety centre")} size="large" onClose={() => setActive(null)}>
      <div className="journey-sheet-intro safety"><span><Icon name="shield" size={28} /></span><div><small>{copy("ÇEVRİMDIŞI DA YANINDA", "READY OFFLINE")}</small><h3>{copy("Acil durumda önce doğru numara", "The right number in an emergency")}</h3><p>{copy("Hayati tehlikede bulunduğun ülkenin resmî acil hattını ara.", "In immediate danger, call the official local emergency service.")}</p></div></div>
      {trips.length > 0 && <label className="safety-trip-select">{copy("Seyahat seç", "Choose trip")}<select value={safetyTrip?.id || ""} onChange={(event) => setSafetyTripId(event.target.value)}>{trips.map((trip) => <option key={trip.id} value={trip.id}>{tripLabel(trip)}</option>)}</select></label>}
      <div className={`emergency-card${selectedEmergency ? "" : " missing"}`}>{safetyTrip ? <CountryFlag code={safetyTrip.destinationCode} label={safetyTrip.destinationCountry} /> : <span className="emergency-placeholder"><Icon name="globe" size={22} /></span>}<div><small>{safetyTrip?.destinationCountry || copy("Önce seyahat ekle", "Add a trip first")}</small>{selectedEmergency ? <><strong>{copy("Genel acil hat", "General emergency")}: {selectedEmergency.general}</strong><p>{selectedEmergency.police ? `${copy("Polis", "Police")}: ${selectedEmergency.police}` : ""}{selectedEmergency.ambulance ? ` · ${copy("Ambulans", "Ambulance")}: ${selectedEmergency.ambulance}` : ""}</p></> : <><strong>{copy("Numarayı resmî kaynaktan doğrula", "Verify the number from an official source")}</strong><p>{copy("Tahmini numara göstermiyoruz; seyahatini seçip resmî kaynaktan doğrula.", "We do not guess emergency numbers; choose your trip and verify an official source.")}</p></>}</div>{selectedEmergency && <a href={`tel:${selectedEmergency.general.split(/[ /]/)[0]}`} aria-label={copy("Acil hattı ara", "Call emergency services")}><Icon name="alert" size={18} /> {copy("Ara", "Call")}</a>}</div>
      <div className="safety-checks"><article><Icon name="check" size={18} /><div><strong>{copy("Pasaport ve poliçe kopyası", "Passport and insurance copies")}</strong><small>{copy("Asıllarından ayrı ve şifreli sakla.", "Keep encrypted copies apart from originals.")}</small></div></article><article><Icon name="check" size={18} /><div><strong>{copy("Yakınına planını bırak", "Share plans with someone")}</strong><small>{copy("Konaklama ve dönüş tarihini güvendiğin biri bilsin.", "Let someone you trust know your stay and return date.")}</small></div></article><article><Icon name="check" size={18} /><div><strong>{copy("Çevrimdışı harita indir", "Download an offline map")}</strong><small>{copy("İnternet olmadan konaklamana dönebil.", "Get back to your accommodation without internet.")}</small></div></article></div>
      {essential?.etiquette?.length ? <div className="safety-local-rules"><small>{copy("YEREL UYARILAR", "LOCAL GUIDANCE")}</small>{essential.etiquette.slice(0, 3).map((rule) => <p key={rule.id}><Icon name={rule.icon} size={16} /> {locale === "tr" ? rule.tr : rule.en}</p>)}</div> : null}
      <p className="journey-legal-note">{copy("Numaralar yardımcı bilgi amaçlıdır; seyahat öncesi resmî kaynaklardan doğrula.", "Numbers are provided as guidance; verify them with official sources before travel.")}</p>
    </Sheet>

    <Sheet open={active === "summary"} title={copy(`${year} seyahat özetim`, `My ${year} travel recap`)} size="large" onClose={() => setActive(null)}>
      <div className="year-recap-hero"><small>LETSGO2TRAVEL · {year}</small><h3>{copy("Bu yıl dünyada bıraktığın iz", "Your footprint around the world")}</h3><p>{copy("Seyahatlerin, uçuşların ve günlüğündeki anılardan hazırlandı.", "Built from your trips, flights and journal memories.")}</p></div>
      <div className="year-recap-stats"><article><strong>{yearCountries.size}</strong><small>{copy("Ülke", "Countries")}</small></article><article><strong>{yearTrips.length}</strong><small>{copy("Seyahat", "Trips")}</small></article><article><strong>{travelDays}</strong><small>{copy("Gün", "Days")}</small></article><article><strong>{yearTrips.filter((trip) => trip.originIata && trip.destinationIata).length}</strong><small>{copy("Uçuş", "Flights")}</small></article></div>
      <div className="year-recap-memory"><span>{yearJournal[0]?.mood || "🌍"}</span><div><small>{copy(`${yearJournal.length} GÜNLÜK ANI`, `${yearJournal.length} JOURNAL MEMORIES`)}</small><strong>{yearJournal[0]?.title || copy("İlk anını eklemeye hazır", "Ready for your first memory")}</strong><p>{yearJournal[0]?.note || copy("Seyahat günlüğüne yazdıkların burada özetlenecek.", "Your journal entries will be highlighted here.")}</p></div></div>
      {yearTrips.length > 0 && <div className="year-route-list">{yearTrips.slice(0, 6).map((trip) => <article key={trip.id}><CountryFlag code={trip.destinationCode} label={trip.destinationCountry} /><div><strong>{tripLabel(trip)}</strong><small>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short" }).format(new Date(`${trip.startDate}T12:00:00`))} · {daysBetween(trip.startDate, trip.endDate)} {copy("gün", "days")}</small></div></article>)}</div>}
      <button className="primary-wide" type="button" onClick={() => void shareYear()}><Icon name="share" size={18} /> {copy("Özetimi paylaş", "Share my recap")}</button>
    </Sheet>
  </section>;
}
