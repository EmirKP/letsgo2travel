import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_LIST, STATUS_LABEL, STATUS_ORDER } from "../data/countries";
import passportIndex from "../data/passport-index.json";
import { passportStatus, DESTINATION_INDEX, PASSPORTS, MFA_SOURCE, MFA_CHECKED } from "../../../lib/country-intelligence/passports";
import { CountryPicker } from "../components/CountryPicker";
import type { MapStatus } from "../components/PassportWorldMap";

// Harita geometrisi (~135 KB) ana pakete girmesin diye tembel yüklenir;
// ekran açılırken kısa bir yer tutucu görünür.
const PassportWorldMap = lazy(() => import("../components/PassportWorldMap").then((mod) => ({ default: mod.PassportWorldMap })));
import type { Country, VisaStatus } from "../types";
import { Icon } from "../components/Icon";
import { PageHero } from "../components/PageHero";
import { CountryAdvisory, CountryRiskBadge } from "../components/CountryAdvisory";
import { useAdvisories } from "../lib/countryIntelligence";
import { CountryFlag } from "../components/CountryFlag";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { Sheet } from "../components/Sheet";
import { openExternal } from "../lib/native";
import { getVisaEntryRule } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { usePassportPreference } from "../hooks/usePassportPreference";
import type { VerifiedVisaRule } from "../types";

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

