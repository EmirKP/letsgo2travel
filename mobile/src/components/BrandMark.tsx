import brandLogo from "../assets/brand/letsgo2travel-20260910.png";
import "./brand-logo.css";

/** User-supplied PNG, including the wordmark and slogan, used unchanged. */
export function BrandMark({ decorative = false }: { decorative?: boolean }) {
  return <img className="brand-logo" src={brandLogo} width={2172} height={724}
    alt={decorative ? "" : "LetsGo2Travel · Daha fazla keşfet"} decoding="async" />;
}
