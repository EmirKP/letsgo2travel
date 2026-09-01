"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { Search, TrendingUp, CheckCircle, FileText, Globe, AlertTriangle, Hotel, Wifi, MessageCircle, Sparkles, Calculator, Plane } from "lucide-react";
import Link from "next/link";
import styles from "./passport.module.css";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Türk pasaportu ile vize durumu (ISO 3166-1 numeric kodları)
// Kaynak: Passportindex.org verileri baz alınmıştır
type VisaStatus = "free" | "on_arrival" | "evisa" | "required" | "home" | "id_card";

const VISA_DATA: Record<string, VisaStatus> = {
  // --- KENDİ ÜLKESİ ---
  TUR: "home",

  // --- KİMLİKLE ---
  GEO: "id_card", AZE: "id_card", MDA: "id_card", UKR: "id_card",

  // --- VİZESİZ (Free/ETA/Days) ---
  ALB: "free", ATG: "free", ARG: "free", BHS: "free", BRB: "free", BLR: "free", 
  BLZ: "free", BOL: "free", BIH: "free", BWA: "free", BRA: "free", BRN: "free", CHL: "free", 
  COL: "free", CRI: "free", DOM: "free", ECU: "free", SLV: "free", SWZ: "free", 
  GMB: "free", GTM: "free", HTI: "free", HND: "free", HKG: "free", IRN: "free", JAM: "free", 
  JPN: "free", JOR: "free", KAZ: "free", XKX: "free", KGZ: "free", MAC: "free", MYS: "free", 
  MUS: "free", MNG: "free", MNE: "free", MAR: "free", NIC: "free", MKD: "free", 
  PSE: "free", PAN: "free", PRY: "free", PER: "free", PHL: "free", KNA: "free", LCA: "free", 
  VCT: "free", SRB: "free", SYC: "free", SGP: "free", ZAF: "free", SYR: "free", THA: "free", 
  TTO: "free", TUN: "free", URY: "free", UZB: "free", VEN: "free", FJI: "free",
  VUT: "free", CIV: "evisa", KEN: "evisa", MEX: "evisa", PAK: "evisa", KOR: "evisa", // ETA's coded as evisa

  // --- VARIŞTA VİZE (On Arrival) ---
  ARM: "on_arrival", BGD: "on_arrival", BFA: "on_arrival", BDI: "on_arrival", KHM: "on_arrival", 
  CPV: "on_arrival", COM: "on_arrival", DJI: "on_arrival", EGY: "on_arrival", ETH: "on_arrival", 
  GHA: "on_arrival", GNB: "on_arrival", IDN: "on_arrival", KWT: "on_arrival", LAO: "on_arrival", 
  LBN: "on_arrival", MDG: "on_arrival", MDV: "on_arrival", MHL: "on_arrival", MRT: "on_arrival", 
  MOZ: "on_arrival", NAM: "on_arrival", NPL: "on_arrival", OMN: "on_arrival", PLW: "on_arrival", 
  QAT: "on_arrival", RWA: "on_arrival", WSM: "on_arrival", STP: "on_arrival", SAU: "on_arrival", 
  SEN: "on_arrival", SLE: "on_arrival", SOM: "on_arrival", LKA: "on_arrival", SDN: "on_arrival", 
  TWN: "on_arrival", TZA: "on_arrival", TLS: "on_arrival", TON: "on_arrival", TUV: "on_arrival", 
  ZMB: "on_arrival", ZWE: "on_arrival",

  // --- E-VİZE (E-Visa) ---
  AUS: "evisa", BHR: "evisa", BEN: "evisa", BTN: "evisa", CMR: "evisa", COD: "evisa", CUB: "evisa", 
  GAB: "evisa", GIN: "evisa", IRQ: "evisa", LSO: "evisa", LBY: "evisa", MWI: "evisa", MMR: "evisa", 
  NGA: "evisa", PNG: "evisa", RUS: "evisa", SSD: "evisa", TJK: "evisa", TGO: "evisa", UGA: "evisa", 
  ARE: "evisa", VNM: "evisa",

  // --- VİZE GEREKLİ (Required) ---
  DZA: "required", AND: "required", AUT: "required", BEL: "required", BGR: "required", CAN: "required", 
  CAF: "required", TCD: "required", CHN: "required", COG: "required", HRV: "required", CYP: "required", 
  CZE: "required", DNK: "required", ERI: "required", EST: "required", FIN: "required", FRA: "required", 
  DEU: "required", GRC: "required", GRD: "required", GUY: "required", HUN: "required", ISL: "required", 
  IND: "required", IRL: "required", ISR: "required", ITA: "required", KIR: "required", LVA: "required", 
  LBR: "required", LIE: "required", LTU: "required", LUX: "required", MLI: "required", MLT: "required", 
  MCO: "required", NRU: "required", NLD: "required", NZL: "required", NER: "required", PRK: "required", 
  NOR: "required", POL: "required", PRT: "required", ROU: "required", SMR: "required", SVK: "required", 
  SVN: "required", SLB: "required", ESP: "required", SUR: "required", SWE: "required", CHE: "required", 
  TKM: "required", GBR: "required", USA: "required", YEM: "required", AFG: "required", AGO: "required",
  GNQ: "required",
};

