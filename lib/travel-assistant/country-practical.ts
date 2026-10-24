import { COST_CURRENCIES } from '../country-intelligence/currencies';
import { COUNTRY_TIME_ZONES } from '../country-intelligence/time-zones';
import { emergencyContacts, emergencyGuidance } from './emergency';
import type { EmergencyContact } from './types';
import worldCoreRaw from './world-country-core.json';
import worldElectricityRaw from './world-country-electricity.json';
import worldConnectivityRaw from './world-country-connectivity.json';

export type PracticalText = { tr: string; en: string; sq: string };
export type PracticalSource = { label: string; url: string; checkedAt: string };
type PracticalField = 'currency' | 'plugs' | 'emergency' | 'driving' | 'internet' | 'time';
export type PracticalContext = { status: string; note?: PracticalText; sources: PracticalSource[] };
export type CountryPracticalInfo = {
  countryCode: string;
  currency: { code: string; codes?: string[]; name: PracticalText; symbol: string; sources: PracticalSource[]; note?: PracticalText } | null;
  plugs: { types: readonly string[]; voltage: number; voltages?: number[]; frequency: readonly number[]; sources: PracticalSource[] } | null;
  emergency: EmergencyContact[];
  driving: { side: 'left' | 'right'; sources: PracticalSource[] } | null;
  internet: { kind: 'operator-options'; operators: { name: string; url: string }[]; sources: PracticalSource[] } | { kind: 'device-operator-check' };
  time: { zone: string; zones?: string[]; referenceCity: PracticalText; multipleZones: boolean; sourceUrl: string } | null;
  communication?: { callingCodes: string[]; status: string; sources: PracticalSource[]; note?: PracticalText };
  availableTimeZones?: string[];
  context?: Partial<Record<PracticalField, PracticalContext>>;
};

type WorldCoreCountry = {
  currency: { status: string; primaryCode: string | null; codes: string[]; names: Record<string,string>; symbols?: Record<string,string>; sourceIds: string[]; note?: PracticalText };
  driving: { status: string; side: 'left'|'right'|null; sourceIds: string[]; note?: PracticalText };
  time: { status: string; zone: string|null; zones: string[]; referenceCity: PracticalText; multipleZones: boolean; sourceIds: string[]; note?: PracticalText };
};
const worldCore = worldCoreRaw as unknown as { countries: Record<string,WorldCoreCountry>; sources: Record<string,PracticalSource>; currencyNames?: Record<string,PracticalText & {symbol?:string}> };
const worldElectricity = worldElectricityRaw as Record<string,{status:string;types:string[];voltage:number[];frequency:number[];sources:PracticalSource[];note?:PracticalText}>;
const worldConnectivity = worldConnectivityRaw as Record<string,{status:string;callingCodes:string[];sources:PracticalSource[];operators:{name:string;url:string}[];operatorSources:PracticalSource[];note?:PracticalText}>;
const cloneSources = (values: PracticalSource[]) => values.map(({label,url,checkedAt}) => ({label,url,checkedAt}));
const coreSources = (ids: string[]) => cloneSources(ids.filter(id => Object.hasOwn(worldCore.sources,id)).map(id => worldCore.sources[id]));

const checkedAt = '2026-10-20';
const source = (label: string, url: string): PracticalSource => ({ label, url, checkedAt });
const electricalSafety = (slug: string) => source('Electrical Safety First', `https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/${slug}/`);
const plugs = (types: string[], voltage: number, frequency: number[], ...sources: PracticalSource[]): NonNullable<CountryPracticalInfo['plugs']> => ({ types, voltage, frequency, sources });
const driving = (side: 'left' | 'right', label: string, url: string): NonNullable<CountryPracticalInfo['driving']> => ({ side, sources: [source(label, url)] });

