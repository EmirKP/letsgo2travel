export type VerifiedEntryStatus =
  | "identity_card"
  | "visa_free"
  | "e_visa"
  | "visa_on_arrival"
  | "visa_required"
  | "unknown";

export type VerifiedVisaRule = {
  country: string;
  status: VerifiedEntryStatus;
  label: string;
  note: string;
  sourceUrl: string;
  verifiedAt: string | null;
};

type InternalVisaRule = VerifiedVisaRule & {
  countryAliases: string[];
  destinationAliases: string[];
};

export const MFA_VISA_SOURCE_URL =
  "https://www.mfa.gov.tr/turk-vatandaslarinin-tabi-oldugu-vize-uygulamalari.tr.mfa";
export const VISA_RULES_VERIFIED_AT = "2026-08-05";

const commonSource = {
  sourceUrl: MFA_VISA_SOURCE_URL,
  verifiedAt: VISA_RULES_VERIFIED_AT,
};

const identityCardRules: InternalVisaRule[] = [
  {
    country: "Azerbaycan",
    status: "identity_card",
    label: "Kimlikle giriş",
    note: "T.C. vatandaşları turistik seyahatlerinde Türkiye'den doğrudan girişte yeni tip kimlik kartı kullanabilir.",
    countryAliases: ["azerbaycan", "azerbaijan"],
    destinationAliases: ["baku", "baku sehri", "gence", "ganja"],
    ...commonSource,
  },
  {
    country: "Gürcistan",
    status: "identity_card",
    label: "Kimlikle giriş",
    note: "T.C. vatandaşları geçerli yeni tip kimlik kartıyla seyahat edebilir; 1 Ocak 2026'dan beri zorunlu seyahat sigortası aranır.",
    countryAliases: ["gurcistan", "georgia"],
    destinationAliases: ["tiflis", "tbilisi", "batum", "batumi", "kutaisi"],
    ...commonSource,
  },
  {
    country: "Moldova",
    status: "identity_card",
    label: "Kimlikle giriş",
    note: "T.C. vatandaşları yeni tip kimlik kartıyla seyahat edebilir; taşıyıcının güncel belge koşulları ayrıca kontrol edilmelidir.",
    countryAliases: ["moldova"],
    destinationAliases: ["kisinev", "chisinau", "kishinev"],
    ...commonSource,
  },
  {
    country: "Kuzey Kıbrıs Türk Cumhuriyeti",
    status: "identity_card",
    label: "Kimlikle giriş",
    note: "T.C. vatandaşları KKTC'ye yeni tip kimlik kartıyla seyahat edebilir.",
    countryAliases: ["kktc", "kuzey kibris turk cumhuriyeti", "northern cyprus"],
    destinationAliases: ["lefkosa", "girne", "gazimagusa", "magusa"],
    ...commonSource,
  },
  {
    country: "Ukrayna",
    status: "identity_card",
    label: "Kimlikle giriş",
    note: "Türkiye'den seyahat eden T.C. vatandaşları geçerli yeni tip kimlik kartı kullanabilir; güvenlik ve uçuş koşulları ayrıca kontrol edilmelidir.",
    countryAliases: ["ukrayna", "ukraine"],
    destinationAliases: ["kiev", "kyiv", "odessa", "odesa", "lviv"],
    ...commonSource,
  },
];

