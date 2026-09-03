import { useEffect, useRef, useState } from "react";
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
};

export function AirportField({ label, value, onChange, placeholder }: AirportFieldProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    // Alan temizlendiğinde veya seçim yapıldığında da önceki ağ cevabını
    // geçersiz kıl; geç gelen sonuç kapatılmış listeyi yeniden açmasın.
    const requestId = ++generation.current;
    const term = query.trim();
    if (value || term.length < 2) {
      setOptions([]);
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

  return (
    <div className="airport-field">
      <label>
        {label}
        {value ? (
          <button type="button" className="airport-field-selected" onClick={() => { onChange(null); setQuery(""); }}>
            <span>
              <strong>{airportTitle(value)} <em>{value.iata}</em></strong>
              <small>{value.name} · {value.country}</small>
            </span>
            <Icon name="close" size={16} />
          </button>
        ) : (
          <input
            value={query}
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            placeholder={placeholder || "Şehir, ülke veya havalimanı yaz"}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => { if (options.length) setOpen(true); }}
          />
        )}
      </label>
      {open && !value && (
        <div className="airport-field-options" role="listbox">
          {loading && !options.length && <p className="airport-field-note">Aranıyor…</p>}
          {failed && !loading && <p className="airport-field-note">Arama şu an yapılamadı. Bağlantını kontrol edip tekrar yaz.</p>}
          {!loading && !failed && !options.length && query.trim().length >= 2 && (
            <p className="airport-field-note">Sonuç yok. Şehir veya havalimanı adıyla dene.</p>
          )}
          {options.map((option) => (
            <button
              type="button"
              key={option.iata}
              role="option"
              aria-selected={false}
              onClick={() => { onChange(option); setOpen(false); setQuery(""); }}
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
