import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { DateTimeField } from "./DateTimeField";
import { CountryPicker } from "./CountryPicker";
import { readJournal, writeJournal, validJournalDraft, type JournalEntry } from "../lib/travelJournal";
import { travelRecap, readSafetyTrips, saveSafetyTrips, type SafetyTrip } from "../lib/journeyTools";
import { CountryFlag } from "./CountryFlag";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { COUNTRY_LIST } from "../data/countries";
import type { TravelEssentialProfile } from "../data/travelEssentials";
import type { AirportOption } from "../lib/airports";
import { isCalendarDate, localIsoDate } from "../lib/dates";
import { createId } from "../lib/id";
import { useI18n } from "../lib/i18n";
import { shareContent } from "../lib/native";
import { getVisitedCountries } from "../lib/storage";
import { listCockpitTrips } from "../lib/supabaseData";
import type { AuthUser, ViewId } from "../types";

const PassportWorldMap = lazy(() => import("./PassportWorldMap").then((module) => ({ default: module.PassportWorldMap })));
const AirportField = lazy(() => import("./AirportField").then((module) => ({ default: module.AirportField })));

type ToolId = "journal" | "map" | "airport" | "safety" | "summary";

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

function tripLabel(trip: SafetyTrip) {
  return [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ");
}

export function JourneyToolsHub({ user, ownerId, accessToken, onNavigate, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { copy, locale, countryName, dateLocale } = useI18n();
  const [active, setActive] = useState<ToolId | null>(null);
  const [trips, setTrips] = useState<SafetyTrip[]>(() => readSafetyTrips(ownerId));
  const [journal, setJournal] = useState<JournalEntry[]>(() => { try { return readJournal(ownerId).entries; } catch { return []; } });
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
  const [separateTickets, setSeparateTickets] = useState(false);
  const [terminalChange, setTerminalChange] = useState(false);
  const [safetyTripId, setSafetyTripId] = useState("");
  const [safetyCountry, setSafetyCountry] = useState("");
  const [essential, setEssential] = useState<TravelEssentialProfile | null>(null);
  const visited = useMemo(() => getVisitedCountries(ownerId), [ownerId, active]);
  const visitedCodes = useMemo(() => new Set(visited.map((item) => item.alpha3)), [visited]);

  useEffect(() => {
    const reload = () => { try { setJournal(readJournal(ownerId).entries); } catch { onNotice(copy("Günlük okunamadı; mevcut kayıtlar değiştirilmedi.", "Journal storage could not be read; existing data was preserved.")); } };
    reload();
    window.addEventListener("l2t:journal-change", reload);
    return () => window.removeEventListener("l2t:journal-change", reload);
  }, [ownerId, copy, onNotice]);

  useEffect(() => {
    let live = true;
    setTrips(readSafetyTrips(ownerId));
    if (!user || !accessToken) {
      setTrips(readSafetyTrips(ownerId));
      return () => { live = false; };
    }
    void listCockpitTrips(user.id, accessToken, true)
      .then((nextTrips) => { if (live) { setTrips(nextTrips); saveSafetyTrips(ownerId,nextTrips); } })
      .catch(() => { if (live) onNotice(copy("Seyahat kayıtları şu an alınamadı; araçları cihazındaki verilerle kullanabilirsin.", "Trip records are unavailable right now; you can still use the tools with on-device data.")); });
    return () => { live = false; };
  }, [accessToken, copy, onNotice, user, ownerId]);

  const selectedJournalTrip = trips.find((trip) => trip.id === journalTripId);
  const safetyTrip = trips.find((trip) => trip.id === safetyTripId) || trips.find((trip) => trip.status === "active") || trips.find((trip) => trip.status !== "cancelled" && trip.endDate >= localIsoDate()) || trips[0];
  const safetyCode = safetyCountry || safetyTrip?.destinationCode || "";
  const safetyOptions = COUNTRY_LIST.map(item => ({code: alpha2FromAlpha3(item.alpha3) || "", name: countryName(item.alpha3,item.name)})).filter(item => item.code);
  const selectedEmergency = emergencyNumbers[safetyCode] || null;
  useEffect(() => {
    let live = true;
    if (active !== "safety" || !safetyCode) {
      setEssential(null);
      return () => { live = false; };
    }
    void import("../data/travelEssentials").then(({ essentialProfile }) => {
      if (live) setEssential(essentialProfile(safetyCode));
    }).catch(() => { if (live) setEssential(null); });
    return () => { live = false; };
  }, [active, safetyCode]);
  const year = new Date().getFullYear();
  const recap = travelRecap(trips, year);
  const yearTrips = recap.trips;
  const yearJournal = journal.filter((entry) => isCalendarDate(entry.entryDate) && Number(entry.entryDate.slice(0,4)) === year);
  const yearCountries = new Set(yearTrips.map((trip) => trip.destinationCode).filter(Boolean));
  const travelDays = recap.days;

  const addJournal = async (event: FormEvent) => {
    event.preventDefault();
    const title = journalTitle.trim();
    const note = journalNote.trim();
    if (!validJournalDraft(title,note,journalDate) || busy) { onNotice(copy("Başlık, not ve geçerli bir tarih gir.", "Enter a title, note and valid date.")); return; }
    const entry: JournalEntry = { id: `journal:${createId()}`,title,note,entryDate:journalDate,mood,
      place: selectedJournalTrip ? tripLabel(selectedJournalTrip) : "", countryCode:selectedJournalTrip?.destinationCode || "" };
    setBusy("journal");
    try {
      const current = readJournal(ownerId);
      writeJournal(ownerId,{ ...current,entries:[entry,...current.entries] });
      setJournalTitle(""); setJournalNote("");
      onNotice(user && accessToken ? copy("Anın cihazına kaydedildi; hesabınla eşitleniyor.", "Saved on this device; syncing to your account.") : copy("Anın bu cihazdaki günlüğüne kaydedildi.", "Saved to the journal on this device."));
    } catch { onNotice(copy("Kayıt yapılamadı. Yazdıkların alanda duruyor; saklama alanını kontrol edip yeniden dene.", "Could not save. Your draft is still here; check device storage and retry.")); }
    finally { setBusy(""); }
  };

  const removeJournal = async (entry: JournalEntry) => {
    if (busy || !window.confirm(copy("Bu anıyı silmek istiyor musun?", "Delete this memory?"))) return;
    try {
      const current = readJournal(ownerId);
      writeJournal(ownerId,{entries:current.entries.filter(item => item.id !== entry.id),deleted:[...current.deleted.filter(item => item.id !== entry.id),{id:entry.id,remoteId:entry.remoteId}]});
      onNotice(copy("Anı silindi; hesap değişikliği bağlantıda tamamlanır.", "Memory deleted; the account change completes when connected."));
    } catch { onNotice(copy("Silme kaydedilemedi; anın korundu.", "Deletion could not be saved; your memory was kept.")); }
  };

  const transfer = Math.max(0, Number(transferMinutes) || 0);
  const extraTransferSteps = checkedBag || separateTickets || terminalChange;
  const transferLevel = transfer < (extraTransferSteps ? 120 : 75) ? "risk" : "tight";
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
        <div className="journey-form-row"><DateTimeField type="date" label={copy("Tarih", "Date")} required value={journalDate} max={localIsoDate(0)} onChange={setJournalDate} /><label>{copy("Hissettiğin", "Mood")}<select value={mood} onChange={(event) => setMood(event.target.value)}><option>✨</option><option>😍</option><option>🌍</option><option>😌</option><option>🔥</option></select></label></div>
        {trips.length > 0 && <label>{copy("Seyahat", "Trip")}<select value={journalTripId} onChange={(event) => setJournalTripId(event.target.value)}><option value="">{copy("Seyahat seçmeden kaydet", "Save without choosing a trip")}</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{tripLabel(trip)}</option>)}</select></label>}
        <label>{copy("Anı başlığı", "Memory title")}<input value={journalTitle} maxLength={120} onChange={(event) => setJournalTitle(event.target.value)} placeholder={copy("Örn. Tiran'daki ilk sabah", "E.g. First morning in Tirana")} /></label>
        <label>{copy("Neyi hatırlamak istiyorsun?", "What do you want to remember?")}<textarea value={journalNote} maxLength={1200} onChange={(event) => setJournalNote(event.target.value)} placeholder={copy("Gördüklerini, hissettiklerini ve küçük ayrıntıları yaz…", "Write what you saw, felt and the little details…")} /></label>
        <button type="submit" disabled={Boolean(busy) || !validJournalDraft(journalTitle,journalNote,journalDate)}>{busy === "journal" ? <span className="button-loader dark" /> : <Icon name="plus" size={17} />} {copy("Günlüğe ekle", "Add to journal")}</button>
      </form>
      <div className="journey-journal-list">{journal.map((entry) => <article key={entry.id}><span>{entry.mood}</span><div><small>{isCalendarDate(entry.entryDate) ? new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${entry.entryDate}T12:00:00`)) : copy("Tarih belirtilmedi", "Date not set")}{entry.place ? ` · ${entry.place}` : ""}</small><strong>{entry.title}</strong><p>{entry.note}</p>{user && entry.remoteId === undefined && <small>{copy("Eşitleme bekliyor", "Waiting to sync")}</small>}</div><button type="button" disabled={Boolean(busy)} onClick={() => void removeJournal(entry)} aria-label={copy("Anıyı sil", "Delete memory")}><Icon name="trash" size={16} /></button></article>)}{!journal.length && <p className="journey-empty">{copy("Henüz bir anı eklemedin. İlk seyahat notun burada görünecek.", "No memories yet. Your first travel note will appear here.")}</p>}</div>
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
      <div className="transfer-form"><Suspense fallback={<div className="journey-inline-loading" role="status"><span className="button-loader dark" /> {copy("Havalimanları hazırlanıyor", "Preparing airports")}</div>}><AirportField label={copy("Aktarma havalimanı", "Transfer airport")} value={transferAirport} onChange={setTransferAirport} /></Suspense><div className="journey-form-row"><label>{copy("Aktarma süresi (dk)", "Connection time (min)")}<input type="number" min="20" max="1440" value={transferMinutes} onChange={(event) => setTransferMinutes(event.target.value)} /></label><label className="journey-toggle"><span>{copy("Bagajı yeniden vereceğim", "I must recheck baggage")}</span><input type="checkbox" checked={checkedBag} onChange={(event) => setCheckedBag(event.target.checked)} /></label></div><label className="journey-toggle"><span>{copy("Biletlerim ayrı rezervasyonlarda", "My flights are on separate bookings")}</span><input type="checkbox" checked={separateTickets} onChange={event => setSeparateTickets(event.target.checked)} /></label><label className="journey-toggle"><span>{copy("Terminal değiştireceğim", "I must change terminals")}</span><input type="checkbox" checked={terminalChange} onChange={event => setTerminalChange(event.target.checked)} /></label></div>
      {transferAirport && <div className={`transfer-result ${transferLevel}`}><span><Icon name={transferLevel === "risk" ? "alert" : "clock"} size={24} /></span><div><small>{transferAirport.iata} · {transferAirport.city}</small><h3>{transferLevel === "risk" ? copy("Aktarma riski yüksek", "High connection risk") : copy("Aktarma koşullarını doğrula", "Confirm your connection requirements")}</h3><p>{transferLevel === "risk" ? copy("Terminal değişimi, güvenlik ve bagaj için süre yetmeyebilir. Havayoluyla görüş.", "There may not be enough time for terminals, security and baggage. Contact the airline.") : copy("Bu kontrol listesi havalimanının minimum aktarma süresini hesaplamaz. Bilet, terminal, bagaj ve pasaport koşullarını havayolunla doğrula.", "This checklist does not calculate the airport’s minimum connection time. Confirm ticket, terminal, baggage and immigration requirements with your airline.")}</p></div></div>}
      <ol className="transfer-steps"><li><span>1</span><div><strong>{copy("Uçaktan iner inmez ekranı kontrol et", "Check displays after landing")}</strong><small>{copy("Yeni uçuşunun kapısını ve terminalini doğrula.", "Confirm your next gate and terminal.")}</small></div></li><li><span>2</span><div><strong>{copy("Transfer tabelalarını takip et", "Follow transfer signs")}</strong><small>{copy("Gerekmiyorsa bagaj teslim alanına çıkma.", "Avoid baggage claim unless required.")}</small></div></li><li><span>3</span><div><strong>{copy("Güvenlik ve pasaport süresini hesaba kat", "Allow for security and immigration")}</strong><small>{copy("Uluslararası aktarmalarda ek kontrol olabilir.", "International connections may require extra checks.")}</small></div></li><li><span>4</span><div><strong>{copy("Kapıya erken git", "Reach the gate early")}</strong><small>{copy("Kapı kapanış saati kalkış saatinden erkendir.", "Gate closing time is earlier than departure.")}</small></div></li></ol>
    </Sheet>

    <Sheet open={active === "safety"} title={copy("Güvenli seyahat merkezi", "Travel safety centre")} size="large" onClose={() => setActive(null)}>
      <div className="journey-sheet-intro safety"><span><Icon name="shield" size={28} /></span><div><small>{copy("ÇEVRİMDIŞI DA YANINDA", "READY OFFLINE")}</small><h3>{copy("Acil durumda önce doğru numara", "The right number in an emergency")}</h3><p>{copy("Hayati tehlikede bulunduğun ülkenin resmî acil hattını ara.", "In immediate danger, call the official local emergency service.")}</p></div></div>
      {trips.length > 0 && <label className="safety-trip-select">{copy("Seyahat seç", "Choose trip")}<select value={safetyTrip?.id || ""} onChange={(event) => { setSafetyTripId(event.target.value); setSafetyCountry(""); }}>{trips.map((trip) => <option key={trip.id} value={trip.id}>{tripLabel(trip)}</option>)}</select></label>}
      <CountryPicker value={safetyCode} options={safetyOptions} label={copy("Bulunduğun ülke", "Your current country")} placeholder={copy("Ülke seç", "Choose country")} onChange={setSafetyCountry} />
      <div className={`emergency-card${selectedEmergency ? "" : " missing"}`}>
        {safetyCode ? <CountryFlag code={safetyCode} label={safetyOptions.find(item => item.code === safetyCode)?.name || safetyCode} /> : <Icon name="globe" size={22} />}
        <div><small>{safetyOptions.find(item => item.code === safetyCode)?.name || copy("Ülke seç", "Choose country")}</small>
          <strong>{selectedEmergency ? copy("Acil numaralar", "Emergency numbers") : copy("Numarayı resmî kaynaktan doğrula", "Verify the number from an official source")}</strong>
          {selectedEmergency && <div className="emergency-call-list">{(selectedEmergency.police && selectedEmergency.ambulance
            ? [{label:copy("Polis", "Police"),number:selectedEmergency.police},{label:copy("Ambulans", "Ambulance"),number:selectedEmergency.ambulance}]
            : [{label:copy("Acil yardım", "Emergency"),number:selectedEmergency.general.split(/[ /]/)[0]}]).map(service => <a key={service.label} href={`tel:${service.number}`} aria-label={`${service.label}: ${service.number}`}><span>{service.label}</span><strong>{service.number}</strong><span>{copy("Ara", "Call")}</span></a>)}</div>}
        </div>
      </div>
      <div className="safety-checks"><article><Icon name="check" size={18} /><div><strong>{copy("Pasaport ve poliçe kopyası", "Passport and insurance copies")}</strong><small>{copy("Asıllarından ayrı ve şifreli sakla.", "Keep encrypted copies apart from originals.")}</small></div></article><article><Icon name="check" size={18} /><div><strong>{copy("Yakınına planını bırak", "Share plans with someone")}</strong><small>{copy("Konaklama ve dönüş tarihini güvendiğin biri bilsin.", "Let someone you trust know your stay and return date.")}</small></div></article><article><Icon name="check" size={18} /><div><strong>{copy("Çevrimdışı harita indir", "Download an offline map")}</strong><small>{copy("İnternet olmadan konaklamana dönebil.", "Get back to your accommodation without internet.")}</small></div></article></div>
      {essential?.etiquette?.length ? <div className="safety-local-rules"><small>{copy("YEREL UYARILAR", "LOCAL GUIDANCE")}</small>{essential.etiquette.slice(0, 3).map((rule) => <p key={rule.id}><Icon name={rule.icon} size={16} /> {locale === "tr" ? rule.tr : rule.en}</p>)}</div> : null}
      <p className="journey-legal-note">{copy("Numaralar yardımcı bilgi amaçlıdır; seyahat öncesi resmî kaynaklardan doğrula.", "Numbers are provided as guidance; verify them with official sources before travel.")}</p>
    </Sheet>

    <Sheet open={active === "summary"} title={copy(`${year} seyahat özetim`, `My ${year} travel recap`)} size="large" onClose={() => setActive(null)}>
      <div className="year-recap-hero"><small>LETSGO2TRAVEL · {year}</small><h3>{copy("Bu yıl dünyada bıraktığın iz", "Your footprint around the world")}</h3><p>{copy("Başlamış ve tamamlanmış seyahatlerin ile anıların. Ortak günler bir kez sayılır.", "Started and completed trips and memories. Overlapping days count once.")}</p></div>
      <div className="year-recap-stats"><article><strong>{yearCountries.size}</strong><small>{copy("Ülke", "Countries")}</small></article><article><strong>{yearTrips.length}</strong><small>{copy("Seyahat", "Trips")}</small></article><article><strong>{travelDays}</strong><small>{copy("Gün", "Days")}</small></article><article><strong>{yearTrips.filter((trip) => trip.originIata && trip.destinationIata).length}</strong><small>{copy("Uçuş", "Flights")}</small></article></div>
      <div className="year-recap-memory"><span>{yearJournal[0]?.mood || "🌍"}</span><div><small>{copy(`${yearJournal.length} GÜNLÜK ANI`, `${yearJournal.length} JOURNAL MEMORIES`)}</small><strong>{yearJournal[0]?.title || copy("İlk anını eklemeye hazır", "Ready for your first memory")}</strong><p>{yearJournal[0]?.note || copy("Seyahat günlüğüne yazdıkların burada özetlenecek.", "Your journal entries will be highlighted here.")}</p></div></div>
      {yearTrips.length > 0 && <div className="year-route-list">{yearTrips.slice(0, 6).map((trip) => <article key={trip.id}><CountryFlag code={trip.destinationCode} label={trip.destinationCountry} /><div><strong>{tripLabel(trip)}</strong><small>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short" }).format(new Date(`${trip.startDate}T12:00:00`))} · {recap.daysForTrip(trip)} {copy("gün", "days")}</small></div></article>)}</div>}
      <button className="primary-wide" type="button" onClick={() => void shareYear()}><Icon name="share" size={18} /> {copy("Özetimi paylaş", "Share my recap")}</button>
    </Sheet>
  </section>;
}