// ISO Alpha-3 → ISO numeric mapping (react-simple-maps numeric kullanır)
// Basit bir set için Manuel mapping
const ALPHA3_TO_NUMERIC: Record<string, string> = {
  AFG:"4",ALB:"8",DZA:"12",AND:"20",AGO:"24",ATG:"28",ARG:"32",ARM:"51",
  AUS:"36",AUT:"40",AZE:"31",BHS:"44",BHR:"48",BGD:"50",BRB:"52",BLR:"112",
  BEL:"56",BLZ:"84",BEN:"204",BTN:"64",BOL:"68",BIH:"70",BWA:"72",BRA:"76",
  BRN:"96",BGR:"100",BFA:"854",BDI:"108",CPV:"132",KHM:"116",CMR:"120",CAN:"124",
  CAF:"140",TCD:"148",CHL:"152",CHN:"156",COL:"170",COM:"174",COD:"180",COG:"178",
  CRI:"188",CIV:"384",HRV:"191",CUB:"192",CYP:"196",CZE:"203",DNK:"208",DJI:"262",
  DMA:"212",DOM:"214",ECU:"218",EGY:"818",SLV:"222",GNQ:"226",ERI:"232",EST:"233",
  ETH:"231",FJI:"242",FIN:"246",FRA:"250",GAB:"266",GMB:"270",GEO:"268",DEU:"276",
  GHA:"288",GRC:"300",GRD:"308",GTM:"320",GIN:"324",GNB:"624",GUY:"328",HTI:"332",
  HND:"340",HUN:"348",ISL:"352",IND:"356",IDN:"360",IRN:"364",IRQ:"368",IRL:"372",
  ISR:"376",ITA:"380",JAM:"388",JPN:"392",JOR:"400",KAZ:"398",KEN:"404",KIR:"296",
  PRK:"408",KOR:"410",KWT:"414",KGZ:"417",LAO:"418",LVA:"428",LBN:"422",LSO:"426",
  LBR:"430",LBY:"434",LIE:"438",LTU:"440",LUX:"442",MDG:"450",MWI:"454",MYS:"458",
  MDV:"462",MLI:"466",MLT:"470",MHL:"584",MRT:"478",MUS:"480",MEX:"484",FSM:"583",
  MDA:"498",MCO:"492",MNG:"496",MNE:"499",MAR:"504",MOZ:"508",MMR:"104",NAM:"516",
  NRU:"520",NPL:"524",NLD:"528",NZL:"554",NIC:"558",NER:"562",NGA:"566",MKD:"807",
  NOR:"578",OMN:"512",PAK:"586",PLW:"585",PSE:"275",PAN:"591",PNG:"598",PRY:"600",
  PER:"604",PHL:"608",POL:"616",PRT:"620",QAT:"634",ROU:"642",RUS:"643",RWA:"646",
  KNA:"659",LCA:"662",VCT:"670",WSM:"882",SMR:"674",STP:"678",SAU:"682",SEN:"686",
  SRB:"688",SYC:"690",SLE:"694",SGP:"702",SVK:"703",SVN:"705",SLB:"090",SOM:"706",
  ZAF:"710",SSD:"728",ESP:"724",LKA:"144",SDN:"729",SUR:"740",SWZ:"748",SWE:"752",
  CHE:"756",SYR:"760",TWN:"158",TJK:"762",TZA:"834",THA:"764",TLS:"626",TGO:"768",
  TON:"776",TTO:"780",TUN:"788",TUR:"792",TKM:"795",TUV:"798",UGA:"800",UKR:"804",
  ARE:"784",GBR:"826",USA:"840",URY:"858",UZB:"860",VUT:"548",VEN:"862",VNM:"704",
  YEM:"887",ZMB:"894",ZWE:"716",XKX:"383",
};

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
};

