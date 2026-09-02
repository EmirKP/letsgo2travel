import { Suspense, lazy, useMemo, useRef, useState } from "react";
import { COUNTRY_LIST, STATUS_LABEL, STATUS_ORDER, VISA_DATA } from "../data/countries";
import type { MapStatus } from "../components/PassportWorldMap";

// Harita geometrisi (~135 KB) ana pakete girmesin diye tembel yüklenir;
// ekran açılırken kısa bir yer tutucu görünür.
const PassportWorldMap = lazy(() => import("../components/PassportWorldMap").then((mod) => ({ default: mod.PassportWorldMap })));
import type { Country, VisaStatus } from "../types";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { openExternal } from "../lib/native";
import { getVisaEntryRule } from "../lib/api";
import type { VerifiedVisaRule } from "../types";

const MFA_SOURCE = "https://www.mfa.gov.tr/turk-vatandaslarinin-tabi-oldugu-vize-uygulamalari.tr.mfa";

const filters: Array<{ id: "all" | VisaStatus; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "id_card", label: "Kimlikle" },
  { id: "free", label: "Vizesiz" },
  { id: "evisa", label: "e-Vize" },
  { id: "on_arrival", label: "Kapıda" },
  { id: "required", label: "Vize gerekli" },
  { id: "unknown", label: "Bilinmiyor" },
];

// Doğrulanmış sınıfı olmayan ülke için veri UYDURULMAZ: "Bilinmiyor".
function statusOf(alpha3: string): VisaStatus {
  return VISA_DATA[alpha3] || "unknown";
}

