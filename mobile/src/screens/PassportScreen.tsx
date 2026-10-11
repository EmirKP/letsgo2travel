import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from "react";
import { COUNTRY_LIST } from "../data/countries";
import passportIndex from "../data/passport-index.json";
import { passportEntry, passportStayLabel, PASSPORTS, MFA_CHECKED, type EntryStatus } from "../../../lib/country-intelligence/passports";
import { CountryPicker } from "../components/CountryPicker";
import type { MapStatus } from "../components/PassportWorldMap";

// Harita geometrisi (~135 KB) ana pakete girmesin diye tembel yüklenir;
// ekran açılırken kısa bir yer tutucu görünür.
const PassportWorldMap = lazy(() => import("../components/PassportWorldMap").then((mod) => ({ default: mod.PassportWorldMap })));
import type { Country } from "../types";
import { Icon } from "../components/Icon";
import { PageHero } from "../components/PageHero";
import { CountryAdvisory, CountryRiskBadge } from "../components/CountryAdvisory";
import { useAdvisories } from "../lib/countryIntelligence";
import { CountryFlag } from "../components/CountryFlag";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { Sheet } from "../components/Sheet";
import { openExternal } from "../lib/native";
import { useI18n } from "../lib/i18n";
import { usePassportPreference } from "../hooks/usePassportPreference";
import "./profile-passport-polish.css";

const COUNTRY_BY_ALPHA3 = new Map(COUNTRY_LIST.map((country) => [country.alpha3, country]));
const INITIAL_ROW_COUNT = 40;

const filters: Array<{ id: "all" | EntryStatus; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "id_card", label: "Kimlikle" },
  { id: "free", label: "Vizesiz" },
  { id: "evisa", label: "e-Vize" },
  { id: "on_arrival", label: "Kapıda" },
  { id: "required", label: "Vize gerekli" },
  { id: "eta", label: "Seyahat izni" },
  { id: "restricted", label: "Kısıtlı giriş" },
  { id: "unknown", label: "Doğrulama gerekli" },
];

const ENTRY_LABELS: Record<EntryStatus, [string, string, string]> = {
  id_card: ["Kimlikle", "ID card", "Letërnjoftim"], free: ["Vizesiz", "Visa-free", "Pa vizë"], evisa: ["e-Vize", "e-Visa", "e-Vizë"], on_arrival: ["Kapıda vize", "Visa on arrival", "Vizë në mbërritje"], required: ["Vize gerekli", "Visa required", "Kërkohet vizë"], eta: ["Seyahat izni (ETA)", "Travel authorisation (ETA)", "Autorizim udhëtimi (ETA)"], restricted: ["Kısıtlı giriş", "Restricted entry", "Hyrje e kufizuar"], unknown: ["Doğrulama gerekli", "Verification needed", "Nevojitet verifikim"], domestic: ["Kendi ülken", "Your own country", "Shteti yt"],
};
const ENTRY_ORDER: Record<EntryStatus, number> = { domestic: 0, id_card: 1, free: 2, eta: 3, evisa: 4, on_arrival: 5, required: 6, restricted: 7, unknown: 8 };

// Doğrulanmış sınıfı olmayan ülke için veri UYDURULMAZ: "Bilinmiyor".

