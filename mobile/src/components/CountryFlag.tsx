import kosovoFlag from "../assets/flags/kosovo.svg";
import { flagEmoji } from "../data/countryIso";

export function CountryFlag({ code, label, className = "" }: { code: string; label?: string; className?: string }) {
  const normalized = code.trim().toUpperCase();
  const isKosovo = normalized === "XK" || normalized === "XKK" || normalized === "XKX";
  const alpha2 = normalized.length === 2 ? normalized : "";
  if (normalized === "ZZ") {
    return <span className={`country-flag country-flag-emoji ${className}`.trim()} role="img" aria-label={label || "Tüm dünya"}>🌍</span>;
  }
  if (isKosovo) {
    return <img className={`country-flag ${className}`.trim()} src={kosovoFlag} alt={label || "Kosova"} />;
  }
  return <span className={`country-flag country-flag-emoji ${className}`.trim()} role="img" aria-label={label || normalized}>{flagEmoji(alpha2)}</span>;
}
