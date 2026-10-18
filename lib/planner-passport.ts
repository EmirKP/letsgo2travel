import { DESTINATION_INDEX, PASSPORTS, passportEntry, passportStayLabel } from './country-intelligence/passports';
import type { PlanLocale } from './route-planner';

export type PlannerPassport = { passportCountry: string; passportType: string };
const TYPES = ['ordinary', 'special', 'service', 'diplomatic'];
/** Omitted choices remain unknown, including plans saved by older clients. */
export function normalizePlannerPassport(value: Record<string, unknown>): PlannerPassport {
  return {
    passportCountry: typeof value.passportCountry === 'string' ? value.passportCountry.trim().toUpperCase() : '',
    passportType: typeof value.passportType === 'string' ? value.passportType : '',
  };
}
export function validPlannerPassport(value: PlannerPassport) {
  return Object.hasOwn(PASSPORTS, value.passportCountry) && TYPES.includes(value.passportType);
}
const clean = (value: string) => value.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]/gu, '');
let countryNames: Map<string, string> | undefined;
export function plannerCountryCode(country: string): string {
  const direct = country.trim().toUpperCase();
  if (DESTINATION_INDEX.has(direct)) return direct;
  if (!countryNames) {
    countryNames = new Map();
    for (const locale of ['tr', 'en', 'sq']) {
      const names = new Intl.DisplayNames([locale], { type: 'region' });
      for (const code of DESTINATION_INDEX.keys()) countryNames.set(clean(names.of(code) || code), code);
    }
    for (const [name, code] of Object.entries({ Turkey: 'TR', 'Czech Republic': 'CZ', 'Bosnia-Herzegovina': 'BA', 'Bosnia and Herzegovina': 'BA', 'Bosnjë dhe Hercegovinë': 'BA', 'Macedonia': 'MK', 'South Korea': 'KR', 'North Korea': 'KP' })) countryNames.set(clean(name), code);
  }
  return countryNames.get(clean(country)) || '';
}
export function plannerPassportLabel(passport: PlannerPassport, locale: PlanLocale) {
  const copy = (tr: string, en: string, sq: string) => locale === 'tr' ? tr : locale === 'sq' ? sq : en;
  if (!validPlannerPassport(passport)) return copy('Pasaport seçilmedi', 'Passport not selected', 'Pasaporta nuk është zgjedhur');
  const country = new Intl.DisplayNames([locale], { type: 'region' }).of(passport.passportCountry);
  const names = [copy('Umuma mahsus', 'Ordinary', 'E zakonshme'), copy('Hususi', 'Special', 'Speciale'), copy('Hizmet', 'Service', 'Shërbimi'), copy('Diplomatik', 'Diplomatic', 'Diplomatike')];
  return `${country} · ${names[TYPES.indexOf(passport.passportType)] || copy('Belirsiz tür', 'Unknown type', 'Lloj i panjohur')}`;
}
export function plannerEntry(passport: PlannerPassport, country: string, locale: PlanLocale = 'tr') {
  const copy = (tr: string, en: string, sq: string) => locale === 'tr' ? tr : locale === 'sq' ? sq : en;
  const entry = passportEntry(passport.passportCountry, passport.passportType, plannerCountryCode(country));
  // A dated discovery index is not a reviewed rule and cannot qualify an easy-entry recommendation.
  const status = entry.provenance === 'official' || entry.status === 'domestic' ? entry.status : 'unknown';
  const mapped = { id_card: 'identity_card', free: 'visa_free', evisa: 'e_visa', on_arrival: 'visa_on_arrival', required: 'visa_required' } as const;
  const verifiedEntryStatus: (typeof mapped)[keyof typeof mapped] | 'unknown' = status in mapped ? mapped[status as keyof typeof mapped] : 'unknown';
  const labels = {
    id_card: copy('Kimlik kartıyla giriş', 'Entry with an ID card', 'Hyrje me letërnjoftim'),
    free: copy('Vizesiz', 'Visa-free', 'Pa vizë'), evisa: copy('E-vize gerekli', 'e-Visa required', 'Kërkohet e-vizë'),
    on_arrival: copy('Varışta vize', 'Visa on arrival', 'Vizë në mbërritje'), required: copy('Vize gerekli', 'Visa required', 'Kërkohet vizë'),
    domestic: copy('Pasaportunun ülkesi', 'Your passport country', 'Shteti i pasaportës sate'),
    eta: copy('Seyahat izni gerekli (ETA)', 'Travel authorisation required (ETA)', 'Kërkohet autorizim udhëtimi (ETA)'),
    restricted: copy('Giriş kısıtlaması · doğrula', 'Entry restriction · verify', 'Kufizim hyrjeje · verifiko'),
    unknown: copy('Giriş koşulları doğrulanmalı', 'Entry conditions need verification', 'Kushtet e hyrjes duhen verifikuar'),
  };
  const detail = locale === 'tr' ? entry.note[0] : entry.note[1];
  const stay = entry.stay ? ` · ${locale === 'sq' ? 'Kohëzgjatja: ' : ''}${passportStayLabel(entry.stay, locale !== 'tr')}` : '';
  return {
    visaStatus: labels[status], verifiedEntryStatus,
    visaNote: `${plannerPassportLabel(passport, locale)}${stay}. ${locale === 'sq' ? 'Kushtet nga burimi (anglisht): ' : ''}${detail}`,
    visaSourceUrl: entry.provenance === 'official' ? entry.sourceUrl : 'https://www.iatatravelcentre.com/',
    visaVerifiedAt: entry.provenance === 'official' ? entry.checkedAt : null,
  };
}
