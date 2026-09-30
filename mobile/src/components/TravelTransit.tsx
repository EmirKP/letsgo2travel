import { formatAppDate } from "../lib/localeFormatting";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "../lib/api";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { openExternal } from "../lib/native";
import { locateForTravel } from "../lib/travelAssistant";
import "./travel-tools-reliability.css";
import { Icon } from "./Icon";
import {
  transitDirectionsUrl,
  validateTransit,
  validStopId,
} from "../../../lib/travel-assistant/transit";
import type {
  TransitResult,
  TransitStop,
} from "../../../lib/travel-assistant/transit";

const endpoint = () =>
  `${config.travelAssistantApiBaseUrl}/api/travel-assistant/transit?city=london&`;
export function TravelTransit() {
  const { copy } = useI18n();
  const [mode, setMode] = useState<'world' | 'london'>('world');
  return <section className="ta-panel ta-form"><nav className="ta-transport-modes" aria-label={copy('Ulaşım kapsamı', 'Transport coverage', 'Mbulimi i transportit')}>
    <button type="button" aria-pressed={mode === 'world'} onClick={() => setMode('world')}>{copy('Tüm şehirler', 'All cities', 'Të gjitha qytetet')}</button>
    <button type="button" aria-pressed={mode === 'london'} onClick={() => setMode('london')}>{copy('Londra · TfL', 'London · TfL', 'Londër · TfL')}</button>
  </nav>{mode === 'world' ? <WorldwideTransit/> : <LondonTransit/>}</section>;
}
function WorldwideTransit() {
  const { copy } = useI18n();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => {generation.current++;}, []);
  const url = transitDirectionsUrl(origin, destination);
  async function locate() {
    if (busy) return;
    const id = ++generation.current; setBusy(true); setError('');
    try { const c = await locateForTravel(); if (id === generation.current) setOrigin(`${c.latitude},${c.longitude}`); }
    catch { if (id === generation.current) setError(copy('Konum alınamadı. Başlangıç adresini yazarak devam edebilirsin.', 'Location unavailable. Enter a departure address to continue.', 'Vendndodhja nuk u gjet. Shkruaj adresën e nisjes për të vazhduar.')); }
    finally { if (id === generation.current) setBusy(false); }
  }
  return <div className="ta-transit-world"><h3>{copy('Nereden nereye?', 'Where are you going?', 'Nga dhe për ku?')}</h3>
    <p>{copy('Şehir, adres veya durak yaz. Toplu taşıma seçenekleri, aktarmalar ve güncel saatler Google Haritalar’da açılır.', 'Enter a city, address or station. Transit options, connections and current times open in Google Maps.', 'Shkruaj qytetin, adresën ose stacionin. Transporti, ndërrimet dhe oraret hapen në Google Maps.')}</p>
    <label>{copy('Başlangıç', 'From', 'Nisja')}<input value={origin} maxLength={200} placeholder={copy('Örn. Kadıköy, İstanbul', 'e.g. Kadıköy, Istanbul', 'P.sh. Sheshi Skënderbej, Tiranë')} onChange={e => {generation.current++;setBusy(false);setOrigin(e.target.value);setError('');}}/></label>
    <button type="button" className="secondary-wide" disabled={busy} onClick={() => void locate()}>{busy ? copy('Konum alınıyor…','Getting location…','Po merret vendndodhja…') : copy('Başlangıç için konumumu kullan', 'Use my location as departure', 'Përdor vendndodhjen si nisje')}</button>
    <label>{copy('Varış', 'To', 'Mbërritja')}<input value={destination} maxLength={200} placeholder={copy('Örn. Galata Kulesi, İstanbul', 'e.g. Galata Tower, Istanbul', 'P.sh. Aeroporti i Tiranës')} onChange={e => {setDestination(e.target.value);setError('');}}/></label>
    <button type="button" className="secondary-wide" disabled={!origin || !destination || busy} onClick={() => {setOrigin(destination);setDestination(origin);setError('');}}><Icon name="swap" size={18}/>{copy('Başlangıç ve varışı değiştir', 'Swap departure and arrival', 'Ndërro nisjen dhe mbërritjen')}</button>
    <button type="button" className="primary-wide" disabled={!url || busy} onClick={() => url && void openExternal(url).then(ok => {if (!ok) setError(copy('Haritalar açılamadı. Yeniden dene.', 'Maps could not open. Try again.', 'Hartat nuk u hapën. Provo përsëri.'));})}><Icon name="external" size={18}/>{copy('Toplu taşıma rotalarını aç', 'Open transit routes', 'Hap rrugët e transportit publik')}</button>
    <p className="ta-muted">{copy('Başlangıç ve varış yalnız butona bastığında harita sağlayıcısına iletilir. Toplu taşıma kapsamı şehre göre değişir.', 'Departure and arrival are shared with the maps provider only when you tap the button. Transit coverage varies by city.', 'Nisja dhe mbërritja ndahen me ofruesin e hartës vetëm kur prek butonin. Mbulimi ndryshon sipas qytetit.')}</p>
    {error && <p role="alert" className="ta-warning">{error}</p>}
  </div>;
}
function LondonTransit() {
  const { copy, locale } = useI18n();
  const now = useCurrentTime();
  const [from, setFrom] = useState<TransitStop | null>(null);
  const [to, setTo] = useState<TransitStop | null>(null);
  const [result, setResult] = useState<TransitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const change = (kind: "from" | "to", stop: TransitStop | null) => {
    generation.current++;
    (kind === "from" ? setFrom : setTo)(stop);
    setResult(null);
    setError("");
    setBusy(false);
  };
  async function plan() {
    if (!from || !to || from.id === to.id || busy) return;
    const id = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const raw = await requestJson<unknown>(
        `${endpoint()}${new URLSearchParams({ from: from.id, to: to.id })}`,
        { timeoutMs: 16000 },
      );
      const value = validateTransit(raw);
      if (!value) throw new Error("invalid");
      if (id === generation.current) setResult(value);
    } catch {
      if (id === generation.current)
        setError(
          copy(
            "Rota alınamadı. İnternet bağlantını kontrol et veya TfL planlayıcısını aç.",
            "Could not retrieve a route. Check your connection or open the TfL planner.",
          ),
        );
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  const stale = result && now - Date.parse(result.fetchedAt) > 300000;
  return (
    <section className="ta-panel ta-form">
      <h2>{copy("Toplu taşıma", "Public transport")}</h2>
      <p>
        {copy(
          "Uygulama içi rota kapsamı: Londra, metro durakları arasında metro, otobüs ve yürüyüş bağlantıları. Kaynak: Transport for London. İnternet gerekir.",
          "In-app coverage: London, tube, bus and walking connections between Underground stations. Source: Transport for London. Internet required.",
        )}
      </p>
      <StopPicker
        label={copy("Başlangıç durağı", "Departure station")}
        value={from}
        onChange={(s) => change("from", s)}
      />
      <StopPicker
        label={copy("Varış durağı", "Arrival station")}
        value={to}
        onChange={(s) => change("to", s)}
      />
      <button
        className="primary-wide"
        disabled={!from || !to || from.id === to.id || busy}
        onClick={() => void plan()}
      >
        {busy
          ? copy("Rota aranıyor…", "Finding routes…")
          : copy("Şimdi hareket için rota bul", "Find routes departing now")}
      </button>
      <p className="ta-muted">
        {copy(
          "Saatler Londra yerel saatidir. Süreler tahminidir; canlı araç konumu veya garanti edilmiş kalkış saati değildir. Sağlayıcının açıklamaları İngilizcedir.",
          "Times are local to London. Durations are estimates, not live vehicle locations or guaranteed departures. Provider instructions are in English.",
        )}
      </p>
      {error && (
        <p role="alert" className="ta-warning">
          {error}
        </p>
      )}
      {result && (
        <>
          <p>
            {copy("Son sorgu:", "Last checked:")}{" "}
            {formatAppDate(new Date(result.fetchedAt), locale, { hour: "numeric", minute: "numeric", second: "numeric" })}
          </p>
          {stale ? (
            <p role="status" className="ta-warning">
              {copy(
                "Bu rota bilgisi eskidi. Güncel hareket saatleri için tekrar ara.",
                "This route information has expired. Search again for current departures.",
              )}
            </p>
          ) : result.journeys.length ? (
            result.journeys.map((j, i) => (
              <article className="ta-card" key={i}>
                <h3>
                  {j.minutes} {copy("dakika", "minutes")} ·{" "}
                  {j.departure.slice(11, 16)}–{j.arrival.slice(11, 16)}
                </h3>
                <ol className="ta-transit-legs">
                  {j.legs.map((l, n) => (
                    <li key={n}>
                      <strong lang="en">{l.summary}</strong>
                      <p>
                        {l.from} → {l.to}
                        <br />
                        {l.departure.slice(11, 16)}–{l.arrival.slice(11, 16)} ·{" "}
                        {l.minutes} {copy("dk", "min")}
                      </p>
                      {l.disruptions.map((d, k) => (
                        <p key={k} className="ta-warning" lang="en">
                          {d}
                        </p>
                      ))}
                    </li>
                  ))}
                </ol>
              </article>
            ))
          ) : (
            <p>
              {copy(
                "Bu iki durak için rota bulunamadı.",
                "No route found between these stations.",
              )}
            </p>
          )}
        </>
      )}
      <div className="ta-actions">
        <a
          href="https://tfl.gov.uk/plan-a-journey/"
          target="_blank"
          rel="noreferrer"
        >
          {copy("Resmî TfL planlayıcısı", "Official TfL planner")}
        </a>
        <a
          href="https://www.google.com/maps/dir/?api=1&travelmode=transit"
          target="_blank"
          rel="noreferrer"
        >
          {copy(
            "Diğer şehirler: haritada ulaşım ara",
            "Other cities: search transit in maps",
          )}
        </a>
      </div>
    </section>
  );
}
function StopPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TransitStop | null;
  onChange: (s: TransitStop | null) => void;
}) {
  const { copy } = useI18n();
  const [q, setQ] = useState("");
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  async function search() {
    const id = ++generation.current;
    setBusy(true);
    setMessage("");
    setStops([]);
    try {
      const result = await requestJson<{ stops: TransitStop[] }>(
        `${endpoint()}${new URLSearchParams({ q })}`,
        { timeoutMs: 14000 },
      );
      if (
        !Array.isArray(result.stops) ||
        result.stops.some(
          (s) => !validStopId(s.id) || typeof s.name !== "string",
        )
      )
        throw new Error("invalid");
      if (id === generation.current) {
        setStops(result.stops);
        if (!result.stops.length)
          setMessage(copy("Durak bulunamadı.", "No stations found."));
      }
    } catch {
      if (id === generation.current)
        setMessage(
          copy(
            "Durak araması yapılamadı. Bağlantını kontrol et.",
            "Station search failed. Check your connection.",
          ),
        );
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  return (
    <div className="ta-station-picker">
      <label>
        {label}
        <input
          value={q}
          maxLength={60}
          onKeyDown={e => {if (e.key === "Enter" && q.trim().length >= 2 && !busy) {e.preventDefault();void search();}}}
          placeholder="Waterloo, Victoria…"
          onChange={(e) => {
            generation.current++;
            setQ(e.target.value);
            onChange(null);
            setStops([]);
            setMessage("");
            setBusy(false);
          }}
        />
      </label>
      <button
        className="secondary-wide"
        disabled={q.trim().length < 2 || busy}
        onClick={() => void search()}
      >
        {busy
          ? copy("Aranıyor…", "Searching…")
          : copy("Durak ara", "Search stations")}
      </button>
      {value && <p role="status" className="ta-inline-status"><Icon name="check" size={18}/><span>{copy("Seçili durak:", "Selected station:")} {value.name}</span></p>}
      {message && <p role="status">{message}</p>}
      <div className="ta-place-list">
        {stops.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              onChange(s);
              setStops([]);
              setQ(s.name);
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