export function PassportScreen({ onOpenCountryNews }: { onOpenCountryNews: (code: string) => void }) {
  const { copy, countryName, locale } = useI18n();
  const { country: passport, type: passportType, setPreference } = usePassportPreference();
  const passportName = new Intl.DisplayNames([locale], { type: "region" }).of(passport) || passport;
  const passportOptions = useMemo(() => { const names = new Intl.DisplayNames([locale], { type: "region" }); return Object.keys(PASSPORTS).map(code => ({ code, name: names.of(code) || code })).sort((a,b) => a.name.localeCompare(b.name, locale)); }, [locale]);
  const entryOf = useMemo(() => (alpha3: string) => passportEntry(passport, passportType, alpha2FromAlpha3(alpha3)), [passport, passportType]);
  const statusOf = useMemo(() => (alpha3: string): EntryStatus => entryOf(alpha3).status, [entryOf]);
  const labelOf = (status: EntryStatus) => copy(...ENTRY_LABELS[status]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | EntryStatus>("all");
  const [selected, setSelected] = useState<Country | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_ROW_COUNT);
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(() => COUNTRY_LIST
    .filter(country => alpha2FromAlpha3(country.alpha3) !== passport)
    .filter((country) => `${country.name} ${countryName(country.alpha3, country.name)}`.toLocaleLowerCase(locale).includes(deferredQuery.toLocaleLowerCase(locale)))
    .filter((country) => filter === "all" || statusOf(country.alpha3) === filter)
    .sort((a, b) => {
      const statusDiff = ENTRY_ORDER[statusOf(a.alpha3)] - ENTRY_ORDER[statusOf(b.alpha3)];
      return statusDiff || countryName(a.alpha3, a.name).localeCompare(countryName(b.alpha3, b.name), locale);
    }), [countryName, deferredQuery, filter, locale, passport, statusOf]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const risks = useAdvisories(visibleRows.map(row => alpha2FromAlpha3(row.alpha3)));

  useEffect(() => setVisibleCount(INITIAL_ROW_COUNT), [deferredQuery, filter, passport, passportType]);

  // Harita her ülke path'i için çalıştığından O(n) arama yerine sabit
  // zamanda üyelik kontrolü kullanılır; filtreleme sırasında ek yük oluşmaz.
  const highlightedAlpha3 = useMemo(() => new Set(rows.map((country) => country.alpha3)), [rows]);

  const counts = useMemo(() => COUNTRY_LIST.reduce<Record<EntryStatus, number>>((acc, country) => {
    acc[statusOf(country.alpha3)] += 1;
    return acc;
  }, { id_card: 0, free: 0, evisa: 0, on_arrival: 0, required: 0, unknown: 0, eta: 0, restricted: 0, domestic: 0 }), [statusOf]);

  const entry = selected ? entryOf(selected.alpha3) : null;
  const status = entry?.status || "unknown";
  const officialCount = COUNTRY_LIST.filter(country => entryOf(country.alpha3).provenance === "official" && statusOf(country.alpha3) !== "domestic").length;
  const openCountry = (country: Country) => setSelected(country);
  const closeCountry = () => setSelected(null);

  return (
    <div className="screen passport-screen passport-polished">
      <PageHero scene="passport" title={copy("Pasaport Gücü", "Passport Power")} subtitle={copy("Pasaportunla nerelere gidebilirsin?", "Where can your passport take you?")} />

      <section className="passport-overview-card" aria-labelledby="passport-choice-heading">
      <div className="passport-identity"><div className="passport-book" aria-hidden="true"><span>LetsGo<span>2</span>Travel</span><Icon name="globe" size={36}/><i/><Icon name="passport" size={16}/></div><div><span className="passport-eyebrow">{copy("DÜNYAYA AÇILAN KAPIN", "YOUR GATEWAY TO THE WORLD", "PORTA JOTE DREJT BOTËS")}</span><h2 id="passport-choice-heading">{copy("Pasaportun", "Your passport")}</h2><p>{copy("Ülkelerin giriş koşullarını buna göre gösterelim.", "See entry guidance for your passport.")}</p></div></div>
      <div className="passport-selection">
        <CountryPicker value={passport} options={passportOptions} label={copy("Pasaport ülkesi", "Passport country")} placeholder={copy("Ülke seç", "Choose country")} onChange={code => { closeCountry(); setPreference(code, passportType); setFilter("all"); }}/>
        <label>{copy("Pasaport türü", "Passport type")}<select value={passportType} onChange={event => { closeCountry(); setPreference(passport, event.target.value); setFilter("all"); }}><option value="ordinary">{copy("Umuma mahsus", "Ordinary")}</option><option value="special">{copy("Hususi", "Special")}</option><option value="service">{copy("Hizmet", "Service")}</option><option value="diplomatic">{copy("Diplomatik", "Diplomatic")}</option></select></label>
      </div>
      <div className="passport-stats">
        <div><span className="passport-stat-icon"><Icon name="passport" size={19}/></span><strong>{counts.free}</strong><span>{copy("Vizesiz*", "Visa-free*")}</span></div>
        <div><span className="passport-stat-icon"><Icon name="globe" size={19}/></span><strong>{counts.evisa + counts.on_arrival}</strong><span>{copy("e-Vize / kapıda*", "e-Visa / arrival*")}</span></div>
        <div><span className="passport-stat-icon"><Icon name="check" size={19}/></span><strong>{counts.id_card}</strong><span>{copy("Kimlikle*", "ID card*")}</span></div>
      </div>
      <p className="passport-data-note">{copy("Kısa turistik seyahatler · Koşullar ülke detayında", "Short tourist visits · See conditions in country details", "Vizita të shkurtra turistike · Kushtet në hollësitë e shtetit")}</p>
      <details className="passport-coverage"><summary><span>{copy("Kaynak ve kapsam", "Sources and coverage", "Burimet dhe mbulimi")} · {officialCount} {copy("resmî kayıt", "official entries", "të dhëna zyrtare")}</span><Icon name="chevron" size={16}/></summary><p>{copy("Resmî kaynaklarla kontrol edilen eşleşmelerin tarihi", "Officially reviewed pairs checked on", "Kontrolli i të dhënave zyrtare")}: {MFA_CHECKED}. {copy("Diğer umuma mahsus pasaport kayıtları tarihli keşif verisidir", "Other ordinary-passport entries are dated discovery data", "Të dhënat e tjera të pasaportave të zakonshme janë orientuese")}: {passportIndex.asOf}.</p><p>{copy("Hususi, hizmet ve diplomatik türler birbirine kopyalanmaz. Resmî kaydı bulunmayan eşleşmeler için doğrulama gerekir; ETA, vize ve giriş kısıtlamaları ayrı gösterilir.", "Special, service and diplomatic rules are separate. Unreviewed pairs need verification; ETA, visas and entry restrictions are shown separately.", "Rregullat e pasaportave speciale, të shërbimit dhe diplomatike janë të ndara. Rastet pa të dhëna kërkojnë verifikim; ETA, vizat dhe kufizimet shfaqen veçmas.")}</p><button className="ci-text-button" onClick={() => void openExternal(passportIndex.source)}>{copy("Keşif veri kaynağı", "Discovery data source", "Burimi i të dhënave orientuese")}</button></details>
      {passport !== "TR" && passportType !== "ordinary" && <p className="info-box">{copy("Bu ülkenin seçtiğin pasaport türü için doğrulanmış kapsamımız henüz yok. Umuma mahsus kurallarını bu türe uygulamıyoruz; konsolosluktan kontrol et.", "Reviewed coverage is not yet available for this country's selected passport type. Ordinary rules do not apply automatically; check with the consulate.", "Nuk kemi ende të dhëna të verifikuara për këtë lloj pasaporte. Rregullat e pasaportës së zakonshme nuk zbatohen automatikisht; kontakto konsullatën.")}</p>}

      </section>

      <section className="passport-discovery" aria-labelledby="passport-discovery-heading">
      <div className="passport-section-heading"><div><h2 id="passport-discovery-heading">{copy("Nereye gitmek istersin?", "Where would you like to go?")}</h2></div></div>
      <label className="sr-only" htmlFor="passport-country-search">{copy("Ülke ara", "Search country")}</label>
      <div className="search-input"><Icon name="search" size={18} /><input id="passport-country-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Ülke ara", "Search country")} /></div>
      <div className="chip-scroll passport-filters" role="group" aria-label={copy("Giriş durumuna göre filtrele", "Filter by entry status")}>
        {filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.id === "all" ? copy("Tümü", "All", "Të gjitha") : labelOf(item.id)}</button>)}
      </div>
      <p id="passport-map-help" className="passport-map-help">{passportName} · {copy("*Tarihli ön bilgi · Bayraklar yakınlaştırınca görünür.", "*Dated guidance · Zoom to reveal flags.")}</p>

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
        {(["id_card", "free", "eta", "evisa", "on_arrival", "required", "restricted"] as const).map((status) => (
          <span key={status} role="listitem" className={`legend-chip legend-${status}`}>{labelOf(status)}</span>
        ))}
        <span role="listitem" className="legend-chip legend-unknown">{copy("Bilinmiyor", "Unknown")}</span>
      </div>

      <button type="button" className="ci-link-row passport-advice-link" onClick={() => onOpenCountryNews("TR")}><Icon name="alert" size={19}/><span><strong>{copy("Seyahat uyarıları ve ülke gündemi", "Travel advice and country updates")}</strong><small>{copy("Vize durumu, seyahat güvenliğiyle aynı şey değildir.", "Visa status does not indicate travel safety.")}</small></span><Icon name="chevron" size={17}/></button>

      {!query && filter === "all" && <section className="passport-picks" aria-label={copy("Ülke kısayolları", "Country shortcuts")}>
        <div className="editorial-heading"><h2>{copy("Ülkeleri keşfet", "Explore countries")}</h2></div>
        <div>{["SRB", "MNE", "ARE", "JPN", "USA"].map(code => {
          const country = COUNTRY_BY_ALPHA3.get(code);
          if (!country) return null;
          const entry = statusOf(code);
          return <button type="button" key={code} onClick={() => void openCountry(country)}><CountryFlag code={alpha2FromAlpha3(code)} label={countryName(code, country.name)} /><strong>{countryName(code, country.name)}</strong><small className={`entry-${entry}`}>{labelOf(entry)}</small></button>;
        })}</div>
      </section>}

      <div className="country-results-summary" role="status"><strong>{rows.length} {copy("ülke", "countries")}</strong><span>{copy("Listeden veya haritadan bir ülkeye dokun.", "Tap a country in the list or on the map.")}</span></div>

      <div className="country-list">
        {visibleRows.map((country) => {
          const rowStatus = statusOf(country.alpha3);
          return (
            <button key={country.alpha3} className="country-row" onClick={() => void openCountry(country)}>
              <CountryFlag code={alpha2FromAlpha3(country.alpha3)} label={countryName(country.alpha3, country.name)} />
              <span><strong>{countryName(country.alpha3, country.name)}</strong><small>{country.alpha3}</small><CountryRiskBadge advisory={risks.find(row => row.code === alpha2FromAlpha3(country.alpha3))}/></span>
              <em className={`status-pill status-${rowStatus}`}>{labelOf(rowStatus)}</em>
              <Icon name="chevron" size={17} />
            </button>
          );
        })}
        {!rows.length && <div className="empty-state compact"><Icon name="search" /><strong>{copy("Sonuç bulunamadı", "No results")}</strong><span>{copy("Arama kelimesini veya filtreyi değiştir.", "Change the search or filter.")}</span></div>}
        {visibleRows.length < rows.length && <button className="country-load-more" onClick={() => setVisibleCount((current) => Math.min(rows.length, current + INITIAL_ROW_COUNT))}>{copy("Daha fazla ülke göster", "Show more countries")} <span>{visibleRows.length}/{rows.length}</span></button>}
      </div>
      </section>

      <Sheet open={Boolean(selected)} title={selected ? countryName(selected.alpha3, selected.name) : copy("Ülke", "Country")} onClose={closeCountry}>
        {selected && <div className="country-detail">
          <div className={`detail-status status-${status}`}><Icon name={status === "required" ? "lock" : "passport"} size={25} /><div><small>{passportName} · {passportType === "ordinary" ? copy("Umuma mahsus", "Ordinary", "E zakonshme") : passportType === "special" ? copy("Hususi", "Special", "Speciale") : passportType === "service" ? copy("Hizmet", "Service", "Shërbimi") : copy("Diplomatik", "Diplomatic", "Diplomatike")}</small><strong>{labelOf(status)}</strong></div></div>
          <p className={`passport-source-badge source-${entry?.provenance}`}>{entry?.provenance === "official" ? copy("Resmî kaynak kontrol edildi", "Official source reviewed", "Burimi zyrtar u kontrollua") : entry?.provenance === "dated-index" ? copy("Tarihli ön bilgi · Resmî teyit gerekli", "Dated guidance · Official confirmation needed", "Të dhëna orientuese · Duhet konfirmim zyrtar") : copy("Bu eşleşme doğrulanmadı", "This pair has not been verified", "Ky kombinim nuk është verifikuar")}</p>
          <div className="info-box"><Icon name="alert" size={20}/><p>{entry ? copy(...entry.note) : ""}</p></div>
          <CountryAdvisory code={alpha2FromAlpha3(selected.alpha3)} onOpenNews={code => { closeCountry(); onOpenCountryNews(code); }}/>
          <div className="detail-list">
            <div><span>{copy("Ülke kodu", "Country code")}</span><strong>{selected.alpha3}</strong></div>
            <div><span>{copy("Giriş sınıfı", "Entry category")}</span><strong>{labelOf(status)}</strong></div>
            <div><span>{copy("Kalış sınırı", "Stay limit", "Kufiri i qëndrimit")}</span><strong>{passportStayLabel(entry?.stay || null, locale !== "tr")}</strong></div>
            <div><span>{copy("Son veri kontrolü", "Last checked")}</span><strong>{entry?.checkedAt || copy("Resmî kaynaktan doğrula", "Verify officially")}</strong></div>
          </div>
          <button className="primary-wide" onClick={() => void openExternal(entry?.provenance === "official" ? entry.sourceUrl : "https://www.iatatravelcentre.com/")}><Icon name="external" size={18} /> {copy("Güncel giriş koşullarını doğrula", "Verify current entry requirements")}</button>
          <p className="legal-note">{copy("Koşullar değişebilir. Bilet almadan önce havayolu, konsolosluk ve Dışişleri Bakanlığı bilgisini birlikte doğrula.", "Rules can change. Cross-check the airline, consulate and Ministry information before booking.")}</p>
        </div>}
      </Sheet>
    </div>
  );
}
