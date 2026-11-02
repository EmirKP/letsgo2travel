import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { airportTitle, searchAirports, type AirportOption } from "../lib/airports";
import { useI18n } from "../lib/i18n";
import { airportLifecycle } from "../../../lib/airport-lifecycle";

// Mobil havalimanı seçici: kullanıcı şehir, ülke, havalimanı adı veya
// IATA koduyla arar; IATA bilmek zorunda değildir. Sonuç satırı ad,
// şehir, ülke ve IATA gösterir. Arama sunucudadır (ortak /api/airports).

type AirportFieldProps = {
  label: string;
  value: AirportOption | null;
  onChange: (option: AirportOption | null) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
};

export function AirportField({ label, value, onChange, placeholder, required = false, error }: AirportFieldProps) {
  const { copy } = useI18n();
  const lifecycleLabel = copy("Artık kapalı · tarihî havalimanı", "Now closed · historical airport", "Tani i mbyllur · aeroport historik");
  const selectedLifecycle = value ? airportLifecycle(value.iata, value.countryCode) : null;
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; requestId: number; rows: AirportOption[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const generation = useRef(0);
  const currentQuery = useRef("");
  const wantsOpen = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();
  const options = result?.query === query.trim() ? result.rows : [];

  useEffect(() => {
    // Alan temizlendiğinde veya seçim yapıldığında da önceki ağ cevabını
    // geçersiz kıl; geç gelen sonuç kapatılmış listeyi yeniden açmasın.
    const requestId = ++generation.current;
    const term = query.trim();
    if (value || term.length < 2) {
      setResult(null);
      wantsOpen.current = false;
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      setFailed(false);
      return;
    }
    setResult(null);
    setActiveIndex(-1);
    setOpen(wantsOpen.current);
    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      searchAirports(term)
        .then((rows) => {
          if (requestId !== generation.current) return;
          setResult({ query: term, requestId, rows });
          setOpen(wantsOpen.current);
          setActiveIndex(wantsOpen.current && rows.length ? 0 : -1);
        })
        .catch(() => {
          if (requestId !== generation.current) return;
          setResult({ query: term, requestId, rows: [] });
          setFailed(true);
          setOpen(wantsOpen.current);
        })
        .finally(() => {
          if (requestId === generation.current) setLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      if (generation.current === requestId) generation.current += 1;
    };
  }, [query, value]);

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        wantsOpen.current = false;
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, []);

  const selectOption = (option: AirportOption) => {
    // Fence even a captured click/Enter closure from an earlier render. A→B→A
    // searches must not make a prior A result selectable again.
    if (!wantsOpen.current || !result || result.requestId !== generation.current
      || result.query !== currentQuery.current || !result.rows.includes(option)) return;
    generation.current += 1;
    wantsOpen.current = false;
    currentQuery.current = "";
    onChange(option);
    setOpen(false);
    setQuery("");
    setResult(null);
    setLoading(false);
    setFailed(false);
    setActiveIndex(-1);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") {
      wantsOpen.current = false;
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "Escape") {
      wantsOpen.current = false;
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "Enter" && open && !options.length) event.preventDefault();
    if (!options.length || (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter")) return;
    if (event.key === "Enter") {
      if (open && activeIndex >= 0) {
        event.preventDefault();
        selectOption(options[activeIndex]);
      }
      return;
    }
    event.preventDefault();
    wantsOpen.current = true;
    setOpen(true);
    setActiveIndex((current) => event.key === "ArrowDown"
      ? current < options.length - 1 ? current + 1 : 0
      : current > 0 ? current - 1 : options.length - 1);
  };

  return (
    <div className={`airport-field${error ? " planner-invalid" : ""}`} ref={wrapperRef}>
      <label htmlFor={!value ? inputId : undefined}>
        <span>{label}{required && <em className="required-mark"> · {copy("zorunlu", "required")}</em>}</span>
        {value ? (
          <button type="button" className="airport-field-selected" aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} onClick={() => { onChange(null); setQuery(""); window.requestAnimationFrame(() => inputRef.current?.focus()); }} aria-label={`${copy(`${airportTitle(value)} seçimini değiştir`, `Change ${airportTitle(value)} selection`, `Ndrysho zgjedhjen ${airportTitle(value)}`)}${selectedLifecycle ? `. ${lifecycleLabel}` : ""}`}>
            <span>
              <strong>{airportTitle(value)} <em>{value.iata}</em></strong>
              <small>{value.name} · {value.country}</small>
              {selectedLifecycle && <small>{lifecycleLabel}</small>}
            </span>
            <Icon name="close" size={16} />
          </button>
        ) : (
          <input
            ref={inputRef}
            id={inputId}
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
            aria-required={required}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            required={required}
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            placeholder={placeholder || copy("Şehir, ülke veya havalimanı yaz", "Type a city, country or airport")}
            onChange={(event) => {
              const next = event.target.value;
              if (next === query) return;
              generation.current += 1;
              currentQuery.current = next.trim();
              wantsOpen.current = currentQuery.current.length >= 2;
              setQuery(next);
              setResult(null);
              setActiveIndex(-1);
              setOpen(wantsOpen.current);
              setLoading(wantsOpen.current);
              setFailed(false);
            }}
            onFocus={() => {
              wantsOpen.current = query.trim().length >= 2;
              setOpen(wantsOpen.current);
              setActiveIndex(options.length ? 0 : -1);
            }}
            onKeyDown={onInputKeyDown}
          />
        )}
      </label>
      {error && <p id={`${inputId}-error`} className="planner-field-error" role="alert">{error}</p>}
      {open && !value && (
        <div className="airport-field-options" id={listId} role="listbox" aria-busy={loading || undefined} aria-label={copy(`${label} sonuçları`, `${label} results`, `Rezultatet për ${label}`)}>
          {loading && !options.length && <p className="airport-field-note" role="status">{copy("Aranıyor…", "Searching…")}</p>}
          {failed && !loading && <p className="airport-field-note">{copy("Arama şu an yapılamadı. Bağlantını kontrol edip tekrar yaz.", "Search is unavailable. Check your connection and try again.")}</p>}
          {!loading && !failed && !options.length && query.trim().length >= 2 && (
            <p className="airport-field-note">{copy("Sonuç yok. Şehir veya havalimanı adıyla dene.", "No results. Try a city or airport name.")}</p>
          )}
          {options.map((option, index) => (
            <button
              type="button"
              key={option.iata}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={activeIndex === index ? "active" : ""}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              <strong>{airportTitle(option)} <em>{option.iata}</em></strong>
              <small>{option.name} · {option.country}</small>
              {airportLifecycle(option.iata, option.countryCode) && <small>{lifecycleLabel}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
