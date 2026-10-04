import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { activeFlightExpiry, parseFlightSelection, type FlightSelection } from "../lib/flightSelection";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { localIsoDate } from "../lib/dates";
import { normalizeFlightNumber } from "../lib/cockpitForm";
import { DateTimeField } from "./DateTimeField";
import { Icon } from "./Icon";
import { TravelToolArtwork } from "./TravelToolArtwork";
import { CockpitFlightDetails } from "./CockpitFlightDetails";
import "./cockpit-flight-lookup.css";
import "./feature-entry-artwork.css";

type Props = { accessToken: string; flightNumber: string; date: string;
  onQueryChange: (number: string, date: string) => void; onSelect: (flight: FlightSelection, mode: "trial" | "commercial") => void; onManual: () => void;
  compact?: boolean; onExpand?: () => void };

export function CockpitFlightLookup({ accessToken, flightNumber, date, onQueryChange, onSelect, onManual, compact = false, onExpand }: Props) {
  const { copy, locale } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(0);
  const [mode, setMode] = useState<"trial" | "commercial">("trial");
  const [busy, setBusy] = useState(false);
  const [flights, setFlights] = useState<FlightSelection[]>([]);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const endpoint = `${config.apiBaseUrl}/api/cockpit/flight-lookup`;
  const pastDepartureMessage = copy(
    "Planlanan kalkış saati geçti ve devam eden uçuş bilgisi doğrulanamadı. Biletindeki bilgilerle elle devam edebilirsin.",
    "The scheduled departure time has passed and ongoing flight details could not be verified. You can continue manually with your ticket.",
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    setAvailable(null);
    if (!accessToken) { setAvailable(false); return () => { clearTimeout(timer); controller.abort(); }; }
    void fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}`, "X-Flight-Lookup-Version": "3" }, signal: controller.signal, cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(value => { if (active) { setAvailable(value?.protocol === 3 && value.available === true && ["trial", "commercial"].includes(value.mode)); setMode(value?.mode === "commercial" ? "commercial" : "trial"); } })
      .catch(() => { if (active) setAvailable(false); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [endpoint, checking, accessToken]);

  useLayoutEffect(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false); setFlights([]); setMessage("");
    return () => { generation.current++; pending.current?.abort(); pending.current = null; };
  }, [flightNumber, date, accessToken, locale]);

  async function search() {
    if (busy || pending.current || !available || !accessToken) return;
    if (!flightNumber || !date) { setMessage(copy("Uçuş numarasını ve kalkış tarihini gir.", "Enter the flight number and departure date.")); return; }
    const id = ++generation.current;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 22000);
    setBusy(true); setFlights([]); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "X-Flight-Lookup-Version": "3" },
        body: JSON.stringify({ flightNumber, date }), signal: controller.signal, cache: "no-store" });
      const body = await response.json();
      if (id !== generation.current) return;
      if (!response.ok) {
        setMessage(response.status === 429 ? copy("Arama sınırına ulaşıldı. Biletindeki bilgilerle devam edebilirsin.", "Search limit reached. You can continue with the details on your ticket.")
          : response.status === 400 ? copy("Uçuş numarasını (ör. TK1979) ve kalkış tarihini kontrol et.", "Check the flight number (e.g. TK1979) and departure date.")
          : response.status === 401 ? copy("Oturumunu yenileyip tekrar dene.", "Sign in again and retry.")
          : copy("Uçuş bilgisi şu anda alınamıyor. Elle devam edebilirsin.", "Flight information is unavailable right now. You can continue manually."));
        return;
      }
      if (body.protocol !== 3 || !Array.isArray(body.flights) || body.flights.length > 12) throw new Error("invalid-response");
      const parsed = body.flights.map((flight: unknown) => parseFlightSelection(flight, flightNumber, date));
      if (parsed.some((flight: FlightSelection | null) => !flight || mode === "trial" && flight.maySave)) throw new Error("invalid-response");
      setFlights(parsed as FlightSelection[]);
      setClock(Date.now());
      if (!parsed.length) {
        const messages: Record<string, string> = {
          "past-departure": pastDepartureMessage,
          incomplete: copy("Bu uçuşu otomatik doldurmak için yeterli bilgi alınamadı. Biletindeki bilgilerle elle devam edebilirsin.", "There is not enough information to fill this flight automatically. You can enter the details from your ticket manually."),
          "not-found": copy("Bu uçuş numarası ve tarihte kayıt bulunamadı. Numara ve kalkış tarihini kontrol et.", "No flight was found for this number and date. Check the flight number and departure date."),
          "status-unavailable": copy("Bu uçuş için otomatik eklemeye uygun bilgi bulunamadı. Biletindeki bilgileri kontrol ederek elle devam et.", "This flight cannot be added automatically with the available information. Check your ticket and continue manually."),
        };
        setMessage(messages[body.reason] || messages.incomplete);
      }
    } catch {
      if (id === generation.current) setMessage(copy("Bağlantı kurulamadı veya arama zaman aşımına uğradı. Tekrar dene ya da elle devam et.", "The connection failed or the search timed out. Retry or continue manually."));
    } finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; if (id === generation.current) setBusy(false); }
  }

  useEffect(() => {
    const expire = () => { setClock(Date.now()); setFlights(current => current.filter(flight => activeFlightExpiry(flight.expiresAt, flight.fetchedAt))); };
    const next = Math.min(...flights.flatMap(flight => [Date.parse(flight.expiresAt), Date.parse(flight.progress?.freshUntil || "")]).filter(value => Number.isFinite(value) && value > clock));
    const timer = Number.isFinite(next) ? setTimeout(expire, Math.max(0, Math.min(next - Date.now(), 2147483647))) : undefined;
    document.addEventListener("visibilitychange", expire);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", expire); };
  }, [flights, clock]);

  if (compact) return <div className="cockpit-query-summary"><span><small>{copy("Uçuş", "Flight")}</small><strong>{flightNumber || copy("Bilet bilgileri", "Ticket details")}</strong><small>{date}</small></span><button type="button" onClick={onExpand}>{copy("Uçuşu değiştir", "Change flight")}</button></div>;

  return <section className="cockpit-flight-lookup" aria-label={copy("Uçuşunu bul", "Find your flight")}>
    <header><span className="flight-lookup-icon cockpit-feature-artwork"><TravelToolArtwork kind="flight" size={56}/></span><div><h3>{copy("Uçuşunu bul", "Find your flight")}</h3><p>{copy("Yaklaşan veya devam eden uçuşunla başla.", "Start with an upcoming or ongoing flight.")}</p></div></header>
    <div className="form-grid two stack-narrow">
      <label>{copy("Uçuş numarası", "Flight number")}<input value={flightNumber} maxLength={8} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="TK1979" onChange={event => onQueryChange(normalizeFlightNumber(event.target.value), date)}/></label>
      <DateTimeField type="date" required label={copy("Kalkış tarihi", "Departure date")} value={date} min={localIsoDate(-1)} max={localIsoDate(730)} onChange={value => onQueryChange(flightNumber, value)}/>
    </div>
    <p className="form-hint">{copy("Uçuş numarası PNR'dan farklıdır. Kalkış havalimanının yerel tarihini kullan.", "The flight number differs from the PNR. Use the departure airport's local date.")}</p>
    {available === true ? <button type="button" className="primary-wide" disabled={busy || !flightNumber || !date} onClick={() => void search()}>{busy ? <span className="button-loader"/> : <Icon name="search" size={18}/>} {busy ? copy("Uçuş aranıyor…", "Finding flight…") : copy("Uçuş bilgilerini getir", "Find flight details")}</button>
      : <div className="flight-lookup-availability" role="status"><p>{available === null ? copy("Uçuş arama kontrol ediliyor…", "Checking flight search…") : copy("Otomatik uçuş bilgisi henüz kullanıma açık değil. Biletindeki bilgilerle devam edebilirsin.", "Automatic flight details are not available yet. You can continue with the details on your ticket.")}</p>{available === false && <button type="button" onClick={() => { setAvailable(null); setChecking(value => value + 1); }}>{copy("Tekrar kontrol et", "Check again")}</button>}</div>}
    {available && mode === "trial" && <p className="form-hint">{copy("Uçuş arama denemesi: sonuçlar görüntülenir, kokpite kaydedilemez.", "Flight lookup trial: results can be viewed but cannot be saved to Cockpit.")}</p>}
    {message && <p className="flight-lookup-message" role="status">{message}</p>}
    {flights.length > 0 && <div className="flight-lookup-results"><p>{copy("Biletindeki rotayı seç. Saatler havalimanlarının yerel saatidir.", "Choose the route on your ticket. Times are local to each airport.")}</p>{flights.map(flight => <button className="flight-lookup-result" type="button" key={flight.id} onClick={() => {
      if (!activeFlightExpiry(flight.expiresAt, flight.fetchedAt)) { setFlights([]); setMessage(copy("Uçuş bilgisinin süresi doldu. Yeniden ara.", "Flight details have expired. Search again.")); return; }
      if (!flight.progress && Date.parse(flight.departureAt) <= Date.now()) { setFlights([]); setMessage(pastDepartureMessage); return; }
      onSelect(flight, mode); setFlights([]); setMessage("");
    }}>
      <span><strong>{flight.origin.iata} <span aria-hidden="true">→</span> {flight.destination.iata}</strong><b>{flight.flightNumber}</b></span>
      <CockpitFlightDetails flight={flight} now={clock} compact/>
      <small>{flight.airline} · {copy("Ayrıntıları göster", "View details")}</small>
    </button>)}</div>}
    {flights.length > 0 && <a href="https://aerodatabox.com/" target="_blank" rel="noopener">{copy("Uçuş verisi: AeroDataBox", "Flight data: AeroDataBox")}</a>}
    <button className="flight-manual-button" type="button" onClick={() => { generation.current++; pending.current?.abort(); pending.current = null; setBusy(false); setFlights([]); setMessage(""); onManual(); }}>{copy("Bilgileri kendim gireceğim", "I'll enter the details myself")}</button>
  </section>;
}