type CurrencyProfile = { name: PracticalText; symbol: string; sources: PracticalSource[] };
const currency = (tr: string, en: string, sq: string, symbol: string, label: string, url: string): CurrencyProfile => ({ name: { tr, en, sq }, symbol, sources: [source(label, url)] });
// Names are translated currency names, not live exchange-rate information.
// Where there is no unique text symbol, retain the familiar abbreviation.
const CURRENCIES: Record<string, CurrencyProfile> = {
  TRY: currency('Türk lirası', 'Turkish lira', 'Lira turke', '₺', 'Central Bank of the Republic of Türkiye', 'https://tcmb.gov.tr/wps/wcm/connect/EN/TCMB%2BEN/Main%2BMenu/About%2Bthe%2BBank/Turkish%2BLira%2BSign'),
  GBP: currency('İngiliz sterlini', 'Pound sterling', 'Sterlina britanike', '£', 'Bank of England', 'https://www.bankofengland.co.uk/banknotes/current-banknotes'),
  EUR: currency('Euro', 'Euro', 'Euroja', '€', 'European Central Bank', 'https://www.ecb.europa.eu/euro/intro/html/index.en.html'),
  ALL: currency('Arnavutluk leki', 'Albanian lek', 'Leku shqiptar', 'Lek', 'Bank of Albania', 'https://www.bankofalbania.org/About_the_Bank/Core_functions/Currency_issue.html'),
  GEL: currency('Gürcistan larisi', 'Georgian lari', 'Laria gjeorgjiane', '₾', 'National Bank of Georgia', 'https://nbg.gov.ge/georgian-money/georgian-lari'),
  AZN: currency('Azerbaycan manatı', 'Azerbaijani manat', 'Manata azerbajxhanase', '₼', 'Central Bank of the Republic of Azerbaijan', 'https://www.cbar.az/law-168/law-no-802-iiq?language=en'),
  BAM: currency('Konvertibl mark', 'Convertible mark', 'Marka e konvertueshme', 'KM', 'Central Bank of Bosnia and Herzegovina', 'https://www.cbbh.ba/press/ShowNews/1521'),
  RSD: currency('Sırp dinarı', 'Serbian dinar', 'Dinari serb', 'RSD', 'National Bank of Serbia', 'https://nbs.rs/en/novac-i-placanja/novcanice/'),
  JPY: currency('Japon yeni', 'Japanese yen', 'Jeni japonez', '¥', 'Bank of Japan', 'https://www.boj.or.jp/en/note_tfjgs/note/valid/index.htm'),
  USD: currency('ABD doları', 'US dollar', 'Dollari amerikan', '$', 'U.S. Currency Education Program · Federal Reserve Board', 'https://www.uscurrency.gov/denominations'),
  AED: currency('BAE dirhemi', 'UAE dirham', 'Dirhami i Emirateve të Bashkuara Arabe', 'AED', 'Central Bank of the UAE', 'https://centralbank.ae/en/our-operations/currency-and-coins/'),
  THB: currency('Tayland bahtı', 'Thai baht', 'Bata tajlandeze', '฿', 'Bank of Thailand', 'https://www.bot.or.th/en/our-roles/banknotes.html'),
};

function catalogueCurrency(code: string): CurrencyProfile {
  const name = (language: 'tr' | 'en' | 'sq') => {
    try { return new Intl.DisplayNames([language], { type: 'currency' }).of(code) ?? code; }
    catch { return code; }
  };
  let symbol = code;
  try { symbol = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(part => part.type === 'currency')?.value ?? code; }
  catch { /* Keep the catalogue code if the device lacks currency formatting. */ }
  // The legacy catalogue has no fact-level review date. Display names come
  // from the device's locale data; do not turn those entries into sourced facts.
  return { name: { tr: name('tr'), en: name('en'), sq: name('sq') }, symbol, sources: [] };
}

