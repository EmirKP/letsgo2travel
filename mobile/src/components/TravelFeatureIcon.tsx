import { Icon, type IconName } from "./Icon";

export type TravelFeatureIconKind = "route" | "globe" | "passport" | "trips" | "tools";

const featureIcons: Record<TravelFeatureIconKind, IconName> = {
  route: "route",
  globe: "globe",
  passport: "passport",
  trips: "suitcase",
  tools: "grid",
};

/** The same line icons as navigation, with a quiet blue tile and brand accent. */
export function TravelFeatureIcon({ kind, size = 64, className = "" }: {
  kind: TravelFeatureIconKind;
  size?: number;
  className?: string;
}) {
  return <svg className={`travel-feature-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false" color="#0066ff">
    <rect x="5" y="5" width="70" height="70" rx="21" fill="#edf5ff" stroke="#dceaff"/>
    <g transform="translate(20 17) scale(1.6667)"><Icon name={featureIcons[kind]} size={24}/></g>
    <path d="M33 65h14" stroke="#ffda24" strokeWidth="3" strokeLinecap="round"/>
  </svg>;
}
