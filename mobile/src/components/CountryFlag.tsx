import { flagEmoji } from "../data/countryIso";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { countryFlagAsset } from "../data/flagAssets";

export function CountryFlag({ code, label, className = "" }: { code: string; label?: string; className?: string }) {
  const normalized = code.trim().toUpperCase();
  const alpha2 = normalized.length === 2 ? normalized : alpha2FromAlpha3(normalized);
  if (normalized === "ZZ") {
    return <span className={`country-flag country-flag-emoji ${className}`.trim()} role="img" aria-label={label || "Tüm dünya"}>🌍</span>;
  }
  const asset = countryFlagAsset(alpha2);
  if (asset) return <img className={`country-flag ${className}`.trim()} src={asset} alt={label || normalized} width="28" height="20" loading="lazy" />;
  return <span className={`country-flag country-flag-emoji ${className}`.trim()} role="img" aria-label={label || normalized}>{flagEmoji(alpha2)}</span>;
}
