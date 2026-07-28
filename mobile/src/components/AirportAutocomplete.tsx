import { useEffect, useId, useRef, useState } from "react";
import { searchAirports } from "../lib/api";
import type { AirportOption } from "../types";
import { Icon } from "./Icon";

const POPULAR: AirportOption[] = [
  { id: "IST", name: "İstanbul", countryName: "Türkiye", type: "city", code: "IST" },
  { id: "SAW", name: "İstanbul Sabiha Gökçen", countryName: "Türkiye", type: "airport", code: "SAW" },
  { id: "ESB", name: "Ankara", countryName: "Türkiye", type: "city", code: "ESB" },
  { id: "ADB", name: "İzmir", countryName: "Türkiye", type: "city", code: "ADB" },
  { id: "AYT", name: "Antalya", countryName: "Türkiye", type: "city", code: "AYT" },
  { id: "DXB", name: "Dubai", countryName: "Birleşik Arap Emirlikleri", type: "city", code: "DXB" },
  { id: "LON", name: "Londra", countryName: "Birleşik Krallık", type: "city", code: "LON" },
  { id: "PAR", name: "Paris", countryName: "Fransa", type: "city", code: "PAR" },
  { id: "ROM", name: "Roma", countryName: "İtalya", type: "city", code: "ROM" },
  { id: "BKK", name: "Bangkok", countryName: "Tayland", type: "city", code: "BKK" },
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
  const [query, setQuery] = useState(value.label);
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => setQuery(value.label), [value.label]);

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2 || (value.code && normalized === value.label)) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchAirports(normalized);
        setOptions(results.length ? results : POPULAR.filter((item) => labelOf(item).toLocaleLowerCase("tr-TR").includes(normalized.toLocaleLowerCase("tr-TR"))));
      } catch {
        setOptions(POPULAR.filter((item) => labelOf(item).toLocaleLowerCase("tr-TR").includes(normalized.toLocaleLowerCase("tr-TR"))));
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, query, value.code, value.label]);

  const choose = (option: AirportOption) => {
    const next = labelOf(option);
    setQuery(next);
    onChange({ code: option.code, label: next });
    setOpen(false);
  };

  return (
    <div className="airport-field">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-icon">
        <Icon name="plane" size={18} />
        <input
          id={id}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
            setOpen(true);
            if (!query) setOptions(POPULAR.slice(0, 6));
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 180);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange({ code: "", label: event.target.value });
            setOpen(true);
            if (!event.target.value) setOptions(POPULAR.slice(0, 6));
          }}
        />
        {loading && <span className="mini-loader" aria-label="Aranıyor" />}
      </div>
      {open && (options.length > 0 || loading) && (
        <div className="autocomplete-list" role="listbox">
          {options.map((option) => (
            <button type="button" key={`${option.id}-${option.code}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
              <span className="autocomplete-code">{option.code}</span>
              <span><strong>{option.name}</strong><small>{option.countryName || option.type}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
