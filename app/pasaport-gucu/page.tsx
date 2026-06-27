"use client";

import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { Search, TrendingUp, CheckCircle, FileText, Globe, AlertTriangle, Plane } from "lucide-react";
import Link from "next/link";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Türk pasaportu ile vize durumu (ISO 3166-1 numeric kodları)
// Kaynak: Passportindex.org verileri baz alınmıştır
const VISA_DATA: Record<string, "free" | "on_arrival" | "evisa" | "required" | "home" | "id_card"> = {
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

const NUMERIC_TO_STATUS: Record<string, "free" | "on_arrival" | "evisa" | "required" | "home" | "id_card"> = {};
Object.entries(VISA_DATA).forEach(([alpha3, status]) => {
  const numeric = ALPHA3_TO_NUMERIC[alpha3];
  if (numeric) {
    NUMERIC_TO_STATUS[numeric] = status as any;
    NUMERIC_TO_STATUS[numeric.padStart(3, '0')] = status as any;
  }
});

const STATUS_COLOR: Record<string, string> = {
  home: "#06B6D4",
  id_card: "#10B981",
  free: "#34D399",
  evisa: "#60A5FA",
  on_arrival: "#3B82F6",
  required: "#F87171",
};

const STATUS_BADGE_COLOR: Record<string, string> = {
  home: "#06B6D4",
  id_card: "#10B981",
  free: "#34D399",
  evisa: "#60A5FA",
  on_arrival: "#3B82F6",
  required: "#EF4444",
};

const STATUS_LABEL: Record<string, string> = {
  home: "Türkiye",
  id_card: "Kimlikle",
  free: "Vizesiz",
  evisa: "e-Vize",
  on_arrival: "Kapıda Vize",
  required: "Vize Gerekli",
};

// Tüm ülkelerin arama listesi
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

const STATS = {
  mobility: Object.values(VISA_DATA).filter(v => v !== "required" && v !== "home").length,
  id_card: Object.values(VISA_DATA).filter(v => v === "id_card").length,
  free: Object.values(VISA_DATA).filter(v => v === "free").length,
  on_arrival: Object.values(VISA_DATA).filter(v => v === "on_arrival").length,
  evisa: Object.values(VISA_DATA).filter(v => v === "evisa").length,
  required: Object.values(VISA_DATA).filter(v => v === "required").length,
  rank: 40,
};

export default function PassportPowerPage() {
  const [search, setSearch] = useState("");
  const [visaFilter, setVisaFilter] = useState("all");
  const [tooltip, setTooltip] = useState<{ name: string; status: string } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; status: string; alpha3: string } | null>(null);

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

    let list = COUNTRY_LIST.filter((c) => {
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
    <div className="l2t-page">
      {/* Header */}
      <div style={{ background: "transparent", position: "relative", padding: "100px 0 40px", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1, backgroundImage: "url('https://images.unsplash.com/photo-1574704381710-424a49106093?auto=format&fit=crop&w=2000&q=80')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="l2t-wrap" style={{ display: "flex", alignItems: "center", gap: "40px", position: "relative", zIndex: 10, flexWrap: "wrap" }}>
          {/* Passport Image with Glow */}
          <div style={{ position: "relative", width: "160px", height: "220px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", width: "100%", height: "100%", transform: "translate(-50%, -50%)", background: "radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)", filter: "blur(20px)" }} />
            <img src="/turkish-passport.png" alt="Türkiye Pasaportu" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.4))", position: "relative", zIndex: 2 }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{ background: "#C8102E", color: "#fff", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(200,16,46,0.4)" }}>
                <svg viewBox="0 0 100 100" width="20" height="20">
                  <path d="M55,20 A30,30 0 1,0 55,80 A24,24 0 1,1 55,20 Z" fill="#fff" />
                  <polygon points="65,38 70,48 83,48 72,55 76,68 65,60 54,68 58,55 47,48 60,48" fill="#fff" />
                </svg>
              </div>
              <h1 style={{ margin: 0, fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: "800", color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.2)", lineHeight: "1.1" }}>
                Türkiye Pasaport Gücü
              </h1>
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <div className="l2t-glass-card" style={{ padding: "12px 24px", color: "var(--l2t-text)" }}>
                <div style={{ fontSize: "0.85rem", opacity: 0.8, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Dünya Sıralaması</div>
                <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--l2t-gold)" }}>#{STATS.rank}</div>
              </div>
              <div className="l2t-glass-card" style={{ padding: "12px 24px", color: "var(--l2t-text)" }}>
                <div style={{ fontSize: "0.85rem", opacity: 0.8, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Hareketlilik Skoru</div>
                <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--l2t-success)" }}>{STATS.mobility}</div>
              </div>
            </div>
            <div style={{ marginTop: "24px" }}>
              <button className="l2t-button l2t-button-blue" onClick={() => alert("Diğer pasaport verileri hazırlanıyor...")}>
                <Globe size={18} style={{ marginRight: "4px" }} /> Pasaport Değiştir
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="l2t-wrap" style={{ paddingTop: "20px", paddingBottom: "60px" }}>
        <style dangerouslySetInnerHTML={{__html: `
          .passport-grid { display: grid; grid-template-columns: 1fr 340px; gap: 32px; align-items: start; }
          @media (max-width: 900px) { .passport-grid { grid-template-columns: 1fr; } }
        `}} />
        <div className="passport-grid">

          {/* Sol: Harita + İstatistikler */}
          <div>
            {/* Harita */}
            <div className="l2t-glass-card" style={{ position: "relative", overflow: "hidden" }}>
              <ComposableMap
                projectionConfig={{ scale: 140 }}
                style={{ width: "100%", height: "420px", background: "transparent" }}
              >
                <ZoomableGroup zoom={1}>
                  <Geographies geography={GEO_URL}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const id = geo.id as string;
                        let status: any = "required";
                        
                        if (id === "792") {
                          status = "home";
                        } else if (id && NUMERIC_TO_STATUS[id]) {
                          status = NUMERIC_TO_STATUS[id];
                        } else if (geo.properties.name === "Kosovo") {
                          status = VISA_DATA["XKX"] || "free";
                        }
                        
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onMouseEnter={() => setTooltip({ name: geo.properties.name, status: STATUS_LABEL[status] })}
                            onMouseLeave={() => setTooltip(null)}
                            onClick={() => {
                              const alpha3 = Object.keys(ALPHA3_TO_NUMERIC).find(k => ALPHA3_TO_NUMERIC[k] === id) || "";
                              setSelectedCountry({ name: geo.properties.name, status: STATUS_LABEL[status], alpha3 });
                            }}
                            style={{
                              default: { fill: STATUS_COLOR[status], stroke: "var(--l2t-navy)", strokeWidth: 0.3, outline: "none" },
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

              {/* Tooltip */}
              {tooltip && !selectedCountry && (
                <div style={{
                  position: "absolute",
                  top: "16px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--l2t-card-strong)",
                  color: "var(--l2t-text)",
                  padding: "12px 20px",
                  borderRadius: "12px",
                  fontSize: "0.95rem",
                  fontWeight: "700",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  border: "1px solid var(--l2t-border)",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
                  backdropFilter: "blur(10px)"
                }}>
                  {tooltip.name} — <span style={{ color: "var(--l2t-gold)", fontWeight: "500" }}>{tooltip.status}</span>
                </div>
              )}

              {/* Detay Paneli */}
              {selectedCountry && (
                <div style={{
                  position: "absolute",
                  top: "0",
                  right: "0",
                  bottom: "0",
                  width: "100%",
                  maxWidth: "320px",
                  background: "var(--l2t-card-strong)",
                  backdropFilter: "blur(10px)",
                  borderLeft: "1px solid var(--l2t-border)",
                  boxShadow: "-10px 0 30px rgba(0,0,0,0.4)",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  zIndex: 20
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "1.4rem", color: "var(--l2t-text)", fontWeight: "800" }}>{selectedCountry.name}</h3>
                    <button onClick={() => setSelectedCountry(null)} style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--l2t-soft)" }}>✕</button>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "12px", marginBottom: "16px", display: "inline-block", border: "1px solid var(--l2t-border)" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", display: "block", marginBottom: "4px" }}>Vize Durumu</span>
                    <strong style={{ color: "var(--l2t-gold)", fontSize: "1.1rem" }}>{selectedCountry.status}</strong>
                  </div>
                  <div style={{ background: "rgba(245, 158, 11, 0.1)", padding: "12px", borderRadius: "12px", color: "var(--l2t-gold)", fontSize: "0.85rem", marginBottom: "24px", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                    <AlertTriangle size={14} style={{ marginBottom: "4px", display: "block" }} />
                    Vize ve giriş kuralları değişebilir. Seyahat öncesi resmi kaynaklardan kontrol edilmelidir.
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <Link href="/akilli-plan" className="l2t-button l2t-button-gold w-full text-center">Bu Ülke İçin Rota Oluştur</Link>
                    <Link href={`/ucak-bileti-ara?to=${selectedCountry.alpha3}`} className="l2t-button l2t-button-blue w-full text-center">Uçak Bileti Ara</Link>
                  </div>
                </div>
              )}
            </div>

            {/* Renk Açıklamaları */}
            <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexWrap: "wrap" }}>
              {[
                { color: "#06B6D4", label: "Türkiye", count: 1 },
                { color: "#10B981", label: "Kimlikle", count: STATS.id_card },
                { color: "#34D399", label: "Vizesiz", count: STATS.free },
                { color: "#60A5FA", label: "E-Vize", count: STATS.evisa },
                { color: "#3B82F6", label: "Kapıda Vize", count: STATS.on_arrival },
                { color: "#EF4444", label: "Vize Gerekli", count: STATS.required },
              ].map((item) => (
                <div key={item.label} className="l2t-glass-card" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "100px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: item.color }} />
                  <span style={{ fontSize: "0.85rem", color: "var(--l2t-text)", fontWeight: "600" }}>{item.label}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: "800", color: item.color }}>{item.count}</span>
                </div>
              ))}
            </div>

            {/* İstatistik Çubukları */}
            <div className="l2t-glass-card" style={{ padding: "32px", marginTop: "24px" }}>
              <div className="l2t-info-box" style={{ marginBottom: "24px", fontSize: "0.85rem", fontWeight: "600" }}>
                Vize ve giriş kuralları değişebilir. Seyahat öncesi resmi kaynaklardan kontrol edilmelidir.
              </div>
              <h3 style={{ margin: "0 0 24px", fontSize: "0.95rem", color: "var(--l2t-soft)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
                Türkiye Pasaport Vize Gereksinimleri
              </h3>
              {[
                { label: "MOBILITY SCORE", value: STATS.mobility, max: 200, color: "var(--l2t-gold)" },
                { label: "KİMLİKLE", value: STATS.id_card, max: 200, color: "var(--l2t-success)" },
                { label: "VİZESİZ", value: STATS.free, max: 200, color: "#34D399" },
                { label: "E-VİZE", value: STATS.evisa, max: 200, color: "#60A5FA" },
                { label: "KAPIDA VİZE", value: STATS.on_arrival, max: 200, color: "#3B82F6" },
                { label: "VİZE GEREKLİ", value: STATS.required, max: 200, color: "var(--l2t-danger)" },
              ].map((stat) => (
                <div key={stat.label} style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                  <div style={{ width: "120px", fontSize: "0.8rem", color: "var(--l2t-text)", fontWeight: "700", flexShrink: 0 }}>
                    {stat.label}
                  </div>
                  <div style={{ flex: 1, height: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${(stat.value / stat.max) * 100}%`,
                      background: stat.color,
                      borderRadius: "10px",
                      transition: "width 1s ease",
                    }} />
                  </div>
                  <div style={{ width: "40px", textAlign: "right", fontSize: "0.95rem", fontWeight: "800", color: stat.color, flexShrink: 0 }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sağ: Ülke Listesi */}
          <div className="l2t-glass-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Başlık */}
            <div style={{ padding: "24px", borderBottom: "1px solid var(--l2t-border)" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>
                Vize Durumları
              </div>

              {/* Filtre Butonları */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                {[
                  { id: "all", label: "Tümü" },
                  { id: "id_card", label: "Kimlikle" },
                  { id: "free", label: "Vizesiz" },
                  { id: "evisa", label: "e-Vize" },
                  { id: "on_arrival", label: "Kapıda" },
                  { id: "required", label: "Vize Gerekli" }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setVisaFilter(f.id)}
                    style={{
                      background: visaFilter === f.id ? "var(--l2t-gold)" : "rgba(255,255,255,0.05)",
                      color: visaFilter === f.id ? "var(--l2t-night)" : "var(--l2t-soft)",
                      border: "none",
                      borderRadius: "100px",
                      padding: "8px 16px",
                      fontSize: "0.85rem",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Arama */}
              <div style={{ position: "relative" }}>
                <Search size={16} color="var(--l2t-gold)" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
                <input
                  type="text"
                  placeholder="Ülke ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="l2t-form-control"
                  style={{ paddingLeft: "40px" }}
                />
              </div>
            </div>

            {/* Tablo Başlıkları */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", padding: "12px 24px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--l2t-border)" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase", letterSpacing: "1px" }}>Ülke</span>
              <span style={{ fontSize: "0.8rem", fontWeight: "700", color: "var(--l2t-soft)", textAlign: "center", textTransform: "uppercase", letterSpacing: "1px" }}>Vize Durumu</span>
            </div>

            {/* Ülke Listesi */}
            <div style={{ overflowY: "auto", flex: 1, maxHeight: "560px" }}>
              {filteredCountries.map((country) => {
                const status = VISA_DATA[country.alpha3] || "required";
                return (
                  <div
                    key={country.alpha3}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px",
                      padding: "16px 24px",
                      borderBottom: "1px solid var(--l2t-border)",
                      alignItems: "center",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontSize: "0.95rem", color: "var(--l2t-text)", fontWeight: "600" }}>{country.name}</span>
                    <div style={{
                      background: STATUS_BADGE_COLOR[status] || STATUS_COLOR[status],
                      color: "#fff",
                      borderRadius: "100px",
                      padding: "6px 12px",
                      fontSize: "0.75rem",
                      fontWeight: "800",
                      textAlign: "center",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}>
                      {STATUS_LABEL[status]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Alt İstatistik Kartları */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "16px", marginTop: "24px" }}>
          {[
            { icon: <TrendingUp size={20} />, label: "Mobility Score", value: STATS.mobility, color: "var(--l2t-gold)" },
            { icon: <CheckCircle size={20} />, label: "Vizesiz", value: STATS.free, color: "var(--l2t-success)" },
            { icon: <Globe size={20} />, label: "Varışta Vize", value: STATS.on_arrival, color: "#3B82F6" },
            { icon: <FileText size={20} />, label: "E-Vize", value: STATS.evisa, color: "#60A5FA" },
            { icon: <AlertTriangle size={20} />, label: "Vize Gerekli", value: STATS.required, color: "var(--l2t-danger)" },
          ].map((stat) => (
            <div key={stat.label} className="l2t-glass-card" style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}>
              <div style={{ color: stat.color }}>{stat.icon}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--l2t-soft)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{stat.label}</div>
              <div style={{ fontSize: "2rem", fontWeight: "900", color: stat.color, lineHeight: 1 }}>{stat.value}</div>
            </div>
          ))}
        </div>
        
        {/* AI CTA */}
        <div className="l2t-glass-card" style={{ marginTop: "32px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ fontSize: "1.3rem", fontWeight: "700", marginBottom: "8px", color: "var(--l2t-gold)" }}>Pasaport Gücünü Keşfettin, Şimdi Sıra Rotada!</h3>
            <p style={{ color: "var(--l2t-soft)", fontSize: "1rem", margin: 0 }}>Vize durumu ve bütçene göre sana en uygun rotayı yapay zeka asistanımızla saniyeler içinde planla.</p>
          </div>
          <Link href="/akilli-plan" className="l2t-button l2t-button-gold">
            <Plane size={18} /> Rota Planı Oluştur
          </Link>
        </div>

      </div>
    </div>
  );
}
