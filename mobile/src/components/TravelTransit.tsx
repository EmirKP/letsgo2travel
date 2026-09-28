import { useRef, useState } from "react";
import { requestJson } from "../lib/api";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { Icon } from "./Icon";
import {
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
  const now = useCurrentTime();
  const [from, setFrom] = useState<TransitStop | null>(null);
  const [to, setTo] = useState<TransitStop | null>(null);
  const [result, setResult] = useState<TransitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
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
            {new Date(result.fetchedAt).toLocaleTimeString()}
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
