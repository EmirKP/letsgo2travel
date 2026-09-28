import { alpha2FromAlpha3, alpha3FromAlpha2 } from "../data/countryIso";
import { countryFlagAsset } from "../data/flagAssets";
import { Icon } from "./Icon";
import "./country-flag.css";

export function CountryFlag({ code, label, className = "" }: { code: string; label?: string; className?: string }) {
  const normalized = code.trim().toUpperCase();
  const alpha2 = normalized.length === 2 ? normalized : alpha2FromAlpha3(normalized);
  const asset = alpha3FromAlpha2(alpha2) ? countryFlagAsset(alpha2) : "";
  if (asset) return <img className={`country-flag ${className}`.trim()} src={asset} alt={label || normalized} width="28" height="20" loading="lazy" />;
  return <span className={`country-flag country-flag-fallback ${className}`.trim()} role="img" aria-label={label || (normalized === "ZZ" || !normalized ? "Tüm dünya" : normalized)}><Icon name="globe" size={20} /></span>;
}
