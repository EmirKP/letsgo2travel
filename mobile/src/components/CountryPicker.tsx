import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { CountryFlag } from "./CountryFlag";
import { useI18n } from "../lib/i18n";

export type CountryPickerOption = {
  code: string;
  name: string;
  meta?: string;
  flagCode?: string;
};

export function CountryPicker({ value, options, onChange, label, placeholder, includeWorldwide = false, disabled = false }: {
  value: string;
  options: CountryPickerOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  includeWorldwide?: boolean;
  disabled?: boolean;
}) {
  const { copy } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.code === value);
  const normalizedQuery = query.trim().toLocaleLowerCase("tr");
  const filtered = useMemo(() => options.filter((option) => {
    if (!normalizedQuery) return true;
    return `${option.name} ${option.meta || ""} ${option.code}`.toLocaleLowerCase("tr").includes(normalizedQuery);
  }), [normalizedQuery, options]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  return <>
    <label className="country-picker-field">
      <span>{label}</span>
      <button type="button" className={`country-picker-trigger ${selected?.meta ? "has-meta" : ""}`.trim()} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {selected ? <CountryFlag code={selected.flagCode || selected.code} label={selected.name} /> : <Icon name="globe" size={20} />}
        <strong>{selected?.name || placeholder}</strong>
        {selected?.meta && <small>{selected.meta}</small>}
        <Icon name="chevron" size={18} />
      </button>
    </label>
    <Sheet open={open} title={label} onClose={() => { setOpen(false); setQuery(""); }} size="large">
      <div className="country-picker-sheet">
        <label className="country-picker-search">
          <Icon name="search" size={18} />
          <input data-autofocus type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Ülke veya dil ara", "Search country or language")} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={copy("Aramayı temizle", "Clear search")}><Icon name="close" size={17} /></button>}
        </label>
        <div className="country-picker-options" role="listbox" aria-label={label}>
          {includeWorldwide && !normalizedQuery && <button type="button" role="option" aria-selected={!value} className={!value ? "selected" : ""} onClick={() => choose("")}><span className="country-picker-world"><Icon name="globe" size={20} /></span><span><strong>{copy("Tüm dünya", "Worldwide")}</strong><small>{copy("Ülke filtresi olmadan ara", "Search without a country filter")}</small></span>{!value && <Icon name="check" size={19} />}</button>}
          {filtered.map((option) => <button type="button" role="option" aria-selected={value === option.code} className={value === option.code ? "selected" : ""} key={option.code} onClick={() => choose(option.code)}>
            <CountryFlag code={option.flagCode || option.code} label={option.name} />
            <span><strong>{option.name}</strong>{option.meta && <small>{option.meta}</small>}</span>
            {value === option.code && <Icon name="check" size={19} />}
          </button>)}
          {!filtered.length && <div className="country-picker-empty"><Icon name="search" size={23} /><strong>{copy("Eşleşen ülke bulunamadı", "No matching country")}</strong><small>{copy("Farklı bir ülke veya dil adı yaz.", "Try another country or language name.")}</small></div>}
        </div>
      </div>
    </Sheet>
  </>;
}