type OperatorOptions = Extract<CountryPracticalInfo['internet'], { kind: 'operator-options' }>;
const operators = (...examples: [name: string, url: string, sourceUrl?: string][]): OperatorOptions => ({
  kind: 'operator-options',
  operators: examples.map(([name, url]) => ({ name, url })),
  sources: examples.map(([name, url, sourceUrl]) => source(name, sourceUrl ?? url)),
});
// Consumer-brand examples only: no ranking, price, coverage, visitor eligibility
// or device/eSIM compatibility promises. A brand is not a count of networks.
const INTERNET: Record<string, OperatorOptions> = {
  TR: operators(['Turkcell', 'https://www.turkcell.com.tr/'], ['Vodafone', 'https://www.vodafone.com.tr/'], ['Türk Telekom', 'https://bireysel.turktelekom.com.tr/tt-mobil/tarife-ve-paketler']),
  GB: operators(['EE', 'https://ee.co.uk/'], ['O2', 'https://www.o2.co.uk/'], ['Vodafone', 'https://www.vodafone.co.uk/'], ['Three', 'https://www.three.co.uk/']),
  DE: operators(['Telekom', 'https://www.telekom.de/'], ['Vodafone', 'https://www.vodafone.de/'], ['O2', 'https://www.o2online.de/']),
  FR: operators(['Orange', 'https://boutique.orange.fr/', 'https://boutique.orange.fr/infos-conseils/forfaits-mobiles'], ['SFR', 'https://www.sfr.fr/'], ['Bouygues Telecom', 'https://www.bouyguestelecom.fr/']),
  IT: operators(['TIM', 'https://www.tim.it/'], ['WINDTRE', 'https://www.windtre.it/'], ['iliad', 'https://www.iliad.it/']),
  AL: operators(['Vodafone Albania', 'https://www.vodafone.al/en/mobile/'], ['One Albania', 'https://www.one.al/']),
  XK: operators(['IPKO', 'https://www.ipko.com/'], ['Vala', 'https://kosovotelecom.com/']),
  GE: operators(['Magti', 'https://www.magticom.ge/'], ['Silknet', 'https://silknet.com/'], ['Cellfie', 'https://cellfie.ge/']),
  AZ: operators(['Azercell', 'https://www.azercell.com/'], ['Bakcell', 'https://www.bakcell.com/'], ['Nar', 'https://www.nar.az/']),
  BA: operators(['BH Telecom', 'https://www.bhtelecom.ba/'], ['HT ERONET', 'https://www.hteronet.ba/'], ['m:tel', 'https://mtel.ba/']),
  RS: operators(['mts', 'https://mts.rs/'], ['Yettel', 'https://www.yettel.rs/'], ['A1', 'https://a1.rs/']),
  JP: operators(['NTT DOCOMO', 'https://www.docomo.ne.jp/english/'], ['au', 'https://www.au.com/english/'], ['SoftBank', 'https://www.softbank.jp/en/mobile/']),
  US: operators(['AT&T', 'https://www.att.com/wireless/'], ['T-Mobile', 'https://www.t-mobile.com/'], ['Verizon', 'https://www.verizon.com/']),
  AE: operators(['e& UAE', 'https://www.eand.ae/en/index.html'], ['du', 'https://www.du.ae/personal/mobile/prepaid-plans/tourist-sim/registration']),
  TH: operators(['AIS', 'https://www.ais.th/en/consumers'], ['True-dtac', 'https://www.true.th/en']),
  GR: operators(['Telekom', 'https://www.telekom.gr/'], ['Vodafone', 'https://www.vodafone.gr/', 'https://www.vodafone.gr/en/ypostirixi/faqs'], ['Nova', 'https://nova.gr/']),
};

// IEC World Plugs was unavailable (403) during this review. Each accessible
// Electrical Safety First country guide was checked directly, rather than
// copying the older cockpit data or claiming a new IEC verification.
const PLUGS: Record<string, NonNullable<CountryPracticalInfo['plugs']>> = {
  TR: plugs(['C', 'F'], 230, [50], electricalSafety('turkey')),
  GB: plugs(['G'], 230, [50], electricalSafety('united-kingdom')),
  DE: plugs(['C', 'F'], 230, [50], electricalSafety('germany')),
  FR: plugs(['C', 'E'], 230, [50], electricalSafety('france')),
  IT: plugs(['C', 'F', 'L'], 230, [50], electricalSafety('italy')),
  AL: plugs(['C', 'F'], 230, [50], electricalSafety('albania')),
  XK: plugs(['C', 'F'], 230, [50], electricalSafety('kosovo')),
  GE: plugs(['C', 'F'], 220, [50], electricalSafety('georgia')),
  AZ: plugs(['C', 'F'], 220, [50], electricalSafety('azerbaijan')),
  BA: plugs(['C', 'F'], 230, [50], electricalSafety('bosnia-herzegovina')),
  RS: plugs(['C', 'F'], 230, [50], electricalSafety('serbia')),
  // JNTO explicitly recommends the common two-pin Type A. Type B compatibility
  // must not be promised for the many Japanese sockets without an earth pin.
  JP: plugs(['A'], 100, [50, 60], source('Japan National Tourism Organization', 'https://www.japan.travel/en/faq/'), source('Japan National Tourism Organization', 'https://www.japan.travel/en/plan/plug-and-electricity/')),
  US: plugs(['A', 'B'], 120, [60], electricalSafety('united-states')),
  AE: plugs(['G'], 230, [50], electricalSafety('united-arab-emirates')),
  TH: plugs(['A', 'B', 'C', 'O'], 230, [50], electricalSafety('thailand')),
  GR: plugs(['C', 'F'], 230, [50], electricalSafety('greece')),
};