const visaFreeRules: InternalVisaRule[] = [
  {
    country: "Bosna-Hersek",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri 180 gün içinde 90 güne kadar vizeden muaftır; pasaport gerekir.",
    countryAliases: ["bosna hersek", "bosna-hersek", "bosnia and herzegovina", "bosnia"],
    destinationAliases: ["saraybosna", "sarajevo", "mostar"],
    ...commonSource,
  },
  {
    country: "Kuzey Makedonya",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri 90 güne kadar vizeden muaftır; pasaport gerekir.",
    countryAliases: ["kuzey makedonya", "north macedonia", "makedonya", "macedonia"],
    destinationAliases: ["uskup", "skopje", "ohrid"],
    ...commonSource,
  },
  {
    country: "Arnavutluk",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri 90 güne kadar vizeden muaftır; pasaport gerekir.",
    countryAliases: ["arnavutluk", "albania"],
    destinationAliases: ["tiran", "tirana", "ksamil", "saranda"],
    ...commonSource,
  },
  {
    country: "Sırbistan",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri kısa turistik seyahatlerde vizeden muaftır; pasaport gerekir.",
    countryAliases: ["sirbistan", "serbia"],
    destinationAliases: ["belgrad", "belgrade", "novi sad"],
    ...commonSource,
  },
  {
    country: "Karadağ",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri 180 gün içinde 30 güne kadar vizeden muaftır; pasaport gerekir.",
    countryAliases: ["karadag", "montenegro"],
    destinationAliases: ["podgorica", "kotor", "budva", "tivat"],
    ...commonSource,
  },
  {
    country: "Kosova",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri 180 gün içinde 90 güne kadar vizeden muaftır; pasaport gerekir.",
    countryAliases: ["kosova", "kosovo"],
    destinationAliases: ["pristine", "pristina", "prizren"],
    ...commonSource,
  },
  {
    country: "Fas",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri kısa turistik seyahatlerde vizeden muaftır; pasaport gerekir.",
    countryAliases: ["fas", "morocco", "maroc"],
    destinationAliases: ["marakes", "marrakech", "kazablanka", "casablanca", "fes"],
    ...commonSource,
  },
  {
    country: "Japonya",
    status: "visa_free",
    label: "Vizesiz",
    note: "T.C. umuma mahsus pasaport hamilleri kısa turistik seyahatlerde vizeden muaftır; pasaport gerekir.",
    countryAliases: ["japonya", "japan"],
    destinationAliases: ["tokyo", "tokyo", "kyoto", "osaka"],
    ...commonSource,
  },
];

function visaRequiredRule(
  country: string,
  countryAliases: string[],
  destinationAliases: string[],
  label = "Vize gerekli",
): InternalVisaRule {
  return {
    country,
    status: "visa_required",
    label,
    note: `T.C. umuma mahsus pasaport hamilleri ${country} seyahatlerinde önceden vize almalıdır.`,
    countryAliases,
    destinationAliases,
    ...commonSource,
  };
}

const visaRequiredRules: InternalVisaRule[] = [
  visaRequiredRule("İtalya", ["italya", "italy"], ["roma", "rome", "milano", "milan", "venedik", "venice"], "Schengen vizesi gerekli"),
  visaRequiredRule("Fransa", ["fransa", "france"], ["paris", "nice", "nis", "lyon"], "Schengen vizesi gerekli"),
  visaRequiredRule("İspanya", ["ispanya", "spain"], ["barselona", "barcelona", "madrid", "sevilla"], "Schengen vizesi gerekli"),
  visaRequiredRule("Almanya", ["almanya", "germany"], ["berlin", "munih", "munich", "hamburg", "koln"], "Schengen vizesi gerekli"),
  visaRequiredRule("Hollanda", ["hollanda", "netherlands"], ["amsterdam", "rotterdam"], "Schengen vizesi gerekli"),
  visaRequiredRule("Avusturya", ["avusturya", "austria"], ["viyana", "vienna", "salzburg"], "Schengen vizesi gerekli"),
  visaRequiredRule("Çekya", ["cekya", "cek cumhuriyeti", "czechia", "czech republic"], ["prag", "prague"], "Schengen vizesi gerekli"),
  visaRequiredRule("Macaristan", ["macaristan", "hungary"], ["budapeste", "budapest"], "Schengen vizesi gerekli"),
  visaRequiredRule("Yunanistan", ["yunanistan", "greece"], ["atina", "athens", "selanik", "thessaloniki"], "Schengen vizesi gerekli"),
  visaRequiredRule("Hırvatistan", ["hirvatistan", "croatia"], ["zagreb", "dubrovnik", "split"], "Schengen vizesi gerekli"),
  visaRequiredRule("Birleşik Krallık", ["birlesik krallik", "ingiltere", "united kingdom", "uk"], ["londra", "london", "edinburgh"], "Birleşik Krallık vizesi gerekli"),
  visaRequiredRule("Amerika Birleşik Devletleri", ["amerika birlesik devletleri", "abd", "united states", "usa"], ["new york", "los angeles", "miami"], "ABD vizesi gerekli"),
  visaRequiredRule("Birleşik Arap Emirlikleri", ["birlesik arap emirlikleri", "bae", "united arab emirates", "uae"], ["dubai", "abu dhabi"], "Vize gerekli"),
];

