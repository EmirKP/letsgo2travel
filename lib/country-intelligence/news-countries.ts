// News headlines often use a local city, abbreviation or demonym instead of
// the formal ISO country name. Keep ambiguous names (e.g. Washington) out.
const ALIASES: Record<string, string[]> = {
  AE: ["UAE", "BAE", "Dubai", "Abu Dhabi", "Abu Dabi", "Emirati"],
  GB: ["UK", "U.K.", "Britain", "British", "England", "Scotland", "Wales", "Northern Ireland", "London", "İngiltere", "İskoçya", "Galler", "Kuzey İrlanda", "Londra"],
  US: ["USA", "U.S.", "U.S.A.", "ABD", "United States of America"],
  TR: ["Turkey", "Turkish", "Istanbul", "İstanbul", "Ankara", "Antalya", "Izmir", "İzmir"],
  FR: ["French", "Paris", "Fransız"],
  DE: ["German", "Berlin", "Munich", "Münih"],
  IT: ["Italian", "Rome", "Roma", "Milan", "Milano", "Venedik", "Venice"],
  ES: ["Spanish", "Madrid", "Barcelona", "Barselona"],
  GR: ["Greek", "Athens", "Atina", "Santorini"],
  PT: ["Portuguese", "Lisbon", "Lizbon"],
  NL: ["Dutch", "Amsterdam", "Hollanda"],
  CZ: ["Czech Republic", "Prague", "Prag"],
  CH: ["Swiss", "Zurich", "Zürih"],
  SE: ["Swedish", "Stockholm"],
  NO: ["Norwegian", "Oslo"],
  FI: ["Finnish", "Helsinki"],
  DK: ["Danish", "Copenhagen", "Kopenhag"],
  IE: ["Irish", "Dublin"],
  PL: ["Polish", "Warsaw", "Varşova"],
  GE: ["Georgian", "Tbilisi", "Tiflis"],
  AZ: ["Azerbaijani", "Baku", "Bakü"],
  BA: ["Bosnia", "Bosna", "Sarajevo", "Saraybosna"],
  MK: ["Skopje", "Üsküp"],
  RU: ["Russian", "Moscow", "Moskova"],
  UA: ["Ukrainian", "Kyiv", "Kiev"],
  IL: ["Israeli", "Tel Aviv"],
  PS: ["Palestine", "Palestinian", "Gaza", "Gazze", "West Bank", "Batı Şeria"],
  SA: ["Saudi", "Riyadh", "Riyad", "Jeddah", "Cidde"],
  QA: ["Qatari", "Doha"],
  IR: ["Iranian", "Tehran", "Tahran"],
  EG: ["Egyptian", "Cairo", "Kahire"],
  MA: ["Moroccan", "Marrakesh", "Marrakech", "Marakeş"],
  TH: ["Thai", "Bangkok", "Phuket"],
  ID: ["Indonesian", "Bali", "Jakarta", "Cakarta"],
  VN: ["Vietnamese", "Hanoi"],
  JP: ["Japanese", "Tokyo", "Osaka"],
  KR: ["South Korean", "Seoul", "Seul"],
  KP: ["North Korean", "Pyongyang"],
  CN: ["Chinese", "Beijing", "Pekin", "Shanghai", "Şanghay"],
  IN: ["Indian", "New Delhi", "Mumbai", "Yeni Delhi"],
  AU: ["Australian", "Sydney", "Sidney", "Melbourne"],
  NZ: ["Auckland", "Wellington"],
  CA: ["Canadian", "Toronto", "Ottawa", "Vancouver"],
  BR: ["Brazilian", "Rio de Janeiro", "São Paulo", "Sao Paulo"],
  MX: ["Mexican", "Mexico City", "Cancun", "Cancún"],
};

export function countryNewsTerms(code: string): string[] {
  return [...new Set([
    new Intl.DisplayNames(["en"], { type: "region" }).of(code),
    new Intl.DisplayNames(["tr"], { type: "region" }).of(code),
    ...(ALIASES[code] || []),
  ].filter((name): name is string => Boolean(name) && name !== code))];
}

export function matchesNewsCountry(text: string, code: string): boolean {
  // "Georgia" alone also describes the US state. Require country-specific
  // context in English; the Turkish country name remains unambiguous.
  const names = countryNewsTerms(code).filter(name => code !== "GE" || name !== "Georgia");
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length > 0 && new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped.join("|")})([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}
