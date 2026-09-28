import { useId } from "react";

export type TravelFeatureIconKind = "route" | "globe" | "passport" | "trips" | "tools";

/** Decorative illustrations; the surrounding action supplies its accessible name. */
export function TravelFeatureIcon({ kind, size = 64, className = "" }: {
  kind: TravelFeatureIconKind;
  size?: number;
  className?: string;
}) {
  const id = `travel-feature-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = (name: string) => `url(#${id}-${name})`;

  return <svg className={`travel-feature-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-blue`} x1="18" y1="10" x2="63" y2="68" gradientUnits="userSpaceOnUse"><stop stopColor="#60B6FF"/><stop offset=".46" stopColor="#1677FF"/><stop offset="1" stopColor="#0052EF"/></linearGradient>
      <linearGradient id={`${id}-navy`} x1="20" y1="10" x2="63" y2="66" gradientUnits="userSpaceOnUse"><stop stopColor="#348AFF"/><stop offset="1" stopColor="#0052EF"/></linearGradient>
      <linearGradient id={`${id}-orange`} x1="22" y1="21" x2="62" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#FFD46C"/><stop offset=".48" stopColor="#FFAE41"/><stop offset="1" stopColor="#EE792B"/></linearGradient>
      <linearGradient id={`${id}-green`} x1="27" y1="19" x2="51" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#BDE987"/><stop offset="1" stopColor="#66BD75"/></linearGradient>
      <radialGradient id={`${id}-ocean`} cx=".3" cy=".24" r=".83"><stop stopColor="#8ADFFB"/><stop offset=".55" stopColor="#40AFE4"/><stop offset="1" stopColor="#2381C9"/></radialGradient>
      <clipPath id={`${id}-sphere`}><circle cx="40" cy="37" r="26"/></clipPath>
    </defs>

    {kind === "route" && <>
      <ellipse cx="40" cy="68" rx="28" ry="4" fill="#2A72B8" opacity=".13"/>
      <path d="m9 25 21-7 21 7 20-7v42l-20 7-21-7-21 7V25Z" fill="#1461B9"/>
      <path d="m9 23 21-7 21 7 20-7v42l-20 7-21-7-21 7V23Z" fill="#80CFF4"/>
      <path d="m30 16 21 7v42l-21-7V16Z" fill="#D5F2FA"/>
      <path d="m51 23 20-7v42l-20 7V23Z" fill={fill("blue")}/>
      <path d="m9 44 12-8 9 2m0 0 13 8 8-5m0 0 12 3 8-4M19 21l4 16-4 24M39 19l-3 18 9 26M61 20l-4 19 7 21" stroke="#FFF" strokeWidth="2.5" strokeLinejoin="round" opacity=".68"/>
      <path d="M22 47c8-12 10 8 21-5s11 3 17-8" stroke="#287ACC" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 4"/>
      <path d="M31 27c0 7-9 15-9 15s-9-8-9-15a9 9 0 1 1 18 0Z" fill="#0062FF"/>
      <circle cx="22" cy="27" r="3.4" fill="#FFF6DA"/>
      <path d="M67 24c0 5.5-7 12-7 12s-7-6.5-7-12a7 7 0 1 1 14 0Z" fill="#1668C3"/>
      <circle cx="60" cy="24" r="2.6" fill="#EAF9FF"/>
      <path d="m30 18 .1 37M51 25v37" stroke="#FFF" strokeWidth="1.2" opacity=".52"/>
    </>}

    {kind === "globe" && <>
      <ellipse cx="40" cy="69" rx="25" ry="4" fill="#2A72B8" opacity=".13"/>
      <path d="M47 64v4H32v-4" stroke="#3183BF" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="40" cy="37" r="26" fill={fill("ocean")}/>
      <g clipPath={`url(#${id}-sphere)`}>
        <path d="m16 17 12-7 13 3-3 7-9 3-3 6-7-1-6 9-5-8Z" fill={fill("green")}/>
        <path d="m16 35 7-4 9 3 2 6 6 4-3 8-5 2-3 11-6-4 2-12-7-7Z" fill="#87CB75"/>
        <path d="m46 10 7 7-6 5 2 5-7 4 3 4 11-3 6 7 9-3-1-15-11-9Z" fill="#FFD36D"/>
        <path d="m47 35 10 3 2 9-7 9-5-3-3-10Z" fill="#F3B14D"/>
        <path d="m61 53 10-1 3 7-7 5-8-3Z" fill="#A4D887"/>
        <path d="M12 33c16 5 37 5 56-1M16 48c17 6 34 5 48-1" stroke="#E2F8FF" strokeWidth="1" opacity=".35"/>
        <ellipse cx="40" cy="36" rx="16" ry="28" stroke="#E2F8FF" strokeWidth="1" opacity=".24"/>
        <ellipse cx="32" cy="21" rx="17" ry="6" transform="rotate(-28 32 21)" fill="#FFF" opacity=".16"/>
      </g>
      <path d="M57 12a31 31 0 0 1-1 51" stroke="#4A9CD0" strokeWidth="3" strokeLinecap="round"/>
      <path d="M28 69h24" stroke="#68BAE4" strokeWidth="4" strokeLinecap="round"/>
    </>}

    {kind === "passport" && <>
      <ellipse cx="40" cy="69" rx="24" ry="4" fill="#2A72B8" opacity=".13"/>
      <g transform="rotate(-10 40 39)">
        <rect x="21" y="13" width="39" height="53" rx="5" fill="#153D7C"/>
        <path d="M25 10h29a5 5 0 0 1 5 5v47H25a5 5 0 0 1-5-5V15a5 5 0 0 1 5-5Z" fill={fill("navy")}/>
        <path d="M25 12v45M29 62h28" stroke="#90CBED" strokeWidth="1.2" opacity=".45"/>
        <circle cx="40" cy="34" r="11" stroke="#FFE3A0" strokeWidth="1.5"/>
        <ellipse cx="40" cy="34" rx="5.5" ry="11" stroke="#FFE3A0" strokeWidth="1.3"/>
        <path d="M29 34h22M31 28h18M31 40h18" stroke="#FFE3A0" strokeWidth="1.2"/>
        <path d="M32 51h16M35 55h10" stroke="#FFE3A0" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M30 16h19" stroke="#B5E0FA" strokeWidth="2" strokeLinecap="round" opacity=".55"/>
      </g>
      <path d="m62 19 1.6 4.4L68 25l-4.4 1.6L62 31l-1.6-4.4L56 25l4.4-1.6L62 19Z" fill="#F8C967"/>
    </>}

    {kind === "trips" && <>
      <ellipse cx="40" cy="69" rx="25" ry="4" fill="#2A72B8" opacity=".13"/>
      <path d="M33 22v-8a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v8" stroke="#37749D" strokeWidth="3.5"/>
      <path d="M35 11h11" stroke="#76A5C2" strokeWidth="4" strokeLinecap="round"/>
      <rect x="24" y="60" width="7" height="9" rx="3" fill="#255576"/>
      <rect x="51" y="60" width="7" height="9" rx="3" fill="#255576"/>
      <rect x="19" y="22" width="44" height="43" rx="9" fill="#D5712A"/>
      <rect x="17" y="19" width="44" height="43" rx="9" fill={fill("orange")}/>
      <path d="M27 25v31M35 25v31M43 25v31M51 25v31" stroke="#E38329" strokeWidth="2.8" strokeLinecap="round" opacity=".6"/>
      <path d="M28 24v29M36 24v29M44 24v29M52 24v29" stroke="#FFE2A0" strokeWidth="1.6" strokeLinecap="round" opacity=".55"/>
      <path d="M60 34h4v13h-4" stroke="#BA622B" strokeWidth="3" strokeLinejoin="round"/>
      <g transform="rotate(-13 45 40)"><rect x="38" y="33" width="17" height="13" rx="2" fill="#EDF8F7"/><path d="m41 40 11-4-4 8-2-3-5-1Z" fill="#3F96CB"/></g>
      <path d="M23 24h9" stroke="#FFF0C7" strokeWidth="2.5" strokeLinecap="round" opacity=".7"/>
    </>}

    {kind === "tools" && <>
      <ellipse cx="40" cy="68" rx="24" ry="4" fill="#2A72B8" opacity=".12"/>
      <path d="M38 37H25a13 13 0 1 1 13-13v13Z" fill={fill("blue")}/>
      <path d="M43 37V24a13 13 0 1 1 13 13H43Z" fill="#58BCF2"/>
      <path d="M43 42h13a13 13 0 1 1-13 13V42Z" fill="#2778D2"/>
      <path d="M38 42v13a13 13 0 1 1-13-13h13Z" fill="#419CE6"/>
      <path d="M17 22a9 9 0 0 1 12-6M48 18a9 9 0 0 1 11-2" stroke="#D4F1FF" strokeWidth="2.4" strokeLinecap="round" opacity=".6"/>
      <circle cx="40.5" cy="39.5" r="3.2" fill="#E9F8FF"/>
    </>}
  </svg>;
}