const otherRules: InternalVisaRule[] = [
  {
    country: "Mısır",
    status: "visa_on_arrival",
    label: "Sınırda vize",
    note: "T.C. umuma mahsus pasaport hamilleri Mısır sınır kapılarında vize alabilir; güncel belge ve ücret koşulları kontrol edilmelidir.",
    countryAliases: ["misir", "egypt"],
    destinationAliases: ["kahire", "cairo", "sharm el sheikh", "hurghada"],
    ...commonSource,
  },
  {
    country: "Bahreyn",
    status: "e_visa",
    label: "e-Vize gerekli",
    note: "T.C. umuma mahsus pasaport hamilleri seyahat öncesinde elektronik vize alabilir.",
    countryAliases: ["bahreyn", "bahrain"],
    destinationAliases: ["manama"],
    ...commonSource,
  },
  {
    country: "Vietnam",
    status: "e_visa",
    label: "e-Vize gerekli",
    note: "T.C. umuma mahsus pasaport hamilleri seyahat öncesinde elektronik vize almalıdır.",
    countryAliases: ["vietnam"],
    destinationAliases: ["hanoi", "ho chi minh", "saigon", "da nang"],
    ...commonSource,
  },
];

const visaRules = [
  ...identityCardRules,
  ...visaFreeRules,
  ...visaRequiredRules,
  ...otherRules,
];

function normalizeForLookup(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicRule(rule: InternalVisaRule): VerifiedVisaRule {
  return {
    country: rule.country,
    status: rule.status,
    label: rule.label,
    note: rule.note,
    sourceUrl: rule.sourceUrl,
    verifiedAt: rule.verifiedAt,
  };
}

export function resolveVerifiedVisaRule(route: {
  country?: unknown;
  name?: unknown;
  cityOrRegion?: unknown;
}): VerifiedVisaRule {
  const country = normalizeForLookup(String(route.country || ""));
  const destinations = [route.name, route.cityOrRegion]
    .map((value) => normalizeForLookup(String(value || "")))
    .filter(Boolean);

  const countryMatch = visaRules.find((rule) =>
    rule.countryAliases.some((alias) => normalizeForLookup(alias) === country),
  );
  if (countryMatch) return publicRule(countryMatch);

  const destinationMatch = visaRules.find((rule) =>
    rule.destinationAliases.some((alias) => {
      const normalizedAlias = normalizeForLookup(alias);
      return destinations.some(
        (destination) => destination === normalizedAlias || destination.includes(normalizedAlias),
      );
    }),
  );
  if (destinationMatch) return publicRule(destinationMatch);

  return {
    country: String(route.country || "Bilinmeyen ülke").slice(0, 80),
    status: "unknown",
    label: "Resmî kaynaktan doğrula",
    note: "Bu rota için otomatik doğrulanmış giriş kuralı bulunamadı. Bilet almadan önce resmî kaynağı kontrol et.",
    sourceUrl: MFA_VISA_SOURCE_URL,
    verifiedAt: null,
  };
}

export function visaRuleMatchesPreference(status: VerifiedEntryStatus, preference: string) {
  const normalizedPreference = normalizeForLookup(preference);
  if (normalizedPreference.includes("kimlikle")) return status === "identity_card";
  if (normalizedPreference.includes("sadece vizesiz")) {
    return status === "visa_free" || status === "identity_card";
  }
  return true;
}

export function verifiedDestinationCatalog(preference: string) {
  const identity = "Bakü (Azerbaycan), Tiflis/Batum (Gürcistan), Kişinev (Moldova), Girne/Lefkoşa (KKTC)";
  const visaFree = "Saraybosna/Mostar (Bosna-Hersek), Üsküp/Ohrid (Kuzey Makedonya), Tiran (Arnavutluk), Belgrad (Sırbistan), Kotor/Budva (Karadağ), Priştine/Prizren (Kosova)";
  const visaRequired = "Roma (İtalya), Paris (Fransa), Barselona (İspanya), Prag (Çekya), Budapeşte (Macaristan), Viyana (Avusturya), Atina (Yunanistan), Londra (Birleşik Krallık)";
  const normalizedPreference = normalizeForLookup(preference);

  if (normalizedPreference.includes("kimlikle")) return identity;
  if (normalizedPreference.includes("sadece vizesiz")) return `${visaFree}, ${identity}`;
  return `${visaFree}, ${identity}, ${visaRequired}`;
}
