import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { airportTitle, searchAirports, type AirportOption } from "../lib/airports";

// Mobil havalimanı seçici: kullanıcı şehir, ülke, havalimanı adı veya
// IATA koduyla arar; IATA bilmek zorunda değildir. Sonuç satırı ad,
// şehir, ülke ve IATA gösterir. Arama sunucudadır (ortak /api/airports).

type AirportFieldProps = {
  label: string;
  value: AirportOption | null;
  onChange: (option: AirportOption | null) => void;
  placeholder?: string;
  required?: boolean;
};

export function AirportField({ label, value, onChange, placeholder, required = false }: AirportFieldProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const generation = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();

  useEffect(() => {
    // Alan temizlendiğinde veya seçim yapıldığında da önceki ağ cevabını
    // geçersiz kıl; geç gelen sonuç kapatılmış listeyi yeniden açmasın.
    const requestId = ++generation.current;
    const term = query.trim();
    if (value || term.length < 2) {
      setOptions([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      searchAirports(term)
        .then((rows) => {
          if (requestId !== generation.current) return;
          setOptions(rows);
          setOpen(true);
          setActiveIndex(rows.length ? 0 : -1);
        })
        .catch(() => {
          if (requestId !== generation.current) return;
          setOptions([]);
          setFailed(true);
          setOpen(true);
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
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, []);

  const selectOption = (option: AirportOption) => {
    onChange(option);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!options.length || (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter")) return;
    if (event.key === "Enter") {
      if (open && activeIndex >= 0) {
        event.preventDefault();
        selectOption(options[activeIndex]);
      }
      return;
    }
    event.preventDefault();
    setOpen(true);
    setActiveIndex((current) => event.key === "ArrowDown"
      ? current < options.length - 1 ? current + 1 : 0
      : current > 0 ? current - 1 : options.length - 1);
  };

  return (
    <div className="airport-field" ref={wrapperRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <label htmlFor={!value ? inputId : undefined}>
        <span>{label}{required && <em className="required-mark"> · zorunlu</em>}</span>
        {value ? (
          <button type="button" className="airport-field-selected" onClick={() => { onChange(null); setQuery(""); window.requestAnimationFrame(() => inputRef.current?.focus()); }} aria-label={`${airportTitle(value)} seçimini değiştir`}>
            <span>
              <strong>{airportTitle(value)} <em>{value.iata}</em></strong>
              <small>{value.name} · {value.country}</small>
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
            required={required}
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            placeholder={placeholder || "Şehir, ülke veya havalimanı yaz"}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => { if (options.length) setOpen(true); }}
            onKeyDown={onInputKeyDown}
          />
        )}
      </label>
      {open && !value && (
        <div className="airport-field-options" id={listId} role="listbox" aria-label={`${label} sonuçları`}>
          {loading && !options.length && <p className="airport-field-note">Aranıyor…</p>}
          {failed && !loading && <p className="airport-field-note">Arama şu an yapılamadı. Bağlantını kontrol edip tekrar yaz.</p>}
          {!loading && !failed && !options.length && query.trim().length >= 2 && (
            <p className="airport-field-note">Sonuç yok. Şehir veya havalimanı adıyla dene.</p>
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