const STATUS_LABEL: Record<VisaStatus, string> = {
  home: "Türkiye",
  id_card: "Kimlikle",
  free: "Vizesiz",
  evisa: "e-Vize",
  on_arrival: "Kapıda Vize",
  required: "Vize Gerekli",
};

// Arama ve sonuç bölümünde gösterilen ülke listesi
const COUNTRY_LIST: { name: string; alpha3: string }[] = [
  { name: "Türkiye", alpha3: "TUR" }, { name: "Almanya", alpha3: "DEU" }, { name: "Fransa", alpha3: "FRA" }, { name: "İspanya", alpha3: "ESP" },
  { name: "İtalya", alpha3: "ITA" }, { name: "Yunanistan", alpha3: "GRC" }, { name: "Portekiz", alpha3: "PRT" },
  { name: "Hollanda", alpha3: "NLD" }, { name: "Belçika", alpha3: "BEL" }, { name: "Avusturya", alpha3: "AUT" },
  { name: "İsviçre", alpha3: "CHE" }, { name: "Norveç", alpha3: "NOR" }, { name: "İsveç", alpha3: "SWE" },
  { name: "Finlandiya", alpha3: "FIN" }, { name: "Danimarka", alpha3: "DNK" }, { name: "Polonya", alpha3: "POL" },
  { name: "Çek Cumhuriyeti", alpha3: "CZE" }, { name: "Macaristan", alpha3: "HUN" }, { name: "Romanya", alpha3: "ROU" },
  { name: "Bulgaristan", alpha3: "BGR" }, { name: "Sırbistan", alpha3: "SRB" }, { name: "Bosna Hersek", alpha3: "BIH" },
  { name: "Hırvatistan", alpha3: "HRV" }, { name: "Slovenya", alpha3: "SVN" }, { name: "Slovakya", alpha3: "SVK" },
  { name: "Azerbaycan", alpha3: "AZE" }, { name: "Gürcistan", alpha3: "GEO" }, { name: "Ermenistan", alpha3: "ARM" },
  { name: "Ukrayna", alpha3: "UKR" }, { name: "Moldova", alpha3: "MDA" }, { name: "Belarus", alpha3: "BLR" },
  { name: "Rusya", alpha3: "RUS" }, { name: "Kazakistan", alpha3: "KAZ" }, { name: "Özbekistan", alpha3: "UZB" },
  { name: "Kırgızistan", alpha3: "KGZ" }, { name: "Tacikistan", alpha3: "TJK" }, { name: "Türkmenistan", alpha3: "TKM" },
  { name: "Japonya", alpha3: "JPN" }, { name: "Güney Kore", alpha3: "KOR" }, { name: "Çin", alpha3: "CHN" },
  { name: "Hindistan", alpha3: "IND" }, { name: "Tayland", alpha3: "THA" }, { name: "Endonezya", alpha3: "IDN" },
  { name: "Malezya", alpha3: "MYS" }, { name: "Singapur", alpha3: "SGP" }, { name: "Vietnam", alpha3: "VNM" },
  { name: "Kamboçya", alpha3: "KHM" }, { name: "Filipinler", alpha3: "PHL" }, { name: "Bangladeş", alpha3: "BGD" },
  { name: "Pakistan", alpha3: "PAK" }, { name: "Nepal", alpha3: "NPL" }, { name: "Sri Lanka", alpha3: "LKA" },
  { name: "Maldivler", alpha3: "MDV" }, { name: "BAE", alpha3: "ARE" }, { name: "Katar", alpha3: "QAT" },
  { name: "Suudi Arabistan", alpha3: "SAU" }, { name: "Kuveyt", alpha3: "KWT" }, { name: "Bahreyn", alpha3: "BHR" },
  { name: "Ürdün", alpha3: "JOR" }, { name: "Irak", alpha3: "IRQ" }, { name: "Mısır", alpha3: "EGY" },
  { name: "Fas", alpha3: "MAR" }, { name: "Tunus", alpha3: "TUN" }, { name: "Cezayir", alpha3: "DZA" },
  { name: "Nijerya", alpha3: "NGA" }, { name: "Güney Afrika", alpha3: "ZAF" }, { name: "Kenya", alpha3: "KEN" },
  { name: "Tanzanya", alpha3: "TZA" }, { name: "Etiyopya", alpha3: "ETH" }, { name: "Gana", alpha3: "GHA" },
  { name: "ABD", alpha3: "USA" }, { name: "Kanada", alpha3: "CAN" }, { name: "Meksika", alpha3: "MEX" },
  { name: "Brezilya", alpha3: "BRA" }, { name: "Arjantin", alpha3: "ARG" }, { name: "Kolombiya", alpha3: "COL" },
  { name: "Şili", alpha3: "CHL" }, { name: "Peru", alpha3: "PER" }, { name: "Avustralya", alpha3: "AUS" },
  { name: "Yeni Zelanda", alpha3: "NZL" }, { name: "İngiltere", alpha3: "GBR" }, { name: "İrlanda", alpha3: "IRL" },
  { name: "Kuzey Makedonya", alpha3: "MKD" }, { name: "Karadağ", alpha3: "MNE" }, { name: "Kosova", alpha3: "XKX" },
  { name: "Arnavutluk", alpha3: "ALB" }, { name: "Kıbrıs", alpha3: "CYP" }, { name: "İzlanda", alpha3: "ISL" },
  { name: "Lüksemburg", alpha3: "LUX" }, { name: "Letonya", alpha3: "LVA" }, { name: "Litvanya", alpha3: "LTU" },
  { name: "Estonya", alpha3: "EST" }, { name: "Yeni Kaledonya (Fiji)", alpha3: "FJI" },
];