export function PassportScreen({ onOpenCountryNews }: { onOpenCountryNews: (code: string) => void }) {
  const { copy, countryName, locale } = useI18n();
  const { country: passport, type: passportType, setPreference } = usePassportPreference();
  const passportName = new Intl.DisplayNames([locale], { type: "region" }).of(passport) || passport;
  const passportOptions = useMemo(() => { const names = new Intl.DisplayNames([locale], { type: "region" }); return Object.keys(PASSPORTS).map(code => ({ code, name: names.of(code) || code })).sort((a,b) => a.name.localeCompare(b.name, locale)); }, [locale]);
  const statusOf = useMemo(() => (alpha3: string): VisaStatus => {
    return passportStatus(passport, passportType, alpha2FromAlpha3(alpha3));
  }, [passport, passportType]);
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
    }), [countryName, deferredQuery, filter, locale, statusOf]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const risks = useAdvisories(visibleRows.map(row => alpha2FromAlpha3(row.alpha3)));

  useEffect(() => setVisibleCount(INITIAL_ROW_COUNT), [deferredQuery, filter]);

  // Harita her ülke path'i için çalıştığından O(n) arama yerine sabit
  // zamanda üyelik kontrolü kullanılır; filtreleme sırasında ek yük oluşmaz.
  const highlightedAlpha3 = useMemo(() => new Set(rows.map((country) => country.alpha3)), [rows]);

  const counts = useMemo(() => COUNTRY_LIST.reduce<Record<VisaStatus, number>>((acc, country) => {
    acc[statusOf(country.alpha3)] += 1;
    return acc;
  }, { id_card: 0, free: 0, evisa: 0, on_arrival: 0, required: 0, unknown: 0 }), [statusOf]);

  const status = selected ? statusOf(selected.alpha3) : "unknown";
  const openCountry = async (country: Country) => {
    const requestId = ++ruleRequest.current;
    setSelected(country);
    setVerifiedRule(null);
    if (passport !== "TR" || passportType !== "ordinary") { setRuleLoading(false); return; }
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
      <PageHero scene="passport" title={copy("Pasaport Gücü", "Passport Power")} subtitle={copy("Pasaportunla nerelere gidebilirsin?", "Where can your passport take you?")} />

      <div className="passport-selection">
        <CountryPicker value={passport} options={passportOptions} label={copy("Pasaport ülkesi", "Passport country")} placeholder={copy("Ülke seç", "Choose country")} onChange={code => { closeCountry(); setPreference(code, passportType); setFilter("all"); }}/>
        <label>{copy("Pasaport türü", "Passport type")}<select value={passportType} onChange={event => { closeCountry(); setPreference(passport, event.target.value); setFilter("all"); }}><option value="ordinary">{copy("Umuma mahsus", "Ordinary")}</option><option value="special">{copy("Hususi", "Special")}</option><option value="service">{copy("Hizmet", "Service")}</option><option value="diplomatic">{copy("Diplomatik", "Diplomatic")}</option></select></label>
      </div>
      <details className="passport-coverage"><summary>{copy("Veri kapsamı ve tarihi", "Coverage and data date")} · {passportIndex.asOf}</summary><p>{passportType === "ordinary" ? copy("199 pasaport için tarihli keşif verisi; güncel resmî giriş izni değildir. ETA ve giriş kısıtlamaları bilinmiyor renginde gösterilir, ülke detayında açıklanır. Türkiye için kimlik kartıyla geçişte üç MFA kaydı ayrıca işlendi; ek koşullar ülke detayındadır.", "Dated discovery data for 199 passports, not current official entry clearance. ETA and entry restrictions use the unknown colour and are explained in details. Three Turkish ID-card entries from the MFA are separately included; see conditions in details.") : copy("Türkiye'nin özel pasaport türlerinde 13 destinasyon için tarihli MFA ön bilgisi var; diğerleri bilinmiyor. Kalış süresi ve seyahat amacı için resmî kaynağı kontrol et.", "For special Turkish passport types, dated MFA guidance covers 13 destinations; other entries are unknown. Check official duration and purpose conditions.")}</p><button className="ci-text-button" onClick={() => void openExternal(passportIndex.source)}>{copy("Veri kaynağı", "Dataset source")}</button></details>

      <div className="chip-scroll passport-filters" role="group" aria-label={copy("Giriş durumuna göre filtrele", "Filter by entry status")}>
        {filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{copy(item.label, ({ all: "All", id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "On arrival", required: "Visa required", unknown: "Unknown" } as const)[item.id])}</button>)}
      </div>

      {passport === "TR" && <p className="passport-coverage">{copy("MFA ek kayıt kontrolü", "MFA supplement checked")}: {MFA_CHECKED} · {copy("Güncel giriş garantisi değildir.", "Not a guarantee of current entry.")}</p>}
      <div className="passport-stats">
        <div><Icon name="passport" size={19}/><strong>{counts.free}</strong><span>{copy("Vizesiz*", "Visa-free*")}</span></div>
        <div><Icon name="globe" size={19}/><strong>{counts.evisa + counts.on_arrival}</strong><span>{copy("e-Vize / kapıda*", "e-Visa / arrival*")}</span></div>
        <div><Icon name="lock" size={19}/><strong>{counts.id_card}</strong><span>{copy("Kimlikle*", "ID card*")}</span></div>
      </div>

      <button type="button" className="ci-link-row" onClick={() => onOpenCountryNews("TR")}><Icon name="alert" size={19}/><span><strong>{copy("Seyahat uyarıları ve ülke gündemi", "Travel advice and country updates")}</strong><small>{copy("Vize durumu, seyahat güvenliğiyle aynı şey değildir.", "Visa status does not indicate travel safety.")}</small></span><Icon name="chevron" size={17}/></button>
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
        {(["id_card", "free", "evisa", "on_arrival", "required"] as const).map((status) => (
          <span key={status} role="listitem" className={`legend-chip legend-${status}`}>{copy(STATUS_LABEL[status], ({ id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "Visa on arrival", required: "Visa required" } as const)[status])}</span>
        ))}
        <span role="listitem" className="legend-chip legend-unknown">{copy("Bilinmiyor", "Unknown")}</span>
      </div>

      <label className="sr-only" htmlFor="passport-country-search">{copy("Ülke ara", "Search country")}</label>
      <div className="search-input"><Icon name="search" size={18} /><input id="passport-country-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Ülke ara", "Search country")} /></div>

      {!query && filter === "all" && <section className="passport-picks" aria-label={copy("Ülke kısayolları", "Country shortcuts")}>
        <div className="editorial-heading"><h2>{copy("Ülkeleri keşfet", "Explore countries")}</h2></div>
        <div>{["SRB", "MNE", "ARE", "JPN", "USA"].map(code => {
          const country = COUNTRY_BY_ALPHA3.get(code);
          if (!country) return null;
          const entry = statusOf(code);
          return <button type="button" key={code} onClick={() => void openCountry(country)}><CountryFlag code={alpha2FromAlpha3(code)} label={countryName(code, country.name)} /><strong>{countryName(code, country.name)}</strong><small className={`entry-${entry}`}>{copy(STATUS_LABEL[entry], ({ id_card:"ID card", free:"Visa-free", evisa:"e-Visa", on_arrival:"On arrival", required:"Visa required", unknown:"Unknown" } as const)[entry])}</small></button>;
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
          <div className={`detail-status status-${status}`}><Icon name={status === "required" ? "lock" : "passport"} size={25} /><div><small>{passportName}</small><strong>{copy(verifiedRule?.label || STATUS_LABEL[status], ({ id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "Visa on arrival", required: "Visa required", unknown: "Unknown" } as const)[status])}</strong></div></div>
          {passportType === "ordinary" && <p className="passport-coverage">{copy("Veri seti tarihi", "Dataset date")}: {passportIndex.asOf}. {PASSPORTS[passport]?.[DESTINATION_INDEX.get(alpha2FromAlpha3(selected.alpha3)) ?? -1] === "t" ? copy("Elektronik seyahat izni (ETA) kaydı var; vizeyle aynı değildir. Seyahatten önce resmî başvuru koşulunu kontrol et.", "An electronic travel authorisation (ETA) is listed; it is not a visa. Check official requirements before travel.") : PASSPORTS[passport]?.[DESTINATION_INDEX.get(alpha2FromAlpha3(selected.alpha3)) ?? -1] === "n" ? copy("Bu tarihli kaynakta giriş kısıtlaması var. Güncel durumu konsolosluktan doğrulamadan seyahat planlama.", "This dated source lists an entry restriction. Verify the current situation with the consulate before planning travel.") : ""}</p>}
          {passport === "TR" && status === "id_card" && <p className="info-box">{alpha2FromAlpha3(selected.alpha3) === "GE" ? copy("Gürcistan: yeni tip kimlik kartı; umuma mahsus/kimlikle girişte sağlık ve kaza sigortası koşulu vardır. Kapsamı, teminatı ve belge dilini MFA kaynağından doğrula.", "Georgia: new-style ID; health/accident insurance conditions apply to ordinary-passport/ID entry. Verify cover, amount and document language with the MFA.") : copy("Azerbaycan ve Ukrayna için kimlikle geçişte Türkiye’den seyahat koşulu vardır. Yeni tip kimlik ve güncel sınır/ulaşım durumunu ayrıca doğrula.", "ID entry to Azerbaijan and Ukraine includes travel-from-Turkey conditions. Verify new-style ID and current border/transport conditions.")}</p>}
          {ruleLoading ? <div className="skeleton-list"><div /></div> : <div className="info-box"><Icon name="alert" size={20} /><p>{(locale === "tr" ? verifiedRule?.note : "") || (status === "unknown"
            ? copy("Bu ülke için doğrulanmış giriş sınıfı verimiz yok; tahmin gösterilmez. Güncel koşulu resmî kaynaktan kontrol et.", "We have no verified entry classification for this country, so no guess is shown. Check an official source.")
            : copy("Bu sınıf genel keşif içindir. Kalış süresi, pasaport geçerliliği, transit koşulları ve seyahat amacı sonucu değiştirebilir.", "This category is for general discovery. Stay length, passport validity, transit and travel purpose can change the result."))}</p></div>}
          <CountryAdvisory code={alpha2FromAlpha3(selected.alpha3)} onOpenNews={code => { closeCountry(); onOpenCountryNews(code); }}/>
          <div className="detail-list">
            <div><span>{copy("Ülke kodu", "Country code")}</span><strong>{selected.alpha3}</strong></div>
            <div><span>{copy("Giriş sınıfı", "Entry category")}</span><strong>{copy(verifiedRule?.label || STATUS_LABEL[status], ({ id_card: "ID card", free: "Visa-free", evisa: "e-Visa", on_arrival: "Visa on arrival", required: "Visa required", unknown: "Unknown" } as const)[status])}</strong></div>
            <div><span>{copy("Son veri kontrolü", "Last checked")}</span><strong>{verifiedRule?.verifiedAt || copy("Resmî kaynaktan doğrula", "Verify officially")}</strong></div>
          </div>
          <button className="primary-wide" onClick={() => void openExternal(verifiedRule?.sourceUrl || (passport === "TR" ? MFA_SOURCE : "https://www.iatatravelcentre.com/"))}><Icon name="external" size={18} /> {copy("Güncel giriş koşullarını doğrula", "Verify current entry requirements")}</button>
          <p className="legal-note">{copy("Koşullar değişebilir. Bilet almadan önce havayolu, konsolosluk ve Dışişleri Bakanlığı bilgisini birlikte doğrula.", "Rules can change. Cross-check the airline, consulate and Ministry information before booking.")}</p>
        </div>}
      </Sheet>
    </div>
  );
}
