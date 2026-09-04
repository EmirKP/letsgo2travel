import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { useI18n } from "../lib/i18n";
import type { VerifiedVisaRule } from "../types";

const MFA_SOURCE = "https://www.mfa.gov.tr/turk-vatandaslarinin-tabi-oldugu-vize-uygulamalari.tr.mfa";
const COUNTRY_BY_ALPHA3 = new Map(COUNTRY_LIST.map((country) => [country.alpha3, country]));
const INITIAL_ROW_COUNT = 40;

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
  const { copy, countryName, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | VisaStatus>("all");
  const [selected, setSelected] = useState<Country | null>(null);
  const [verifiedRule, setVerifiedRule] = useState<VerifiedVisaRule | null>(null);
  const [ruleLoading, setRuleLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_ROW_COUNT);
  const ruleRequest = useRef(0);
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(() => COUNTRY_LIST
    .filter((country) => `${country.name} ${countryName(country.alpha3, country.name)}`.toLocaleLowerCase(locale).includes(deferredQuery.toLocaleLowerCase(locale)))
    .filter((country) => filter === "all" || statusOf(country.alpha3) === filter)
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[statusOf(a.alpha3)] - STATUS_ORDER[statusOf(b.alpha3)];
      return statusDiff || countryName(a.alpha3, a.name).localeCompare(countryName(b.alpha3, b.name), locale);
    }), [countryName, deferredQuery, filter, locale]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);

  useEffect(() => setVisibleCount(INITIAL_ROW_COUNT), [deferredQuery, filter]);

  // Harita her ülke path'i için çalıştığından O(n) arama yerine sabit
  // zamanda üyelik kontrolü kullanılır; filtreleme sırasında ek yük oluşmaz.
  const highlightedAlpha3 = useMemo(() => new Set(rows.map((country) => country.alpha3)), [rows]);

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
    <div className="screen passport-screen">
      <section className="page-intro passport-intro">
        <span className="page-icon"><Icon name="passport" size={27} /></span>
        <div><small>{copy("TÜRKİYE PASAPORTU", "TURKISH PASSPORT")}</small><h1>{copy("Pasaport Gücü", "Passport Power")}</h1><p>{copy("Ülkeleri giriş kolaylığına göre keşfet. Seyahat öncesinde resmî kaynaklardan son koşulları mutlaka doğrula.", "Explore countries by entry ease. Always verify the latest rules with official sources before travel.")}</p></div>
      </section>

      <div className="passport-stats">
        <div><strong>{counts.id_card}</strong><span>{copy("Kimlikle", "ID card")}</span></div>
        <div><strong>{counts.free}</strong><span>{copy("Vizesiz", "Visa-free")}</span></div>
        <div><strong>{counts.evisa + counts.on_arrival}</strong><span>{copy("Kolay vize", "Easy visa")}</span></div>
      </div>

      <p id="passport-map-help" className="passport-map-help"><strong>{copy("Haritayı kullan:", "Use the map:")}</strong> {copy("İki parmakla yalnız haritayı 8 kata kadar yakınlaştır, sürükleyerek gez veya tam ekran aç; ayrıntı için ülkeye dokun.", "Pinch to zoom only the map up to 8×, drag to explore or open full screen; tap a country for details.")}</p>

      {/* Etkileşimli dünya haritası: arama/filtre ile senkron; ülkeye
          dokununca liste ile AYNI detay sayfası açılır. Eşleşmeyen
          ülkeler için veri uydurulmaz; "Bilinmiyor" gösterilir. */}
      <Suspense fallback={<div className="passport-map passport-map-loading" aria-label={copy("Harita yükleniyor", "Map loading")} />}>
      <PassportWorldMap
        statusFor={(alpha3) => (alpha3 ? statusOf(alpha3) : "unknown") as MapStatus}
        isHighlighted={(alpha3) => {
          if (!alpha3) return !deferredQuery && filter === "all";
          if (!COUNTRY_BY_ALPHA3.has(alpha3)) return !deferredQuery && filter === "all";
          return highlightedAlpha3.has(alpha3);
        }}
        selectedAlpha3={selected?.alpha3 || null}
        onSelectCountry={(alpha3) => {
          const country = COUNTRY_BY_ALPHA3.get(alpha3);
          if (country) void openCountry(country);
        }}
      />
      </Suspense>
      <div className="passport-map-legend" role="list" aria-label={copy("Harita renk açıklaması", "Map colour legend")}>
        {(["id_card", "free", "evisa", "on_arrival", "required"] as const).map((status) => (
          <span key={status} role="listitem" className={`legend-chip legend-${status}`}>{copy(STATUS_LABEL[status], ({ id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "Visa on arrival", required: "Visa required" } as const)[status])}</span>
        ))}
        <span role="listitem" className="legend-chip legend-unknown">{copy("Bilinmiyor", "Unknown")}</span>
      </div>

      <label className="sr-only" htmlFor="passport-country-search">{copy("Ülke ara", "Search country")}</label>
      <div className="search-input"><Icon name="search" size={18} /><input id="passport-country-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Ülke ara", "Search country")} /></div>
      <div className="chip-scroll" role="group" aria-label={copy("Giriş durumuna göre filtrele", "Filter by entry status")}>
        {filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{copy(item.label, ({ all: "All", id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "On arrival", required: "Visa required", unknown: "Unknown" } as const)[item.id])}</button>)}
      </div>

      <div className="country-results-summary" role="status"><strong>{rows.length} {copy("ülke", "countries")}</strong><span>{copy("Listeden veya haritadan bir ülkeye dokun.", "Tap a country in the list or on the map.")}</span></div>

      <div className="country-list">
        {visibleRows.map((country) => {
          const rowStatus = statusOf(country.alpha3);
          return (
            <button key={country.alpha3} className="country-row" onClick={() => void openCountry(country)}>
              <span className={`status-dot status-${rowStatus}`}><Icon name={rowStatus === "required" ? "lock" : rowStatus === "unknown" ? "alert" : "check"} size={16} /></span>
              <span><strong>{countryName(country.alpha3, country.name)}</strong><small>{country.alpha3}</small></span>
              <em className={`status-pill status-${rowStatus}`}>{copy(STATUS_LABEL[rowStatus], ({ id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "On arrival", required: "Visa required", unknown: "Unknown" } as const)[rowStatus])}</em>
              <Icon name="chevron" size={17} />
            </button>
          );
        })}
        {!rows.length && <div className="empty-state compact"><Icon name="search" /><strong>{copy("Sonuç bulunamadı", "No results")}</strong><span>{copy("Arama kelimesini veya filtreyi değiştir.", "Change the search or filter.")}</span></div>}
        {visibleRows.length < rows.length && <button className="country-load-more" onClick={() => setVisibleCount((current) => Math.min(rows.length, current + INITIAL_ROW_COUNT))}>{copy("Daha fazla ülke göster", "Show more countries")} <span>{visibleRows.length}/{rows.length}</span></button>}
      </div>

      <Sheet open={Boolean(selected)} title={selected ? countryName(selected.alpha3, selected.name) : copy("Ülke", "Country")} onClose={closeCountry}>
        {selected && <div className="country-detail">
          <div className={`detail-status status-${status}`}><Icon name={status === "required" ? "lock" : "passport"} size={25} /><div><small>{copy("Türkiye pasaportu için", "For a Turkish passport")}</small><strong>{copy(verifiedRule?.label || STATUS_LABEL[status], ({ id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "Visa on arrival", required: "Visa required", unknown: "Unknown" } as const)[status])}</strong></div></div>
          {ruleLoading ? <div className="skeleton-list"><div /></div> : <div className="info-box"><Icon name="alert" size={20} /><p>{(locale === "tr" ? verifiedRule?.note : "") || (status === "unknown"
            ? copy("Bu ülke için doğrulanmış giriş sınıfı verimiz yok; tahmin gösterilmez. Güncel koşulu resmî kaynaktan kontrol et.", "We have no verified entry classification for this country, so no guess is shown. Check an official source.")
            : copy("Bu sınıf genel keşif içindir. Kalış süresi, pasaport geçerliliği, transit koşulları ve seyahat amacı sonucu değiştirebilir.", "This category is for general discovery. Stay length, passport validity, transit and travel purpose can change the result."))}</p></div>}
          <div className="detail-list">
            <div><span>{copy("Ülke kodu", "Country code")}</span><strong>{selected.alpha3}</strong></div>
            <div><span>{copy("Giriş sınıfı", "Entry category")}</span><strong>{copy(verifiedRule?.label || STATUS_LABEL[status], ({ id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "Visa on arrival", required: "Visa required", unknown: "Unknown" } as const)[status])}</strong></div>
            <div><span>{copy("Son veri kontrolü", "Last checked")}</span><strong>{verifiedRule?.verifiedAt || copy("Resmî kaynaktan doğrula", "Verify officially")}</strong></div>
          </div>
          <button className="primary-wide" onClick={() => void openExternal(verifiedRule?.sourceUrl || MFA_SOURCE)}><Icon name="external" size={18} /> {copy("Dışişleri kaynağını aç", "Open official source")}</button>
          <p className="legal-note">{copy("Koşullar değişebilir. Bilet almadan önce havayolu, konsolosluk ve Dışişleri Bakanlığı bilgisini birlikte doğrula.", "Rules can change. Cross-check the airline, consulate and Ministry information before booking.")}</p>
        </div>}
      </Sheet>
    </div>
  );
}
