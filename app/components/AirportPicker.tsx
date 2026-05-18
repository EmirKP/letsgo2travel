"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AIRPORT_OPTIONS,
  airportLabel,
  airportSearchHaystack,
  getAirportByCode,
  normalizeAirportText,
  type AirportOption,
} from "@/lib/airports";

type AirportPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function typeIcon(type: AirportOption["type"]) {
  if (type === "country") return "⚑";
  if (type === "city") return "●";
  return "✈";
}

export default function AirportPicker({ label, value, onChange, placeholder = "Şehir, ülke veya havalimanı yaz" }: AirportPickerProps) {
  const selected = getAirportByCode(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const results = useMemo(() => {
    const term = normalizeAirportText(query.trim());
    const base = term
      ? AIRPORT_OPTIONS.filter((option) => airportSearchHaystack(option).includes(term))
      : AIRPORT_OPTIONS.filter((option) => option.popular);

    return base
      .sort((a, b) => {
        if (!term) return Number(Boolean(b.popular)) - Number(Boolean(a.popular));
        const countryRank = Number(b.type === "country") - Number(a.type === "country");
        if (countryRank) return countryRank;
        const cityRank = Number(b.type === "city") - Number(a.type === "city");
        if (cityRank) return cityRank;
        return Number(Boolean(b.popular)) - Number(Boolean(a.popular));
      })
      .slice(0, 14);
  }, [query]);

  function selectAirport(option: AirportOption) {
    onChange(option.code);
    setQuery("");
    setOpen(false);
    setHighlight(0);
    inputRef.current?.blur();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && open && results[highlight]) {
      event.preventDefault();
      selectAirport(results[highlight]);
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div className="airport-picker" ref={rootRef}>
      <label className="airport-picker-label" htmlFor={`airport-${label}`}>{label}</label>
      <button
        type="button"
        className={`airport-picker-control ${open ? "active" : ""}`}
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <span className="airport-picker-main">{selected ? airportLabel(selected) : placeholder}</span>
        <span className="airport-picker-code">{selected?.displayCode || value}</span>
      </button>

      {open && (
        <div className="airport-picker-menu">
          <div className="airport-picker-search-row">
            <span>⌕</span>
            <input
              ref={inputRef}
              id={`airport-${label}`}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setHighlight(0); }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoComplete="off"
            />
            {query && <button type="button" onClick={() => setQuery("")}>×</button>}
          </div>
          <div className="airport-picker-list">
            {results.map((option, index) => (
              <button
                type="button"
                key={option.id}
                className={`airport-picker-option ${index === highlight ? "highlight" : ""}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => selectAirport(option)}
              >
                <span className={`airport-picker-icon ${option.type}`}>{typeIcon(option.type)}</span>
                <span className="airport-picker-text">
                  <strong>{option.type === "airport" ? `${option.city} ${option.name}` : option.city}</strong>
                  <small>{option.type === "airport" ? option.country : `${option.name} · ${option.country}`}</small>
                </span>
                <span className="airport-picker-badge">{option.displayCode}</span>
              </button>
            ))}
            {!results.length && (
              <div className="airport-picker-empty">
                Sonuç bulunamadı. Şehir, ülke adı veya IATA kodu yazmayı dene.
              </div>
            )}
          </div>
          <div className="airport-picker-footnote">
            <span>İpucu: İstanbul, Paris, Dubai, JFK, Antalya veya Türkiye yazabilirsin.</span>
          </div>
        </div>
      )}
    </div>
  );
}
