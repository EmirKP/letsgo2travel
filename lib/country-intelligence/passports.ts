import passportIndex from "../../mobile/src/data/passport-index.json";
import type { VisaStatus } from "../../mobile/src/types";
export const PASSPORTS = passportIndex.passports as Record<string,string>;
export const DESTINATION_INDEX = new Map(passportIndex.destinations.split(",").map((code,index)=>[code,index]));
export const MFA_CHECKED = "2026-09-08";
export const MFA_SOURCE = "https://www.mfa.gov.tr/turk-vatandaslarinin-tabi-oldugu-vize-uygulamalari.tr.mfa";
const STATUS:Record<string,VisaStatus>={f:"free",a:"on_arrival",e:"evisa",v:"required"};
// Explicitly reviewed MFA entries, not an inferred 'all green passports' rule.
const TR_SPECIAL_FREE = new Set(["IT","AT","NL","GR","JP","IR","GE","AZ","UA","ME"]);
const TR_SPECIAL_REQUIRED = new Set(["GB","CA","AU"]);
export function passportStatus(passport:string,type:string,destination:string):VisaStatus {
  if (!["ordinary", "special", "service", "diplomatic"].includes(type)) return "unknown";
  if (passport === "TR" && type === "ordinary" && ["GE","AZ","UA"].includes(destination)) return "id_card";
  if (type !== "ordinary") {
    if (passport !== "TR") return "unknown";
    if (TR_SPECIAL_FREE.has(destination)) return "free";
    return TR_SPECIAL_REQUIRED.has(destination) ? "required" : "unknown";
  }
  const index=DESTINATION_INDEX.get(destination);
  return index === undefined ? "unknown" : STATUS[PASSPORTS[passport]?.[index]] || "unknown";
}
