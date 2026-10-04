"use client";

import { useEffect, useId, useState } from "react";
import type { AirportOption } from "../../../mobile/src/lib/airports";
import styles from "./Cockpit.module.css";

export default function CockpitAirportField({ label, value, disabled, onChange }: {
  label: string; value: AirportOption | null; disabled: boolean; onChange: (value: AirportOption | null) => void;
}) {
  const id = useId(), [query, setQuery] = useState(""), [results, setResults] = useState<AirportOption[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResults([]); setError("");
    if (value || query.trim().length < 2) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    const timer = setTimeout(async () => {
      const deadline = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`/api/airports?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search");
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) throw new Error("shape");
        const valid = rows.filter((row): row is AirportOption => !!row && /^[A-Z]{3}$/.test(row.iata) && /^[A-Z]{2}$/.test(row.countryCode)
          && [row.name, row.city, row.country].every(item => typeof item === "string"));
        if (active) setResults(valid);
      } catch { if (active) setError("Havalimanları yüklenemedi. Yeniden dene."); }
      finally { clearTimeout(deadline); if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, value, revision]);
  return <div className={styles.airportField}>
    <label htmlFor={id}>{label}</label>
    {value ? <div className={styles.airportSelection}><span><strong>{value.iata}</strong> · {value.city || value.name}<small>{value.name}</small></span><button type="button" disabled={disabled} aria-label={`${label} seçimini değiştir`} onClick={() => { setQuery(""); onChange(null); }}>Değiştir</button></div>
      : <><input id={id} value={query} maxLength={80} disabled={disabled} autoComplete="off" placeholder="Şehir, havalimanı veya IATA kodu" aria-describedby={`${id}-help`} onChange={event => setQuery(event.target.value)}/>
        <small id={`${id}-help`}>En az iki harf yazıp sonuçlardan seç.</small>
        {loading && <small role="status">Aranıyor…</small>}
        {error && <div role="alert">{error} <button type="button" disabled={disabled} onClick={() => setRevision(number => number + 1)}>Yeniden dene</button></div>}
        {!loading && !error && query.trim().length >= 2 && results.length === 0 && <small role="status">Havalimanı bulunamadı.</small>}
        {results.length > 0 && <ul className={styles.airportResults} aria-label={`${label} sonuçları`}>{results.map(airport => <li key={airport.iata}><button type="button" disabled={disabled} onClick={() => onChange(airport)}><strong>{airport.iata} · {airport.city || airport.name}</strong><small>{airport.name} · {airport.country}</small></button></li>)}</ul>}
      </>}
  </div>;
}
