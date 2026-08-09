import { useEffect, useId, useRef, useState } from "react";
import { searchAirports } from "../lib/api";
import type { AirportOption } from "../types";
import { Icon } from "./Icon";

const POPULAR: AirportOption[] = [
  { id: "IST", name: "İstanbul Havalimanı", countryName: "Türkiye", type: "airport", code: "IST" },
  { id: "SAW", name: "İstanbul Sabiha Gökçen", countryName: "Türkiye", type: "airport", code: "SAW" },
  { id: "ESB", name: "Ankara Esenboğa", countryName: "Türkiye", type: "airport", code: "ESB" },
  { id: "ADB", name: "İzmir Adnan Menderes", countryName: "Türkiye", type: "airport", code: "ADB" },
  { id: "AYT", name: "Antalya Havalimanı", countryName: "Türkiye", type: "airport", code: "AYT" },
  { id: "DXB", name: "Dubai International", countryName: "Birleşik Arap Emirlikleri", type: "airport", code: "DXB" },
  { id: "LHR", name: "London Heathrow", countryName: "Birleşik Krallık", type: "airport", code: "LHR" },
  { id: "CDG", name: "Paris Charles de Gaulle", countryName: "Fransa", type: "airport", code: "CDG" },
  { id: "FCO", name: "Roma Fiumicino", countryName: "İtalya", type: "airport", code: "FCO" },
  { id: "BKK", name: "Bangkok Suvarnabhumi", countryName: "Tayland", type: "airport", code: "BKK" },
];

function labelOf(option: AirportOption) {
  return `${option.name}${option.countryName ? `, ${option.countryName}` : ""} (${option.code})`;
}

export function AirportAutocomplete({ label, value, onChange, placeholder }: {
  label: string;
  value: { code: string; label: string };
  onChange: (value: { code: string; label: string }) => void;
  placeholder: string;
}) {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const [query, setQuery] = useState(value.label);
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value.label), [value.label]);

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2 || (value.code && normalized === value.label)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchAirports(normalized);
        if (!cancelled) {
          setOptions(results.length ? results : POPULAR.filter((item) => labelOf(item).toLocaleLowerCase("tr-TR").includes(normalized.toLocaleLowerCase("tr-TR"))));
          setActiveIndex(-1);
        }
      } catch {
        if (!cancelled) {
          setOptions(POPULAR.filter((item) => labelOf(item).toLocaleLowerCase("tr-TR").includes(normalized.toLocaleLowerCase("tr-TR"))));
          setActiveIndex(-1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, value.code, value.label]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => () => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
  }, []);

  const choose = (option: AirportOption) => {
    const next = labelOf(option);
    setQuery(next);
    onChange({ code: option.code, label: next });
    setOpen(false);
    setLoading(false);
    setActiveIndex(-1);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!open) setOpen(true);
    if (!options.length) {
      const popular = POPULAR.slice(0, 6);
      setOptions(popular);
      setActiveIndex(direction === 1 ? 0 : popular.length - 1);
      return;
    }
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : options.length - 1;
      return (current + direction + options.length) % options.length;
    });
  };

  const activeOptionId = open && activeIndex >= 0 && options[activeIndex]
    ? `${id}-option-${activeIndex}`
    : undefined;

  return (
    <div className="airport-field">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-icon">
        <Icon name="plane" size={18} />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
            setOpen(true);
            setLoading(false);
            setActiveIndex(-1);
            if (!query.trim() || (value.code && query === value.label)) setOptions(POPULAR.slice(0, 6));
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => {
              setOpen(false);
              setLoading(false);
              setActiveIndex(-1);
            }, 180);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            onChange({ code: "", label: nextQuery });
            setOpen(true);
            setLoading(false);
            setActiveIndex(-1);
            if (!nextQuery) setOptions(POPULAR.slice(0, 6));
            else if (nextQuery.trim().length < 2) setOptions([]);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === "Home" && open && options.length) {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End" && open && options.length) {
              event.preventDefault();
              setActiveIndex(options.length - 1);
            } else if (event.key === "Enter" && open && activeIndex >= 0 && options[activeIndex]) {
              event.preventDefault();
              choose(options[activeIndex]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
              setLoading(false);
              setActiveIndex(-1);
            } else if (event.key === "Tab") {
              setOpen(false);
              setLoading(false);
              setActiveIndex(-1);
            }
          }}
        />
        {loading && <span className="mini-loader" aria-hidden="true" />}
        <span className="sr-only" role="status" aria-live="polite">{loading ? "Havalimanları aranıyor" : ""}</span>
      </div>
      {open && (options.length > 0 || loading) && (
        <div ref={listRef} id={listboxId} className="autocomplete-list" role="listbox" aria-label={`${label} seçenekleri`} aria-busy={loading}>
          {options.map((option, index) => (
            <button
              type="button"
              id={`${id}-option-${index}`}
              data-option-index={index}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              tabIndex={-1}
              key={`${option.id}-${option.code}`}
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span className="autocomplete-code">{option.code}</span>
              <span><strong>{option.name}</strong><small>{option.countryName || option.type}</small></span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && query.trim().length >= 2 && options.length === 0 && (
        <div className="autocomplete-list autocomplete-empty" role="status">Sonuç bulunamadı. Şehir veya havalimanı adını değiştir.</div>
      )}
    </div>
  );
}
