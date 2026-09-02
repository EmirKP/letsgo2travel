"use client";

// Dünya çapında havalimanı autocomplete alanı (web).
// - /api/airports üzerinden sunucu tarafı arama (debounce + istemci cache);
//   büyük liste istemciye inmez.
// - Kullanıcı şehir, ülke, havalimanı adı veya IATA koduyla arar; IATA
//   bilmek zorunda değildir. Sonuç: havalimanı adı, şehir, ülke, IATA.
// - Klavye (ok/enter/escape) ve dokunma (44px satır) erişilebilir.

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type AirportOption = {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
};

type AirportAutocompleteProps = {
  label: string;
  placeholder?: string;
  value: AirportOption | null;
  onChange: (option: AirportOption | null) => void;
  required?: boolean;
};

const searchCache = new Map<string, AirportOption[]>();

function optionTitle(option: AirportOption) {
  return option.city && option.city !== option.name ? option.city : option.name;
}

export default function AirportAutocomplete({ label, placeholder, value, onChange, required }: AirportAutocompleteProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const displayValue = useMemo(
    () => (value ? `${optionTitle(value)} (${value.iata})` : query),
    [query, value],
  );

  useEffect(() => {
    const term = query.trim();
    if (value || term.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const cached = searchCache.get(term.toLocaleLowerCase("tr-TR"));
    if (cached) {
      setOptions(cached);
      setOpen(true);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/airports?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((rows: AirportOption[]) => {
          searchCache.set(term.toLocaleLowerCase("tr-TR"), rows);
          setOptions(rows);
          setOpen(true);
          setActiveIndex(rows.length ? 0 : -1);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, value]);

  useEffect(() => {
    const onOutside = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, []);

  const select = (option: AirportOption) => {
    onChange(option);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !options.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = options[activeIndex] || options[0];
      if (active) select(active);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="l2t-airport-field" ref={rootRef}>
      <label className="l2t-alarm-field">
        <span>{label}</span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={displayValue}
          placeholder={placeholder || "Şehir, ülke veya havalimanı yaz"}
          required={required && !value}
          onChange={(event) => {
            onChange(null);
            setQuery(event.target.value);
          }}
          onFocus={() => { if (options.length && !value) setOpen(true); }}
          onKeyDown={onKeyDown}
        />
      </label>
      {value && (
        <p className="l2t-airport-selected">
          {value.name} · {value.city ? `${value.city}, ` : ""}{value.country}
          <button type="button" onClick={() => { onChange(null); setQuery(""); }} aria-label="Seçimi temizle">Değiştir</button>
        </p>
      )}
      {open && !value && (
        <ul className="l2t-airport-options" id={listId} role="listbox">
          {loading && !options.length && <li className="l2t-airport-note">Aranıyor…</li>}
          {!loading && !options.length && query.trim().length >= 2 && (
            <li className="l2t-airport-note">Sonuç bulunamadı. Şehir veya havalimanı adıyla dene.</li>
          )}
          {options.map((option, index) => (
            <li key={option.iata} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={index === activeIndex ? "is-active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
              >
                <strong>{optionTitle(option)} <em>{option.iata}</em></strong>
                <small>{option.name} · {option.country}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
