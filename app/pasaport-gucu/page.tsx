"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { Search, TrendingUp, CheckCircle, FileText, Globe, AlertTriangle, Hotel, Wifi, MessageCircle, Sparkles, Calculator, Plane } from "lucide-react";
import Link from "next/link";
import styles from "./passport.module.css";
import { ISO_COUNTRIES } from "@/lib/countries/isoSource";
import { DESTINATION_INDEX, passportEntry, passportStayLabel, type EntryStatus } from "@/lib/country-intelligence/passports";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// The web map shares the reviewed rules used by the mobile map and detail sheet.
type VisaStatus = Exclude<EntryStatus, "domestic"> | "home";
const COUNTRY_LIST = ISO_COUNTRIES.filter(country => DESTINATION_INDEX.has(country.alpha2));
const ALPHA3_TO_NUMERIC = Object.fromEntries(COUNTRY_LIST.map(country => [country.alpha3, country.numeric]));
const VISA_DATA: Record<string, VisaStatus> = Object.fromEntries(COUNTRY_LIST.map(country => {
  const entry = passportEntry("TR", "ordinary", country.alpha2);
  return [country.alpha3, entry.status === "domestic" ? "home" : entry.status];
}));
const countryEntry = (alpha3: string) => passportEntry("TR", "ordinary", COUNTRY_LIST.find(country => country.alpha3 === alpha3)?.alpha2 || "");

const NUMERIC_TO_STATUS: Record<string, VisaStatus> = {};
Object.entries(VISA_DATA).forEach(([alpha3, status]) => {
  const numeric = ALPHA3_TO_NUMERIC[alpha3];
  if (numeric) {
    NUMERIC_TO_STATUS[numeric] = status;
    NUMERIC_TO_STATUS[numeric.padStart(3, '0')] = status;
  }
});

const STATUS_COLOR: Record<VisaStatus, string> = {
  home: "#0E7490",
  id_card: "#159A74",
  free: "#58B99B",
  evisa: "#73A9D7",
  on_arrival: "#4C7FB3",
  required: "#D56A76",
  eta: "#956ccc",
  restricted: "#814151",
  unknown: "#94a3b8",
};

const STATUS_LABEL: Record<VisaStatus, string> = {
  home: "Türkiye",
  id_card: "Kimlikle",
  free: "Vizesiz",
  evisa: "e-Vize",
  on_arrival: "Kapıda Vize",
  required: "Vize Gerekli",
  eta: "Elektronik seyahat izni",
  restricted: "Giriş kısıtlaması",
  unknown: "Koşulu doğrula",
};

const PASSPORT_COUNTRIES = COUNTRY_LIST.filter((country) => country.alpha3 !== "TUR");

const STATS = {
  total: PASSPORT_COUNTRIES.length,
  mobility: PASSPORT_COUNTRIES.filter((country) => {
    const status = VISA_DATA[country.alpha3] || "unknown";
    return ["id_card", "free", "evisa", "on_arrival", "eta"].includes(status);
  }).length,
  id_card: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "unknown") === "id_card").length,
  free: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "unknown") === "free").length,
  on_arrival: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "unknown") === "on_arrival").length,
  evisa: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "unknown") === "evisa").length,
  eta: PASSPORT_COUNTRIES.filter(country => VISA_DATA[country.alpha3] === "eta").length,
  restricted: PASSPORT_COUNTRIES.filter(country => VISA_DATA[country.alpha3] === "restricted").length,
  unknown: PASSPORT_COUNTRIES.filter(country => VISA_DATA[country.alpha3] === "unknown").length,
  required: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "unknown") === "required").length,
};