const DRIVING: Record<string, NonNullable<CountryPracticalInfo['driving']>> = {
  TR: driving('right', 'T.C. Ulaştırma ve Altyapı Bakanlığı · Kanun 2918, m.46', 'https://www.uab.gov.tr/uploads/legislations/karayollari-trafik-kanunu/karayollari-trafik-kanunu.pdf'),
  GB: driving('left', 'GOV.UK · Highway Code, rule 160', 'https://www.gov.uk/guidance/the-highway-code/using-the-road-159-to-203'),
  DE: driving('right', 'Bavarian State Government', 'https://www.in.bayern.de/infos-migranten/fragen/index.php.en'),
  FR: driving('right', 'French Road Safety Observatory', 'https://www.onisr.securite-routiere.gouv.fr/en/node/497'),
  IT: driving('right', 'Italia.it · Automobile Club d’Italia', 'https://www.italia.it/en/italy/things-to-do/tutto-quello-che-ce-da-sapere-per-guidare-in-italia-regole-stradali-consigli-e-informazioni-utili'),
  AL: driving('right', 'DPSHTRR · Kodi Rrugor, neni 141', 'https://www.taskforca.dpshtrr.al/sites/default/files/downloads/dokumente/Ligji%20Nr.8378%2C%20dat%C3%AB%2022.7.1998%20%20i%20ndryshuar%20%E2%80%9CKODI%20RRUGOR%20I%20REPUBLIK%C3%8BS%20S%C3%8B%20SHQIP%C3%8BRIS%C3%8B.pdf'),
  XK: driving('right', 'Kosovo Police · Law 08/L-186, article 45', 'https://www.kosovopolice.com/wp-content/uploads/2024/03/LAW-NO.-08-L-186-ON-ROAD-TRAFFIC-PROVISIONS.pdf#page=22'),
  GE: driving('right', 'Legislative Herald of Georgia · article 31', 'https://www.matsne.gov.ge/en/document/view/2169396'),
  AZ: driving('right', 'Azerbaijan State Traffic Police · article 49', 'https://dyp.gov.az/?/az/content/188/'),
  BA: driving('right', 'Government of Ireland · Department of Foreign Affairs', 'https://api.ireland.ie/en/dfa/overseas-travel/advice/bosnia-and-herzegovina/'),
  RS: driving('right', 'Ministry of Interior of Serbia · article 35', 'https://www.mup.gov.rs/wps/wcm/connect/44fb5291-149c-4830-ab1f-d0e38b96b6f5/LAT_Zakon%2Bo%2Bbezbednosti%2Bsaobracaja%2Bna%2Bputevima.pdf?CVID=mtqIKBd&MOD=AJPERES'),
  JP: driving('left', 'Japan National Tourism Organization', 'https://www.japan.travel/en/plan/getting-around/cars/'),
  US: driving('right', 'Visit The USA · Brand USA', 'https://www.visittheusa.com/route-66-finale-arizona-desert-to-california-coast/'),
  AE: driving('right', 'UAE Government', 'https://u.ae/en/about-the-uae/fact-sheet'),
  TH: driving('left', 'U.S. Department of State', 'https://travel.state.gov/en/international-travel/travel-advisories/thailand.html'),
  GR: driving('right', 'Hellenic Republic · Law 5209/2025, article 20', 'https://www.pamth.gov.gr/wp-content/uploads/2025/09/20250100100_70dpi_70_70dpi_70_50dpi_50.pdf#page=26'),
};

