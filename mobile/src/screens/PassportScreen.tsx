import { useMemo, useState } from "react";
import { COUNTRY_LIST, STATUS_LABEL, STATUS_ORDER, VISA_DATA } from "../data/countries";
import type { Country, VisaStatus } from "../types";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { openExternal } from "../lib/native";

const filters: Array<{ id: "all" | VisaStatus; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "id_card", label: "Kimlikle" },
  { id: "free", label: "Vizesiz" },
  { id: "evisa", label: "e-Vize" },
  { id: "on_arrival", label: "Kapıda" },
  { id: "required", label: "Vize gerekli" },
];

export function PassportScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | VisaStatus>("all");
  const [selected, setSelected] = useState<Country | null>(null);

  const rows = useMemo(() => COUNTRY_LIST
    .filter((country) => country.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")))
    .filter((country) => filter === "all" || VISA_DATA[country.alpha3] === filter)
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[VISA_DATA[a.alpha3] || "required"] - STATUS_ORDER[VISA_DATA[b.alpha3] || "required"];
      return statusDiff || a.name.localeCompare(b.name, "tr");
    }), [filter, query]);

  const counts = useMemo(() => Object.values(VISA_DATA).reduce<Record<VisaStatus, number>>((acc, value) => {
    acc[value] += 1;
    return acc;
  }, { id_card: 0, free: 0, evisa: 0, on_arrival: 0, required: 0 }), []);

  const status = selected ? (VISA_DATA[selected.alpha3] || "required") : "required";
  const officialSearchUrl = selected ? `https://www.google.com/search?q=${encodeURIComponent(`${selected.name} Türkiye vatandaşları vize Dışişleri Bakanlığı`)}` : "";

  return (
    <div className="screen">
      <section className="page-intro passport-intro">
        <span className="page-icon"><Icon name="passport" size={27} /></span>
        <div><small>TÜRKİYE PASAPORTU</small><h1>Pasaport Gücü</h1><p>Ülkeleri giriş kolaylığına göre keşfet. Seyahat öncesinde resmî kaynaklardan son koşulları mutlaka doğrula.</p></div>
      </section>

      <div className="passport-stats">
        <div><strong>{counts.id_card}</strong><span>Kimlikle</span></div>
        <div><strong>{counts.free}</strong><span>Vizesiz</span></div>
        <div><strong>{counts.evisa + counts.on_arrival}</strong><span>Kolay vize</span></div>
      </div>

      <div className="search-input"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ülke ara" /></div>
      <div className="chip-scroll">
        {filters.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>

      <div className="country-list">
        {rows.map((country) => {
          const rowStatus = VISA_DATA[country.alpha3] || "required";
          return (
            <button key={country.alpha3} className="country-row" onClick={() => setSelected(country)}>
              <span className={`status-dot status-${rowStatus}`}><Icon name={rowStatus === "required" ? "lock" : "check"} size={16} /></span>
              <span><strong>{country.name}</strong><small>{country.alpha3}</small></span>
              <em className={`status-pill status-${rowStatus}`}>{STATUS_LABEL[rowStatus]}</em>
              <Icon name="chevron" size={17} />
            </button>
          );
        })}
        {!rows.length && <div className="empty-state compact"><Icon name="search" /><strong>Sonuç bulunamadı</strong><span>Arama kelimesini veya filtreyi değiştir.</span></div>}
      </div>

      <Sheet open={Boolean(selected)} title={selected?.name || "Ülke"} onClose={() => setSelected(null)}>
        {selected && <div className="country-detail">
          <div className={`detail-status status-${status}`}><Icon name={status === "required" ? "lock" : "passport"} size={25} /><div><small>Türkiye pasaportu için</small><strong>{STATUS_LABEL[status]}</strong></div></div>
          <div className="info-box"><Icon name="alert" size={20} /><p>Bu bilgi genel keşif amacı taşır. Kalış süresi, pasaport geçerliliği, transit koşulları ve seyahat amacı sonucu değiştirebilir.</p></div>
          <div className="detail-list">
            <div><span>Ülke kodu</span><strong>{selected.alpha3}</strong></div>
            <div><span>Giriş sınıfı</span><strong>{STATUS_LABEL[status]}</strong></div>
            <div><span>Kontrol önerisi</span><strong>Dışişleri ve konsolosluk</strong></div>
          </div>
          <button className="primary-wide" onClick={() => void openExternal(officialSearchUrl)}><Icon name="external" size={18} /> Resmî kaynağı ara</button>
        </div>}
      </Sheet>
    </div>
  );
}
