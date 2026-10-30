import { translateAppCopy } from './planner-copy';
import { DESTINATION_INDEX, PASSPORTS, passportEntry, passportStayLabel } from './country-intelligence/passports';
import type { PlanLocale } from './route-planner';

export type PlannerPassport = { passportCountry: string; passportType: string; travelDate?: string };
const TYPES = ['ordinary', 'special', 'service', 'diplomatic'];
/** Omitted choices remain unknown, including plans saved by older clients. */
export function normalizePlannerPassport(value: Record<string, unknown>): PlannerPassport {
  return {
    passportCountry: typeof value.passportCountry === 'string' ? value.passportCountry.trim().toUpperCase() : '',
    passportType: typeof value.passportType === 'string' ? value.passportType : '',
    ...(typeof value.travelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.travelDate) && Number.isFinite(Date.parse(value.travelDate)) && new Date(value.travelDate).toISOString().slice(0,10) === value.travelDate ? { travelDate: value.travelDate } : {}),
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
    for (const locale of ['tr', 'en', 'sq', 'ro']) {
      const names = new Intl.DisplayNames([locale], { type: 'region' });
      for (const code of DESTINATION_INDEX.keys()) countryNames.set(clean(names.of(code) || code), code);
    }
    for (const [name, code] of Object.entries({ Turkey: 'TR', 'Czech Republic': 'CZ', 'Bosnia-Herzegovina': 'BA', 'Bosnia and Herzegovina': 'BA', 'Bosnjë dhe Hercegovinë': 'BA', 'Macedonia': 'MK', 'South Korea': 'KR', 'North Korea': 'KP' })) countryNames.set(clean(name), code);
  }
  return countryNames.get(clean(country)) || '';
}
export function plannerPassportLabel(passport: PlannerPassport, locale: PlanLocale, localizedCountry?: string) {
  const copy = (tr: string, en: string, sq: string) => translateAppCopy(locale, tr, en, sq);
  if (!validPlannerPassport(passport)) return copy('Pasaport seçilmedi', 'Passport not selected', 'Pasaporta nuk është zgjedhur');
  const country = localizedCountry || new Intl.DisplayNames([locale], { type: 'region' }).of(passport.passportCountry);
  const names = [copy('Umuma mahsus', 'Ordinary', 'E zakonshme'), copy('Hususi', 'Special', 'Speciale'), copy('Hizmet', 'Service', 'Shërbimi'), copy('Diplomatik', 'Diplomatic', 'Diplomatike')];
  return `${country} · ${names[TYPES.indexOf(passport.passportType)] || copy('Belirsiz tür', 'Unknown type', 'Lloj i panjohur')}`;
}
export function plannerEntry(passport: PlannerPassport, country: string, locale: PlanLocale = 'tr') {
  const copy = (tr: string, en: string, sq: string) => translateAppCopy(locale, tr, en, sq);
  const entry = passportEntry(passport.passportCountry, passport.passportType, plannerCountryCode(country), passport.travelDate);
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
  const stayValue = entry.stay ? locale === 'ro' ? entry.stay.split(';').map(part => {
    const [days, period] = part.split('/'); return period ? `${days} zile în ${period} zile` : `${days} zile`;
  }).join(' · ') : passportStayLabel(entry.stay, locale !== 'tr') : '';
  const stay = entry.stay ? ` · ${locale === 'sq' ? 'Kohëzgjatja: ' : locale === 'ro' ? 'Durata: ' : ''}${stayValue}` : '';
  return {
    visaStatus: labels[status] + (entry.upcoming ? copy(' · 1 Kasım 2026’dan itibaren vize gerekli', ' · Visa required from 1 November 2026', ' · Vizë nga 1 nëntori 2026') : ''), verifiedEntryStatus,
    visaNote: `${plannerPassportLabel(passport, locale)}${stay}. ${locale === 'sq' ? 'Kushtet nga burimi (anglisht): ' : locale === 'ro' ? 'Condiții din sursă (în engleză): ' : ''}${detail}`,
    visaSourceUrl: entry.provenance === 'official' ? entry.sourceUrl : 'https://www.iatatravelcentre.com/',
    visaVerifiedAt: entry.provenance === 'official' ? entry.checkedAt : null,
  };
}
