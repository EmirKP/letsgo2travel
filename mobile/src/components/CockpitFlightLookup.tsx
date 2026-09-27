import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FlightMatch } from "../../../lib/flight-lookup";
import { validTimeZone, zonedParts } from "../../../lib/zoned-time";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { localIsoDate } from "../lib/dates";
import { normalizeFlightNumber } from "../lib/cockpitForm";
import { DateTimeField } from "./DateTimeField";
import { Icon } from "./Icon";
import "./cockpit-flight-lookup.css";

type Props = { accessToken: string; flightNumber: string; date: string;
  onQueryChange: (number: string, date: string) => void; onSelect: (flight: FlightMatch) => void; onManual: () => void };

function validFlightResult(value: unknown, number: string, date: string): value is FlightMatch {
  if (!value || typeof value !== "object") return false;
  const f = value as FlightMatch;
  const shortText = (text: unknown, max: number) => typeof text === "string" && text.length > 0 && text.length <= max;
  if (!shortText(f.id, 180) || f.flightNumber !== number || f.departureDate !== date || f.source !== "AeroDataBox" || typeof f.airline !== "string" || f.airline.length > 80) return false;
  for (const airport of [f.origin, f.destination]) {
    if (!airport || typeof airport !== "object" || !/^[A-Z]{3}$/.test(airport.iata) || !/^[A-Z]{2}$/.test(airport.countryCode)
      || !shortText(airport.name, 180) || !shortText(airport.city, 100) || !shortText(airport.country, 100) || !validTimeZone(airport.timeZone)) return false;
  }
  const departure = Date.parse(f.departureAt), arrival = Date.parse(f.arrivalAt), fetched = Date.parse(f.fetchedAt);
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || !Number.isFinite(fetched) || arrival <= departure || f.origin.iata === f.destination.iata) return false;
  const dep = zonedParts(departure, f.origin.timeZone), arr = zonedParts(arrival, f.destination.timeZone);
  return dep.date === f.departureDate && dep.time.slice(0, 5) === f.departureTime && arr.date === f.arrivalDate && arr.time.slice(0, 5) === f.arrivalTime;
}
export function CockpitFlightLookup({ accessToken, flightNumber, date, onQueryChange, onSelect, onManual }: Props) {
  const { copy, locale } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flights, setFlights] = useState<FlightMatch[]>([]);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const endpoint = `${config.apiBaseUrl}/api/cockpit/flight-lookup`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    void fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async response => response.ok && (await response.json()).available === true)
      .then(value => { if (active) setAvailable(value); })
      .catch(() => { if (active) setAvailable(false); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [endpoint, checking]);

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
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
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
      if (!Array.isArray(body.flights) || body.flights.length > 12 || !body.flights.every((flight: unknown) => validFlightResult(flight, flightNumber, date))) throw new Error("invalid-response");
      setFlights(body.flights);
      if (!body.flights.length) setMessage(copy("Bu numara ve tarihte eksiksiz uçuş bilgisi bulunamadı. Tarihi kontrol et veya elle devam et.", "No complete flight details were found for this number and date. Check the date or continue manually."));
    } catch {
      if (id === generation.current) setMessage(copy("Bağlantı kurulamadı veya arama zaman aşımına uğradı. Tekrar dene ya da elle devam et.", "The connection failed or the search timed out. Retry or continue manually."));
    } finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; if (id === generation.current) setBusy(false); }
  }

  return <section className="cockpit-flight-lookup" aria-label={copy("Uçuşunu bul", "Find your flight")}>
    <header><span className="flight-lookup-icon"><Icon name="plane" size={22}/></span><div><h3>{copy("Biletinden kokpitine", "From ticket to cockpit")}</h3><p>{copy("Uçuş numaran ve kalkış gününle başla.", "Start with your flight number and departure day.")}</p></div></header>
    <div className="form-grid two stack-narrow">
      <label>{copy("Uçuş numarası", "Flight number")}<input value={flightNumber} maxLength={8} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="TK1979" onChange={event => onQueryChange(normalizeFlightNumber(event.target.value), date)}/></label>
      <DateTimeField type="date" required label={copy("Kalkış tarihi", "Departure date")} value={date} min={localIsoDate(-1)} max={localIsoDate(730)} onChange={value => onQueryChange(flightNumber, value)}/>
    </div>
    <p className="form-hint">{copy("Biletteki uçuş numarasını kullan; PNR rezervasyon kodudur. Tarih, kalkış havalimanının yerel günüdür.", "Use the flight number on your ticket; PNR is your booking reference. The date is local to the departure airport.")}</p>
    {available === true ? <button type="button" className="primary-wide" disabled={busy || !flightNumber || !date} onClick={() => void search()}>{busy ? <span className="button-loader"/> : <Icon name="search" size={18}/>} {busy ? copy("Uçuş aranıyor…", "Finding flight…") : copy("Uçuş bilgilerini getir", "Find flight details")}</button>
      : <div className="flight-lookup-availability" role="status"><p>{available === null ? copy("Uçuş arama kontrol ediliyor…", "Checking flight search…") : copy("Otomatik uçuş bilgisi henüz kullanıma açık değil. Biletindeki bilgilerle devam edebilirsin.", "Automatic flight details are not available yet. You can continue with the details on your ticket.")}</p>{available === false && <button type="button" onClick={() => { setAvailable(null); setChecking(value => value + 1); }}>{copy("Tekrar kontrol et", "Check again")}</button>}</div>}
    {message && <p className="flight-lookup-message" role="status">{message}</p>}
    {flights.length > 0 && <div className="flight-lookup-results"><p>{copy("Biletindeki rotayı seç. Saatler havalimanlarının yerel saatidir.", "Choose the route on your ticket. Times are local to each airport.")}</p>{flights.map(flight => <button className="flight-lookup-result" type="button" key={flight.id} onClick={() => { onSelect(flight); setFlights([]); setMessage(""); }}>
      <span><strong>{flight.origin.iata} <span aria-hidden="true">→</span> {flight.destination.iata}</strong><b>{flight.flightNumber}</b></span>
      <span>{flight.origin.city} → {flight.destination.city}</span>
      <span>{flight.departureDate} · {flight.departureTime} → {flight.arrivalDate} · {flight.arrivalTime}</span>
      <small>{flight.airline} · {copy("Planlanan saatler", "Scheduled times")} · AeroDataBox</small>
    </button>)}</div>}
    <button className="flight-manual-button" type="button" onClick={() => { generation.current++; pending.current?.abort(); pending.current = null; setBusy(false); setFlights([]); setMessage(""); onManual(); }}>{copy("Bilgileri kendim gireceğim", "I'll enter the details myself")}</button>
  </section>;
}
