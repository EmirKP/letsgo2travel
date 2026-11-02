import type { AppLocale } from "../lib/locale";

export type BudgetCityLabels = Readonly<Record<AppLocale, string>>;

// Existing approved discovery names, keyed by the researched benchmark ID.
// Keep this data-only leaf independent of photographs, coordinates and prices.
export const BUDGET_CITY_LABELS: Readonly<Record<string, BudgetCityLabels>> = {
  "FR-paris": {"tr":"Paris","en":"Paris","sq":"Parisi","ro":"Paris"},
  "IT-rome": {"tr":"Roma","en":"Rome","sq":"Romë","ro":"Roma"},
  "BA-sarajevo": {"tr":"Saraybosna","en":"Sarajevo","sq":"Sarajevë","ro":"Sarajevo"},
  "RO-bucharest": {"tr":"Bükreş","en":"Bucharest","sq":"Bukuresht","ro":"București"},
  "AL-tirana": {"tr":"Tiran","en":"Tirana","sq":"Tiranë","ro":"Tirana"},
  "RS-belgrade": {"tr":"Belgrad","en":"Belgrade","sq":"Beograd","ro":"Belgrad"},
  "LV-riga": {"tr":"Riga","en":"Riga","sq":"Rigë","ro":"Riga"},
  "LT-vilnius": {"tr":"Vilnius","en":"Vilnius","sq":"Vilnius","ro":"Vilnius"},
  "FR-strasbourg": {"tr":"Strazburg","en":"Strasbourg","sq":"Strasburg","ro":"Strasbourg"},
  "ME-podgorica": {"tr":"Podgorica","en":"Podgorica","sq":"Podgoricë","ro":"Podgorica"},
  "EE-tallinn": {"tr":"Tallinn","en":"Tallinn","sq":"Talin","ro":"Tallinn"},
  "PL-warsaw": {"tr":"Varşova","en":"Warsaw","sq":"Varshavë","ro":"Varșovia"},
  "PL-krakow": {"tr":"Krakov","en":"Krakow","sq":"Krakov","ro":"Cracovia"},
  "SK-bratislava": {"tr":"Bratislava","en":"Bratislava","sq":"Bratislavë","ro":"Bratislava"},
  "PL-gdansk": {"tr":"Gdansk","en":"Gdansk","sq":"Gdansk","ro":"Gdańsk"},
  "PT-lisbon": {"tr":"Lizbon","en":"Lisbon","sq":"Lisbonë","ro":"Lisabona"},
  "HU-budapest": {"tr":"Budapeşte","en":"Budapest","sq":"Budapest","ro":"Budapesta"},
  "HR-zagreb": {"tr":"Zagreb","en":"Zagreb","sq":"Zagreb","ro":"Zagreb"},
  "GR-athens": {"tr":"Atina","en":"Athens","sq":"Athinë","ro":"Atena"},
  "PT-porto": {"tr":"Porto","en":"Porto","sq":"Porto","ro":"Porto"},
  "GB-cardiff": {"tr":"Cardiff","en":"Cardiff","sq":"Kardif","ro":"Cardiff"},
  "FR-lyon": {"tr":"Lyon","en":"Lyon","sq":"Lion","ro":"Lyon"},
  "CZ-prague": {"tr":"Prag","en":"Prague","sq":"Pragë","ro":"Praga"},
  "DE-berlin": {"tr":"Berlin","en":"Berlin","sq":"Berlin","ro":"Berlin"},
  "BE-brussels": {"tr":"Brüksel","en":"Brussels","sq":"Bruksel","ro":"Bruxelles"},
  "AT-salzburg": {"tr":"Salzburg","en":"Salzburg","sq":"Salzburg","ro":"Salzburg"},
  "LU-luxembourg": {"tr":"Lüksemburg","en":"Luxembourg","sq":"Luksemburg","ro":"Luxemburg"},
  "HR-dubrovnik": {"tr":"Dubrovnik","en":"Dubrovnik","sq":"Dubrovnik","ro":"Dubrovnik"},
  "SE-stockholm": {"tr":"Stockholm","en":"Stockholm","sq":"Stokholm","ro":"Stockholm"},
  "SI-ljubljana": {"tr":"Ljubljana","en":"Ljubljana","sq":"Lubjanë","ro":"Ljubljana"},
  "FR-nice": {"tr":"Nice","en":"Nice","sq":"Nicë","ro":"Nisa"},
  "GB-belfast": {"tr":"Belfast","en":"Belfast","sq":"Belfast","ro":"Belfast"},
  "GB-london": {"tr":"Londra","en":"London","sq":"Londër","ro":"Londra"},
  "DE-hamburg": {"tr":"Hamburg","en":"Hamburg","sq":"Hamburg","ro":"Hamburg"},
  "IT-florence": {"tr":"Floransa","en":"Florence","sq":"Firence","ro":"Florența"},
  "AT-vienna": {"tr":"Viyana","en":"Vienna","sq":"Vjenë","ro":"Viena"},
  "BE-bruges": {"tr":"Brugge","en":"Bruges","sq":"Bruges","ro":"Bruges"},
  "FI-helsinki": {"tr":"Helsinki","en":"Helsinki","sq":"Helsinki","ro":"Helsinki"},
  "ES-madrid": {"tr":"Madrid","en":"Madrid","sq":"Madrid","ro":"Madrid"},
  "IT-venice": {"tr":"Venedik","en":"Venice","sq":"Venedik","ro":"Veneția"},
  "IE-cork": {"tr":"Cork","en":"Cork","sq":"Kork","ro":"Cork"},
  "NL-amsterdam": {"tr":"Amsterdam","en":"Amsterdam","sq":"Amsterdam","ro":"Amsterdam"},
  "IE-dublin": {"tr":"Dublin","en":"Dublin","sq":"Dublin","ro":"Dublin"},
  "ES-barcelona": {"tr":"Barselona","en":"Barcelona","sq":"Barcelonë","ro":"Barcelona"},
  "CH-geneva": {"tr":"Cenevre","en":"Geneva","sq":"Gjenevë","ro":"Geneva"},
  "GB-edinburgh": {"tr":"Edinburgh","en":"Edinburgh","sq":"Edinburg","ro":"Edinburgh"},
  "DK-copenhagen": {"tr":"Kopenhag","en":"Copenhagen","sq":"Kopenhagë","ro":"Copenhaga"},
  "NO-oslo": {"tr":"Oslo","en":"Oslo","sq":"Oslo","ro":"Oslo"},
};

/** Use only approved labels; unrepresented researched cities retain source names. */
export function budgetCityLabel(row: { id: string; city: { tr: string; en: string } }, locale: AppLocale): string {
  return BUDGET_CITY_LABELS[row.id]?.[locale] || row.city[locale === "tr" ? "tr" : "en"];
}
