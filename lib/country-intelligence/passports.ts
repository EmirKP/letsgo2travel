import passportIndex from "../../mobile/src/data/passport-index.json";
import type { VisaStatus } from "../../mobile/src/types";
import { ANNEX_I, ANNEX_II, BIOMETRIC_ONLY, EU_EEA, EU_SOURCE, EU_CITIZEN_SOURCE, MFA_SOURCE, REVIEWED_AT, SCHENGEN, TURKISH_RULES, type EntryStatus, type PassportType } from "./passport-reviewed";
export { MFA_SOURCE } from "./passport-reviewed";
export type { EntryStatus } from "./passport-reviewed";
export const PASSPORTS = passportIndex.passports as Record<string, string>;
export const DESTINATION_INDEX = new Map(passportIndex.destinations.split(",").map((code, index) => [code, index]));
export const MFA_CHECKED = REVIEWED_AT;
const TYPES: PassportType[] = ["ordinary", "special", "service", "diplomatic"];
const STATUS: Record<string, EntryStatus> = { f: "free", a: "on_arrival", e: "evisa", v: "required", t: "eta", n: "restricted" };
export type PassportEntry = { status: EntryStatus; provenance: "official" | "dated-index" | "unavailable"; sourceUrl: string; checkedAt: string | null; stay: string | null; note: [string, string]; upcoming?: { effectiveOn: string; status: EntryStatus }; };
function unavailable(note?: [string, string]): PassportEntry {
  return { status: "unknown", provenance: "unavailable", sourceUrl: "https://www.iatatravelcentre.com/", checkedAt: null, stay: null, note: note || ["Bu pasaport türü ve ülke eşleşmesi için resmî sınıflandırma henüz yok. Konsolosluktan doğrula.", "No reviewed official classification is available for this passport type and destination. Check with the consulate."] };
}
export function passportEntry(passportInput: string, type: string, destinationInput: string, travelDate?: string): PassportEntry {
  const passport = passportInput.trim().toUpperCase();
  const destination = destinationInput.trim().toUpperCase();
  const typeIndex = TYPES.indexOf(type as PassportType);
  if (!Object.hasOwn(PASSPORTS, passport) || typeIndex < 0 || !DESTINATION_INDEX.has(destination)) return unavailable();
  if (passport === destination) return { ...unavailable(), status: "domestic", note: ["Pasaportunun düzenlendiği ülke; yabancı ziyaretçi vize hesabına katılmaz.", "Your passport's issuing country; excluded from foreign-entry visa totals."] };
  if (passport === 'TR' && destination === 'ME') {
    const effectiveOn = '2026-11-01';
    const validDay = typeof travelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(travelDate) && Number.isFinite(Date.parse(travelDate)) && new Date(travelDate).toISOString().slice(0, 10) === travelDate;
    const day = validDay ? travelDate! : new Date().toISOString().slice(0, 10);
    const required = type === 'ordinary' && day >= effectiveOn;
    return { status: required ? 'required' : 'free', provenance: 'official',
      sourceUrl: 'https://www.gov.me/en/diplomatic-missions/embassies-and-consulates-of-montenegro/turkey', checkedAt: '2026-10-24',
      stay: required ? null : type === 'ordinary' ? '30' : '90/180',
      ...(type === 'ordinary' && !required ? { upcoming: { effectiveOn, status: 'required' as const } } : {}),
      note: type !== 'ordinary' ? ['Hususi, hizmet ve diplomatik pasaportlarda kısa kalış muafiyeti ayrı değerlendirilir. Seyahat öncesinde resmî kaynaktan türüne uygun koşulları doğrula.', 'Special, service and diplomatic passport exemptions are separate. Confirm the rules for your passport type with the official source before travel.']
        : [required ? '1 Kasım 2026’dan itibaren umuma mahsus Türk pasaportuyla vize gerekir. Geçerli Schengen, ABD, Birleşik Krallık veya İrlanda vizesi/oturumuyla en fazla 30 günlük koşullu muafiyet olabilir; belge türünü, geçerliliğini ve güncel koşulları resmî kaynaktan doğrula.' : '31 Ekim 2026’ya kadar en fazla 30 gün vizesiz giriş; 1 Kasım 2026’dan itibaren umuma mahsus Türk pasaportuyla vize gerekir. Vize/oturum belgesine bağlı istisnaları resmî kaynaktan doğrula.',
          required ? 'Ordinary Turkish passports require a visa from 1 November 2026. A valid Schengen, US, UK or Irish visa/residence permit may allow a conditional exemption for up to 30 days; verify document type, validity and current conditions officially.' : 'Visa-free visits of up to 30 days until 31 October 2026; ordinary Turkish passports require a visa from 1 November 2026. Verify visa/residence-based exceptions with the official source.'] };
  }
  const reviewed = passport === "TR" ? TURKISH_RULES[destination] : undefined;
  if (reviewed) return { status: reviewed.statuses[typeIndex], provenance: "official", sourceUrl: reviewed.sourceUrl || MFA_SOURCE, checkedAt: REVIEWED_AT, stay: reviewed.stays?.[typeIndex] || null, note: reviewed.note || ["Kısa turistik seyahat içindir. Çalışma, eğitim, görevlendirme ve transit için farklı koşullar olabilir; pasaport geçerliliğini kontrol et.", "For short tourist visits. Work, study, official duties and transit may have different requirements; check passport validity."] };
  if (type !== "ordinary") return unavailable();
  if (SCHENGEN.has(destination)) {
    if (EU_EEA.has(passport)) return { status: "free", provenance: "official", sourceUrl: EU_CITIZEN_SOURCE, checkedAt: REVIEWED_AT, stay: null, note: ["AB/AEA/İsviçre vatandaşlığı kapsamında seyahat; geçerli seyahat belgesi ve uzun kalışta yerel kayıt koşulları geçerlidir.", "Travel as an EU/EEA/Swiss citizen requires a valid travel document; local registration rules apply for longer stays."] };
    if (ANNEX_I.has(passport) || ANNEX_II.has(passport)) return {
      status: ANNEX_II.has(passport) ? "free" : "required", provenance: "official", sourceUrl: EU_SOURCE, checkedAt: REVIEWED_AT, stay: ANNEX_II.has(passport) ? "90/180" : null,
      note: BIOMETRIC_ONLY.has(passport) ? ["Muafiyet yalnız biyometrik pasaport için. 90/180 sınırı tüm Schengen bölgesi toplamıdır. Transit, ikamet ve seyahat izni koşullarını ayrıca kontrol et.", "Exemption is only for biometric passports. The 90/180 limit applies across the Schengen area. Check transit, residence and travel-authorisation rules separately."]
      : passport === "TW" ? ["Muafiyet yalnız kimlik numarası içeren Tayvan pasaportunda geçerlidir.", "Exemption requires a Taiwan passport containing an identity card number."]
      : passport === "HK" || passport === "MO" ? ["Muafiyet yalnız ilgili özel idari bölge pasaportu için geçerlidir.", "Exemption applies only to the relevant Special Administrative Region passport."]
      : ["Kısa kalış kuralı; oturum kartı, aile üyeliği, transit ve geçici giriş kısıtlamaları ayrıca değerlendirilir. Vize muafiyetinden seyahat izni muafiyeti çıkarılmaz.", "Short-stay rule; residence cards, family-member status, transit and temporary entry restrictions require separate checks. Visa exemption does not imply travel-authorisation exemption."],
    };
  }
  const raw = PASSPORTS[passport]?.[DESTINATION_INDEX.get(destination)!];
  const status = STATUS[raw];
  if (!status) return unavailable();
  return { status, provenance: "dated-index", sourceUrl: passportIndex.source, checkedAt: passportIndex.asOf, stay: null,
    note: status === "eta" ? ["Bu kayıt elektronik seyahat izni (ETA) içindir; e-vize değildir. Başvuru ve muafiyet koşullarını resmî makamdan doğrula.", "This record is an electronic travel authorisation (ETA), not an e-visa. Verify application and exemption conditions officially."]
      : status === "restricted" ? ["Tarihli kaynak giriş kısıtlaması bildiriyor. Güncel koşulu ülkenin temsilciliğinden doğrula.", "The dated source reports an entry restriction. Confirm the current rule with the destination's consulate."]
      : ["Bu, tarihli keşif verisidir; bu eşleşme için güncel resmî doğrulama yapılmadı. Kalış süresi ve ek koşulları konsolosluktan kontrol et.", "This is dated discovery data; this pair has not been checked against a current official source. Verify duration and additional requirements with the consulate."],
  };
}
// Existing recommendation consumers cannot confuse ETA or restricted entry with
// unconditionally visa-free travel. The passport map uses the full entry model.
export function passportStatus(passport: string, type: string, destination: string, travelDate?: string): VisaStatus {
  const status = passportEntry(passport, type, destination, travelDate).status;
  return status === "eta" || status === "restricted" || status === "domestic" ? "unknown" : status;
}
export function passportStayLabel(value: string | null, english = false) {
  if (!value) return english ? "Check the official conditions" : "Resmî koşulları kontrol et";
  return value.split(";").map(part => {
    const [days, period] = part.split("/");
    return period ? english ? `${days} days in ${period} days` : `${period} günde ${days} gün` : english ? `${days} days` : `${days} gün`;
  }).join(" · ");
}
