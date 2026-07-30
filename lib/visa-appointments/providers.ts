export type VisaProviderPlatformCode =
  | "idata"
  | "vfs"
  | "bls"
  | "kosmos"
  | "asvisa"
  | "romania_evisa"
  | "portugal_embassy";

export type VisaProviderPlatform = {
  code: VisaProviderPlatformCode;
  name: string;
  officialUrl: string;
  probeUrl: string;
  coveredCountries: string[];
  mode: "external_provider" | "direct_state_portal";
};

export type CountryProviderMapping = {
  countryCode: string;
  countryName: string;
  providerCode: VisaProviderPlatformCode;
  providerName: string;
  officialUrl: string;
  notes?: string;
};

export const VISA_PROVIDER_PLATFORMS: VisaProviderPlatform[] = [
  {
    code: "idata",
    name: "iDATA",
    officialUrl: "https://www.idata.com.tr/",
    probeUrl: "https://de-tr-appointment.idata.com.tr/tr",
    coveredCountries: ["DE", "IT"],
    mode: "external_provider",
  },
  {
    code: "vfs",
    name: "VFS Global",
    officialUrl: "https://visa.vfsglobal.com/tur/tr/nld/",
    probeUrl: "https://visa.vfsglobal.com/tur/tr/nld/book-your-appointment",
    coveredCountries: [
      "AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "IS",
      "LV", "LT", "LU", "MT", "NL", "NO", "PL", "SI", "SE", "CH", "LI",
    ],
    mode: "external_provider",
  },
  {
    code: "bls",
    name: "BLS International",
    officialUrl: "https://turkey.blsspainvisa.com/",
    probeUrl: "https://turkey.blsspainvisa.com/",
    coveredCountries: ["ES", "SK"],
    mode: "external_provider",
  },
  {
    code: "kosmos",
    name: "Kosmos Vize Hizmetleri",
    officialUrl: "https://web01.kosmosvize.com.tr/",
    probeUrl: "https://web01.kosmosvize.com.tr/",
    coveredCountries: ["GR"],
    mode: "external_provider",
  },
  {
    code: "asvisa",
    name: "AS Visa",
    officialUrl: "https://www.as-visa.com/",
    probeUrl: "https://appointment.as-visa.com/en/ankara-hungary-individual-appointment",
    coveredCountries: ["HU"],
    mode: "external_provider",
  },
  {
    code: "romania_evisa",
    name: "Romanya e-Viza",
    officialUrl: "https://eviza.mae.ro/?lang=en-US",
    probeUrl: "https://eviza.mae.ro/?lang=en-US",
    coveredCountries: ["RO"],
    mode: "direct_state_portal",
  },
  {
    code: "portugal_embassy",
    name: "Portekiz Büyükelçiliği",
    officialUrl: "https://ancara.embaixadaportugal.mne.gov.pt/en/",
    probeUrl: "https://ancara.embaixadaportugal.mne.gov.pt/en/",
    coveredCountries: ["PT"],
    mode: "direct_state_portal",
  },
];

const COUNTRY_NAMES: Record<string, string> = {
  AT: "Avusturya", BE: "Belçika", BG: "Bulgaristan", HR: "Hırvatistan", CZ: "Çekya",
  DK: "Danimarka", EE: "Estonya", FI: "Finlandiya", FR: "Fransa", DE: "Almanya",
  GR: "Yunanistan", HU: "Macaristan", IS: "İzlanda", IT: "İtalya", LV: "Letonya",
  LI: "Lihtenştayn", LT: "Litvanya", LU: "Lüksemburg", MT: "Malta", NL: "Hollanda",
  NO: "Norveç", PL: "Polonya", PT: "Portekiz", RO: "Romanya", SK: "Slovakya",
  SI: "Slovenya", ES: "İspanya", SE: "İsveç", CH: "İsviçre",
};

export const COUNTRY_PROVIDER_MAPPINGS: CountryProviderMapping[] = VISA_PROVIDER_PLATFORMS.flatMap((provider) =>
  provider.coveredCountries.map((countryCode) => ({
    countryCode,
    countryName: COUNTRY_NAMES[countryCode] || countryCode,
    providerCode: provider.code,
    providerName: provider.name,
    officialUrl: provider.officialUrl,
    notes: countryCode === "LI" ? "Lihtenştayn başvuruları İsviçre temsilciliği üzerinden yürütülür." : undefined,
  })),
);

export function getProviderForCountry(countryCode: string) {
  return COUNTRY_PROVIDER_MAPPINGS.find((item) => item.countryCode === countryCode.toUpperCase()) || null;
}

export function getProviderPlatform(providerCode: string | null | undefined) {
  if (!providerCode) return null;
  return VISA_PROVIDER_PLATFORMS.find((provider) => provider.code === providerCode) || null;
}