export default function PassportPowerPage() {
  const [search, setSearch] = useState("");
  const [visaFilter, setVisaFilter] = useState("all");
  const [tooltip, setTooltip] = useState<{ name: string; status: string } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; status: string; statusKey: VisaStatus; alpha3: string } | null>(null);

  const selectedEntry = selectedCountry ? countryEntry(selectedCountry.alpha3) : null;

  const filteredCountries = useMemo(() => {
    const q = search.toLowerCase();
    
    const statusOrder: Record<string, number> = {
      id_card: 1,
      free: 2,
      evisa: 3,
      on_arrival: 4,
      required: 5,
      eta: 5,
      restricted: 7,
      unknown: 8,
      home: 9
    };

    const list = PASSPORT_COUNTRIES.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (visaFilter === "all") return true;
      const status = VISA_DATA[c.alpha3] || "unknown";
      return status === visaFilter;
    });

    list.sort((a, b) => {
      const statusA = VISA_DATA[a.alpha3] || "unknown";
      const statusB = VISA_DATA[b.alpha3] || "unknown";
      
      if (statusOrder[statusA] !== statusOrder[statusB]) {
        return statusOrder[statusA] - statusOrder[statusB];
      }
      return a.name.localeCompare(b.name, 'tr');
    });

    return list;
  }, [search, visaFilter]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.passportVisual}>
            <div className={styles.visualGlow} aria-hidden="true" />
            <Image
              src="/turkish-passport.webp"
              alt="Türkiye Cumhuriyeti pasaportu"
              width={190}
              height={260}
              priority
            />
            <span className={styles.countryPill}>Türkiye</span>
          </div>

          <div className={styles.summary}>
            <p className={styles.eyebrow}><Globe size={16} /> Pasaport merkezi</p>
            <h1>Türkiye umuma mahsus pasaportu</h1>
            <p className={styles.lead}>
              Kimlikle, vizesiz, e-Vize ve kapıda vize seçeneklerini tek ekranda karşılaştır.
            </p>

            <div className={styles.scoreline}>
              <div>
                <span>Kolay erişim</span>
                <strong>{STATS.mobility} ülke</strong>
              </div>
              <div>
                <span>Listelenen ülke</span>
                <strong>{STATS.total} ülke</strong>
              </div>
              <div>
                <span>Kimlikle giriş</span>
                <strong>{STATS.id_card} ülke</strong>
              </div>
            </div>

            <div className={styles.heroActions}>
              <Link href="/vizesiz-ulkeler" className={styles.primaryAction}>
                Vizesiz ülkeleri keşfet <Plane size={17} />
              </Link>
              <Link href="/rota-asistani?preset=kimlikle-haftasonu" className={styles.secondaryAction}>
                Bana rota oluştur
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.main}>
        <section className={styles.overview} aria-label="Pasaport özeti">
          {[
            { icon: <CheckCircle size={20} />, label: "Kimlikle", value: STATS.id_card, tone: "identity" },
            { icon: <Globe size={20} />, label: "Vizesiz", value: STATS.free, tone: "free" },
            { icon: <FileText size={20} />, label: "Kolay vize", value: STATS.evisa + STATS.on_arrival, tone: "easy" },
            { icon: <AlertTriangle size={20} />, label: "Vize gerekli", value: STATS.required, tone: "required" },
          ].map((item) => (
            <article key={item.label} className={styles.overviewCard} data-tone={item.tone}>
              <span className={styles.overviewIcon}>{item.icon}</span>
              <div>
                <small>{item.label}</small>
                <strong>{item.value} ülke</strong>
              </div>
            </article>
          ))}
        </section>

        <section className={styles.explorer}>
          <header className={styles.explorerHead}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}><TrendingUp size={16} /> Ülke erişim haritası</p>
              <h2>Nereye, hangi koşulla gidebilirsin?</h2>
              <p>Haritadaki bir ülkeye dokun veya aşağıdaki listeden filtrele.</p>
            </div>
            <div className={styles.search}>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder="Ülke ara..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Ülke ara"
              />
            </div>
          </header>

          <div className={styles.filters} role="group" aria-label="Vize durumuna göre filtrele">
            {[
              { id: "all", label: "Tümü" },
              { id: "id_card", label: "Kimlikle" },
              { id: "free", label: "Vizesiz" },
              { id: "evisa", label: "e-Vize" },
              { id: "on_arrival", label: "Kapıda vize" },
              { id: "required", label: "Vize gerekli" },
              { id: "eta", label: "Seyahat izni" },
              { id: "restricted", label: "Kısıtlama" },
              { id: "unknown", label: "Koşulu doğrula" },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`${styles.filterButton} ${visaFilter === filter.id ? styles.filterActive : ""}`}
                onClick={() => setVisaFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className={styles.contentGrid}>
            <div className={styles.mapColumn}>
              <div className={styles.mapCard}>
                <ComposableMap projectionConfig={{ scale: 140 }} className={styles.map}>
                  <ZoomableGroup zoom={1}>
                    <Geographies geography={GEO_URL}>
                      {({ geographies }) =>
                        geographies.map((geo) => {
                          const id = geo.id as string;
                          let status: VisaStatus = "unknown";

                          if (id === "792") {
                            status = "home";
                          } else if (id && NUMERIC_TO_STATUS[id]) {
                            status = NUMERIC_TO_STATUS[id];
                          } else if (geo.properties.name === "Kosovo") {
                            status = VISA_DATA[COUNTRY_LIST.find(country => country.alpha2 === "XK")?.alpha3 || ""] || "unknown";
                          }

                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              onMouseEnter={() => setTooltip({ name: geo.properties.name, status: STATUS_LABEL[status] })}
                              onMouseLeave={() => setTooltip(null)}
                              onClick={() => {
                                const alpha3 = Object.keys(ALPHA3_TO_NUMERIC).find((key) => Number(ALPHA3_TO_NUMERIC[key]) === Number(id)) || (geo.properties.name === "Kosovo" ? COUNTRY_LIST.find(country => country.alpha2 === "XK")?.alpha3 : "") || "";
                                setSelectedCountry({ name: geo.properties.name, status: STATUS_LABEL[status], statusKey: status, alpha3 });
                              }}
                              style={{
                                default: { fill: STATUS_COLOR[status], stroke: "#F7F9FC", strokeWidth: 0.55, outline: "none" },
                                hover: { fill: STATUS_COLOR[status], filter: "brightness(0.9)", outline: "none", cursor: "pointer" },
                                pressed: { outline: "none" },
                              }}
                            />
                          );
                        })
                      }
                    </Geographies>
                  </ZoomableGroup>
                </ComposableMap>

                {tooltip && !selectedCountry && (
                  <div className={styles.tooltip}>
                    <strong>{tooltip.name}</strong>
                    <span>{tooltip.status}</span>
                  </div>
                )}

                {selectedCountry && (
                  <aside className={styles.countryPanel}>
                    <button type="button" className={styles.close} onClick={() => setSelectedCountry(null)} aria-label="Ülke detayını kapat">×</button>
                    <small>Seçili ülke</small>
                    <h3>{selectedCountry.name}</h3>
                    <span className={styles.status} data-status={selectedCountry.statusKey}>{selectedCountry.status}</span>
                    <p>{selectedEntry?.note[0]}</p>
                    <p>{passportStayLabel(selectedEntry?.stay || null)} · {selectedEntry?.checkedAt || "Tarih doğrulanmadı"}</p>
                    <a href={selectedEntry?.sourceUrl} target="_blank" rel="noopener noreferrer">{selectedEntry?.provenance === "official" ? "Resmî kaynağı aç" : "Giriş koşullarını doğrula"}</a>
                    <div>
                      <Link href="/seyahat-kokpiti">Bu ülke için plan oluştur</Link>
                      <Link href={`/forum/ulke/${selectedCountry.name.toLowerCase().replaceAll(" ", "-")}`}>Gezginlere sor</Link>
                    </div>
                  </aside>
                )}
              </div>

              <div className={styles.legend} aria-label="Harita açıklamaları">
                {[
                  { status: "home", label: "Türkiye", count: 1 },
                  { status: "id_card", label: "Kimlikle", count: STATS.id_card },
                  { status: "free", label: "Vizesiz", count: STATS.free },
                  { status: "evisa", label: "e-Vize", count: STATS.evisa },
                  { status: "on_arrival", label: "Kapıda", count: STATS.on_arrival },
                  { status: "required", label: "Vize gerekli", count: STATS.required },
                  { status: "eta", label: "Seyahat izni", count: STATS.eta },
                  { status: "restricted", label: "Kısıtlama", count: STATS.restricted },
                  { status: "unknown", label: "Koşulu doğrula", count: STATS.unknown },
                ].map((item) => (
                  <span key={item.status} data-status={item.status} className={styles.legendItem}>
                    <i /> {item.label} <strong>{item.count}</strong>
                  </span>
                ))}
              </div>

              <div className={styles.note}>
                <AlertTriangle size={18} />
                <p><strong>Umuma mahsus pasaport · kısa turistik seyahat:</strong> Resmî inceleme 11 Ekim 2026. İncelenmeyen eşleşmeler tarihli ön bilgi olarak ayrılır. Süre, transit ve ek koşullar ülke detayındadır.</p>
              </div>
            </div>

            <article className={styles.listCard}>
              <header>
                <div>
                  <small>Sonuçlar</small>
                  <h3>{filteredCountries.length} / {STATS.total} ülke gösteriliyor</h3>
                </div>
                <span>{visaFilter === "all" ? "Tüm durumlar" : "Filtreli"}</span>
              </header>

              <div className={styles.listHead} aria-hidden="true">
                <span>Ülke</span>
                <span>Giriş durumu</span>
              </div>

              <div className={styles.countryList}>
                {filteredCountries.map((country) => {
                  const status = VISA_DATA[country.alpha3] || "unknown";
                  return (
                    <button
                      type="button"
                      key={country.alpha3}
                      className={styles.countryRow}
                      onClick={() => setSelectedCountry({ name: country.name, status: STATUS_LABEL[status], statusKey: status, alpha3: country.alpha3 })}
                    >
                      <span>{country.name}</span>
                      <strong data-status={status}>{STATUS_LABEL[status]}</strong>
                    </button>
                  );
                })}
              </div>

              {filteredCountries.length === 0 && (
                <div className={styles.empty}>Aramana uygun ülke bulunamadı.</div>
              )}
            </article>
          </div>
        </section>

        <section className={styles.next}>
          <div>
            <p className={styles.eyebrow}>Sıradaki adım</p>
            <h2>Pasaportuna uygun seyahati planla</h2>
            <p>Konaklama, internet, topluluk ve planlama araçlarına tek yerden devam et.</p>
          </div>
          <div className={styles.nextLinks}>
            <Link href="/rota-asistani"><Sparkles size={18} /> Rota oluştur</Link>
            <Link href="/oteller"><Hotel size={18} /> Otel bul</Link>
            <Link href="/esim"><Wifi size={18} /> eSIM</Link>
            <Link href="/forum"><MessageCircle size={18} /> Topluluğa sor</Link>
            <Link href="/butce-hesapla"><Calculator size={18} /> Bütçe hesapla</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