type Reference = { city: PracticalText; multipleZones?: boolean; zone?: string };
const city = (tr: string, en = tr, sq = en): PracticalText => ({ tr, en, sq });
const REFERENCES: Record<string, Reference> = {
  TR: { city: city('İstanbul', 'Istanbul', 'Stamboll') },
  GB: { city: city('Londra', 'London', 'Londër') },
  DE: { city: city('Berlin') },
  FR: { city: city('Paris'), multipleZones: true },
  IT: { city: city('Roma', 'Rome', 'Romë') },
  AL: { city: city('Tiran', 'Tirana', 'Tiranë') },
  // IANA has no Europe/Pristina zone. Belgrade is the shared clock-rule zone;
  // the displayed reference remains Pristina, never a territorial assertion.
  XK: { city: city('Priştine', 'Pristina', 'Prishtinë'), zone: 'Europe/Belgrade' },
  GE: { city: city('Tiflis', 'Tbilisi') },
  AZ: { city: city('Bakü', 'Baku') },
  BA: { city: city('Saraybosna', 'Sarajevo', 'Sarajevë') },
  RS: { city: city('Belgrad', 'Belgrade', 'Beograd') },
  JP: { city: city('Tokyo') },
  US: { city: city('New York'), multipleZones: true },
  AE: { city: city('Dubai') },
  TH: { city: city('Bangkok') },
  GR: { city: city('Atina', 'Athens', 'Athinë') },
};