const PASSPORT_COUNTRIES = COUNTRY_LIST.filter((country) => country.alpha3 !== "TUR");

const STATS = {
  total: PASSPORT_COUNTRIES.length,
  mobility: PASSPORT_COUNTRIES.filter((country) => {
    const status = VISA_DATA[country.alpha3] || "required";
    return status !== "required";
  }).length,
  id_card: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "required") === "id_card").length,
  free: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "required") === "free").length,
  on_arrival: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "required") === "on_arrival").length,
  evisa: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "required") === "evisa").length,
  required: PASSPORT_COUNTRIES.filter((country) => (VISA_DATA[country.alpha3] || "required") === "required").length,
};

export default function PassportPowerPage() {
  const [search, setSearch] = useState("");
  const [visaFilter, setVisaFilter] = useState("all");
  const [tooltip, setTooltip] = useState<{ name: string; status: string } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; status: string; statusKey: VisaStatus; alpha3: string } | null>(null);

  const filteredCountries = useMemo(() => {
    const q = search.toLowerCase();
    
    const statusOrder: Record<string, number> = {
      id_card: 1,
      free: 2,
      evisa: 3,
      on_arrival: 4,
      required: 5,
      home: 6
    };

    const list = PASSPORT_COUNTRIES.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (visaFilter === "all") return true;
      const status = VISA_DATA[c.alpha3] || "required";
      return status === visaFilter;
    });

    list.sort((a, b) => {
      const statusA = VISA_DATA[a.alpha3] || "required";
      const statusB = VISA_DATA[b.alpha3] || "required";
      
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
            <h1>Türkiye pasaportu</h1>
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
                          let status: VisaStatus = "required";

                          if (id === "792") {
                            status = "home";
                          } else if (id && NUMERIC_TO_STATUS[id]) {
                            status = NUMERIC_TO_STATUS[id];
                          } else if (geo.properties.name === "Kosovo") {
                            status = VISA_DATA.XKX || "free";
                          }

                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              onMouseEnter={() => setTooltip({ name: geo.properties.name, status: STATUS_LABEL[status] })}
                              onMouseLeave={() => setTooltip(null)}
                              onClick={() => {
                                const alpha3 = Object.keys(ALPHA3_TO_NUMERIC).find((key) => ALPHA3_TO_NUMERIC[key] === id) || "";
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
                    <p>Giriş koşulları değişebilir. Seyahatten önce resmi temsilcilik ve havayolu kaynaklarını kontrol et.</p>
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
                ].map((item) => (
                  <span key={item.status} data-status={item.status} className={styles.legendItem}>
                    <i /> {item.label} <strong>{item.count}</strong>
                  </span>
                ))}
              </div>

              <div className={styles.note}>
                <AlertTriangle size={18} />
                <p><strong>Bilgilendirme:</strong> Vize ve giriş koşulları değişebilir. Satın alma ve seyahat öncesinde resmi kaynaklardan doğrulama yap.</p>
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
                  const status = VISA_DATA[country.alpha3] || "required";
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