export function PassportScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | VisaStatus>("all");
  const [selected, setSelected] = useState<Country | null>(null);
  const [verifiedRule, setVerifiedRule] = useState<VerifiedVisaRule | null>(null);
  const [ruleLoading, setRuleLoading] = useState(false);
  const ruleRequest = useRef(0);

  const rows = useMemo(() => COUNTRY_LIST
    .filter((country) => country.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")))
    .filter((country) => filter === "all" || statusOf(country.alpha3) === filter)
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[statusOf(a.alpha3)] - STATUS_ORDER[statusOf(b.alpha3)];
      return statusDiff || a.name.localeCompare(b.name, "tr");
    }), [filter, query]);

  const counts = useMemo(() => COUNTRY_LIST.reduce<Record<VisaStatus, number>>((acc, country) => {
    acc[statusOf(country.alpha3)] += 1;
    return acc;
  }, { id_card: 0, free: 0, evisa: 0, on_arrival: 0, required: 0, unknown: 0 }), []);

  const status = selected ? statusOf(selected.alpha3) : "unknown";
  const openCountry = async (country: Country) => {
    const requestId = ++ruleRequest.current;
    setSelected(country);
    setVerifiedRule(null);
    setRuleLoading(true);
    try {
      const rule = await getVisaEntryRule(country.name);
      if (requestId === ruleRequest.current) setVerifiedRule(rule);
    } catch {
      // Statik sınıf listesi çevrimdışıyken de çalışır; resmî kaynak bağlantısı korunur.
    } finally {
      if (requestId === ruleRequest.current) setRuleLoading(false);
    }
  };

  const closeCountry = () => {
    ruleRequest.current += 1;
    setSelected(null);
    setVerifiedRule(null);
    setRuleLoading(false);
  };

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

      {/* Etkileşimli dünya haritası: arama/filtre ile senkron; ülkeye
          dokununca liste ile AYNI detay sayfası açılır. Eşleşmeyen
          ülkeler için veri uydurulmaz; "Bilinmiyor" gösterilir. */}
      <Suspense fallback={<div className="passport-map passport-map-loading" aria-label="Harita yükleniyor" />}>
      <PassportWorldMap
        statusFor={(alpha3) => (alpha3 ? statusOf(alpha3) : "unknown") as MapStatus}
        isHighlighted={(alpha3) => {
          if (!alpha3) return !query && filter === "all";
          const country = COUNTRY_LIST.find((item) => item.alpha3 === alpha3);
          if (!country) return !query && filter === "all";
          return rows.some((row) => row.alpha3 === alpha3);
        }}
        selectedAlpha3={selected?.alpha3 || null}
        onSelectCountry={(alpha3) => {
          const country = COUNTRY_LIST.find((item) => item.alpha3 === alpha3);
          if (country) void openCountry(country);
        }}
      />
      </Suspense>
      <div className="passport-map-legend" role="list" aria-label="Harita renk açıklaması">
        {(["id_card", "free", "evisa", "on_arrival", "required"] as const).map((status) => (
          <span key={status} role="listitem" className={`legend-chip legend-${status}`}>{STATUS_LABEL[status]}</span>
        ))}
        <span role="listitem" className="legend-chip legend-unknown">Bilinmiyor</span>
      </div>

      <label className="sr-only" htmlFor="passport-country-search">Ülke ara</label>
      <div className="search-input"><Icon name="search" size={18} /><input id="passport-country-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ülke ara" /></div>
      <div className="chip-scroll" role="group" aria-label="Giriş durumuna göre filtrele">
        {filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>

      <div className="country-list">
        {rows.map((country) => {
          const rowStatus = statusOf(country.alpha3);
          return (
            <button key={country.alpha3} className="country-row" onClick={() => void openCountry(country)}>
              <span className={`status-dot status-${rowStatus}`}><Icon name={rowStatus === "required" ? "lock" : rowStatus === "unknown" ? "alert" : "check"} size={16} /></span>
              <span><strong>{country.name}</strong><small>{country.alpha3}</small></span>
              <em className={`status-pill status-${rowStatus}`}>{STATUS_LABEL[rowStatus]}</em>
              <Icon name="chevron" size={17} />
            </button>
          );
        })}
        {!rows.length && <div className="empty-state compact"><Icon name="search" /><strong>Sonuç bulunamadı</strong><span>Arama kelimesini veya filtreyi değiştir.</span></div>}
      </div>

      <Sheet open={Boolean(selected)} title={selected?.name || "Ülke"} onClose={closeCountry}>
        {selected && <div className="country-detail">
          <div className={`detail-status status-${status}`}><Icon name={status === "required" ? "lock" : "passport"} size={25} /><div><small>Türkiye pasaportu için</small><strong>{verifiedRule?.label || STATUS_LABEL[status]}</strong></div></div>
          {ruleLoading ? <div className="skeleton-list"><div /></div> : <div className="info-box"><Icon name="alert" size={20} /><p>{verifiedRule?.note || (status === "unknown"
            ? "Bu ülke için doğrulanmış giriş sınıfı verimiz yok; tahmin gösterilmez. Güncel koşulu resmî kaynaktan kontrol et."
            : "Bu sınıf genel keşif içindir. Kalış süresi, pasaport geçerliliği, transit koşulları ve seyahat amacı sonucu değiştirebilir.")}</p></div>}
          <div className="detail-list">
            <div><span>Ülke kodu</span><strong>{selected.alpha3}</strong></div>
            <div><span>Giriş sınıfı</span><strong>{verifiedRule?.label || STATUS_LABEL[status]}</strong></div>
            <div><span>Son veri kontrolü</span><strong>{verifiedRule?.verifiedAt || "Resmî kaynaktan doğrula"}</strong></div>
          </div>
          <button className="primary-wide" onClick={() => void openExternal(verifiedRule?.sourceUrl || MFA_SOURCE)}><Icon name="external" size={18} /> Dışişleri kaynağını aç</button>
          <p className="legal-note">Koşullar değişebilir. Bilet almadan önce havayolu, konsolosluk ve Dışişleri Bakanlığı bilgisini birlikte doğrula.</p>
        </div>}
      </Sheet>
    </div>
  );
}