/** Local reference facts; no network, live-rate, coverage or whole-country clock promises. */
export function countryPracticalInfo(country: string): CountryPracticalInfo {
  const countryCode = typeof country === 'string' ? country.trim().toUpperCase() : '';
  const world = Object.hasOwn(worldCore.countries,countryCode) ? worldCore.countries[countryCode] : null;
  const electricity = Object.hasOwn(worldElectricity,countryCode) ? worldElectricity[countryCode] : null;
  const communication = Object.hasOwn(worldConnectivity,countryCode) ? worldConnectivity[countryCode] : null;
  const help = emergencyGuidance(countryCode);
  const reference = Object.hasOwn(REFERENCES, countryCode) ? REFERENCES[countryCode] : world?.time.zone ? {city:world.time.referenceCity,zone:world.time.zone,multipleZones:world.time.multipleZones} : null;
  const power = Object.hasOwn(PLUGS, countryCode) ? {...PLUGS[countryCode],voltages:[PLUGS[countryCode].voltage]} : electricity?.status === 'available' && electricity.voltage.length ? {types:electricity.types,voltage:electricity.voltage[0],voltages:electricity.voltage,frequency:electricity.frequency,sources:electricity.sources} : null;
  const traffic = Object.hasOwn(DRIVING, countryCode) ? DRIVING[countryCode] : world?.driving.side ? {side:world.driving.side,sources:coreSources(world.driving.sourceIds)} : null;
  const connectivity = Object.hasOwn(INTERNET, countryCode) ? INTERNET[countryCode] : communication?.operators.length ? {kind:'operator-options' as const,operators:communication.operators,sources:communication.operatorSources} : null;
  // Bulgaria adopted the euro on 1 January 2026; the older cost catalogue has
  // no BG entry. Unknown countries must not inherit a default currency.
  const currencyCode = world ? world.currency.primaryCode : countryCode === 'BG' || countryCode === 'XK' ? 'EUR' : Object.hasOwn(COST_CURRENCIES, countryCode) ? COST_CURRENCIES[countryCode] : null;
  const money = currencyCode && /^[A-Z]{3}$/.test(currencyCode) ? Object.hasOwn(CURRENCIES, currencyCode) ? CURRENCIES[currencyCode] : catalogueCurrency(currencyCode) : null;
  const localizedMoney = currencyCode && !Object.hasOwn(CURRENCIES,currencyCode) ? worldCore.currencyNames?.[currencyCode] : null;
  const zone = reference ? (reference.zone ?? COUNTRY_TIME_ZONES[countryCode] ?? world?.time.zone) : null;
  const context: CountryPracticalInfo['context'] = world ? {
    currency: {status:world.currency.status,note:world.currency.note ? {...world.currency.note} : undefined,sources:coreSources(world.currency.sourceIds)},
    driving: {status:traffic ? 'available' : world.driving.status,note:world.driving.note ? {...world.driving.note} : undefined,sources:coreSources(world.driving.sourceIds)},
    time: {status:world.time.status,note:world.time.note ? {...world.time.note} : undefined,sources:coreSources(world.time.sourceIds)},
    ...(electricity ? {plugs:{status:power ? 'available' : electricity.status,note:electricity.note ? {...electricity.note} : undefined,sources:cloneSources(electricity.sources)}} : {}),
    ...(help ? {emergency:{status:help.status,note:help.note ? {...help.note,sq:help.note.sq || help.note.en} : undefined,sources:cloneSources(help.sources)}} : {}),
    ...(communication ? {internet:{status:communication.status,note:communication.note ? {...communication.note} : undefined,sources:cloneSources(communication.sources)}} : {}),
  } : undefined;
  return {
    countryCode,
    currency: money && currencyCode ? {
      code: currencyCode, codes:world ? [...world.currency.codes] : [currencyCode], name: localizedMoney ? {tr:localizedMoney.tr,en:localizedMoney.en,sq:localizedMoney.sq} : { ...money.name }, symbol: Object.hasOwn(CURRENCIES,currencyCode) ? money.symbol : localizedMoney?.symbol || world?.currency.symbols?.[currencyCode] || money.symbol, sources: [
        ...money.sources.map(item => ({ ...item })),
        ...(world ? coreSources(world.currency.sourceIds) : []),
        ...(countryCode === 'BG' ? [source('European Central Bank · Bulgaria adopts the euro', 'https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260101~c830245e42.en.html')] : []),
      ],
    } : null,
    plugs: power ? { ...power, voltages:[...power.voltages], types: [...power.types], frequency: [...power.frequency], sources: power.sources.map(item => ({ ...item })) } : null,
    emergency: emergencyContacts(countryCode).map(item => ({ ...item, ...(item.note ? { note: { ...item.note } } : {}) })),
    driving: traffic ? { ...traffic, sources: traffic.sources.map(item => ({ ...item })) } : null,
    internet: connectivity ? { kind: 'operator-options', operators: connectivity.operators.map(item => ({ ...item })), sources: connectivity.sources.map(item => ({ ...item })) } : { kind: 'device-operator-check' },
    time: reference && zone ? { zone, zones:world ? [...new Set([zone,...world.time.zones])] : [zone], referenceCity: { ...reference.city }, multipleZones: reference.multipleZones === true || world?.time.multipleZones === true, sourceUrl: 'https://www.iana.org/time-zones' } : null,
    ...(communication ? {communication:{callingCodes:[...communication.callingCodes],status:communication.status,sources:cloneSources(communication.sources),note:communication.note ? {...communication.note} : undefined}} : {}),
    ...(context ? {context} : {}),
    ...(world ? {availableTimeZones:[...world.time.zones]} : {}),
  };
}

function offsetMinutes(zone: string, instant: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
    const wall = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    const difference = (wall - Math.floor(instant.getTime() / 1000) * 1000) / 60000;
    return Number.isFinite(difference) ? difference : null;
  } catch { return null; }
}

/** Positive minutes mean the named destination city is ahead of the device. */
export function countryTimeDifference(info: Pick<CountryPracticalInfo, 'time'>, deviceZone: string, now = Date.now()): { minutes: number; referenceCity: PracticalText; timeZone: string; multipleZones: boolean } | null {
  if (!info.time || typeof deviceZone !== 'string' || !deviceZone.trim() || !Number.isFinite(now)) return null;
  const instant = new Date(now);
  const destination = offsetMinutes(info.time.zone, instant), device = offsetMinutes(deviceZone, instant);
  if (destination === null || device === null) return null;
  return { minutes: destination - device, referenceCity: { ...info.time.referenceCity }, timeZone: info.time.zone, multipleZones: info.time.multipleZones };
}
