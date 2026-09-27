import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { activeFlightExpiry, parseFlightSelection, type FlightSelection } from "../lib/flightSelection";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { localIsoDate } from "../lib/dates";
import { normalizeFlightNumber } from "../lib/cockpitForm";
import { DateTimeField } from "./DateTimeField";
import { Icon } from "./Icon";
import "./cockpit-flight-lookup.css";

type Props = { accessToken: string; flightNumber: string; date: string;
  onQueryChange: (number: string, date: string) => void; onSelect: (flight: FlightSelection) => void; onManual: () => void };

export function CockpitFlightLookup({ accessToken, flightNumber, date, onQueryChange, onSelect, onManual }: Props) {
  const { copy, locale } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(0);
  const [mode, setMode] = useState<"trial" | "commercial">("trial");
  const [busy, setBusy] = useState(false);
  const [flights, setFlights] = useState<FlightSelection[]>([]);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const endpoint = `${config.apiBaseUrl}/api/cockpit/flight-lookup`;
  const pastDepartureMessage = copy(
    "Planlanan kalkış saati geçti. Bu alan yalnız gelecekteki uçuşları doldurur; canlı uçuş takibi yapmaz.",
    "The scheduled departure time has passed. This form fills future flights only; it does not provide live flight tracking.",
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    setAvailable(null);
    if (!accessToken) { setAvailable(false); return () => { clearTimeout(timer); controller.abort(); }; }
    void fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}`, "X-Flight-Lookup-Version": "2" }, signal: controller.signal, cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(value => { if (active) { setAvailable(value?.protocol === 2 && value.available === true && ["trial", "commercial"].includes(value.mode)); setMode(value?.mode === "commercial" ? "commercial" : "trial"); } })
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
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "X-Flight-Lookup-Version": "2" },
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
      if (body.protocol !== 2 || !Array.isArray(body.flights) || body.flights.length > 12) throw new Error("invalid-response");
      const parsed = body.flights.map((flight: unknown) => parseFlightSelection(flight, flightNumber, date));
      if (parsed.some((flight: FlightSelection | null) => !flight || mode === "trial" && flight.maySave)) throw new Error("invalid-response");
      setFlights(parsed as FlightSelection[]);
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
    const expire = () => setFlights(current => current.filter(flight => activeFlightExpiry(flight.expiresAt, flight.fetchedAt)));
    const next = Math.min(...flights.map(flight => Date.parse(flight.expiresAt)));
    const timer = Number.isFinite(next) ? setTimeout(expire, Math.max(0, Math.min(next - Date.now(), 2147483647))) : undefined;
    document.addEventListener("visibilitychange", expire);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", expire); };
  }, [flights]);

  return <section className="cockpit-flight-lookup" aria-label={copy("Uçuşunu bul", "Find your flight")}>
    <header><span className="flight-lookup-icon"><Icon name="plane" size={22}/></span><div><h3>{copy("Biletinden kokpitine", "From ticket to cockpit")}</h3><p>{copy("Uçuş numaran ve kalkış gününle başla.", "Start with your flight number and departure day.")}</p></div></header>
    <div className="form-grid two stack-narrow">
      <label>{copy("Uçuş numarası", "Flight number")}<input value={flightNumber} maxLength={8} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="TK1979" onChange={event => onQueryChange(normalizeFlightNumber(event.target.value), date)}/></label>
      <DateTimeField type="date" required label={copy("Kalkış tarihi", "Departure date")} value={date} min={localIsoDate(-1)} max={localIsoDate(730)} onChange={value => onQueryChange(flightNumber, value)}/>
    </div>
    <p className="form-hint">{copy("Biletteki uçuş numarasını kullan; PNR rezervasyon kodudur. Tarih, kalkış havalimanının yerel günüdür.", "Use the flight number on your ticket; PNR is your booking reference. The date is local to the departure airport.")}</p>
    {available === true ? <button type="button" className="primary-wide" disabled={busy || !flightNumber || !date} onClick={() => void search()}>{busy ? <span className="button-loader"/> : <Icon name="search" size={18}/>} {busy ? copy("Uçuş aranıyor…", "Finding flight…") : copy("Uçuş bilgilerini getir", "Find flight details")}</button>
      : <div className="flight-lookup-availability" role="status"><p>{available === null ? copy("Uçuş arama kontrol ediliyor…", "Checking flight search…") : copy("Otomatik uçuş bilgisi henüz kullanıma açık değil. Biletindeki bilgilerle devam edebilirsin.", "Automatic flight details are not available yet. You can continue with the details on your ticket.")}</p>{available === false && <button type="button" onClick={() => { setAvailable(null); setChecking(value => value + 1); }}>{copy("Tekrar kontrol et", "Check again")}</button>}</div>}
    {available && mode === "trial" && <p className="form-hint">{copy("Uçuş arama denemesi: sonuçlar görüntülenir, kokpite kaydedilemez.", "Flight lookup trial: results can be viewed but cannot be saved to Cockpit.")}</p>}
    {message && <p className="flight-lookup-message" role="status">{message}</p>}
    {flights.length > 0 && <div className="flight-lookup-results"><p>{copy("Biletindeki rotayı seç. Saatler havalimanlarının yerel saatidir.", "Choose the route on your ticket. Times are local to each airport.")}</p>{flights.map(flight => <button className="flight-lookup-result" type="button" key={flight.id} onClick={() => {
      if (!activeFlightExpiry(flight.expiresAt, flight.fetchedAt)) { setFlights([]); setMessage(copy("Uçuş bilgisinin süresi doldu. Yeniden ara.", "Flight details have expired. Search again.")); return; }
      if (Date.parse(flight.departureAt) <= Date.now()) { setFlights([]); setMessage(pastDepartureMessage); return; }
      onSelect(flight); setFlights([]); setMessage("");
    }}>
      <span><strong>{flight.origin.iata} <span aria-hidden="true">→</span> {flight.destination.iata}</strong><b>{flight.flightNumber}</b></span>
      <span>{flight.origin.city} → {flight.destination.city}</span>
      <span>{flight.departureDate} · {flight.departureTime} → {flight.arrivalDate} · {flight.arrivalTime}</span>
      <small>{flight.airline} · {copy("Planlanan saatler", "Scheduled times")} · AeroDataBox</small>
    </button>)}</div>}
    {flights.length > 0 && <a href="https://aerodatabox.com/" target="_blank" rel="noopener">{copy("Uçuş verisi: AeroDataBox", "Flight data: AeroDataBox")}</a>}
    <button className="flight-manual-button" type="button" onClick={() => { generation.current++; pending.current?.abort(); pending.current = null; setBusy(false); setFlights([]); setMessage(""); onManual(); }}>{copy("Bilgileri kendim gireceğim", "I'll enter the details myself")}</button>
  </section>;
}
