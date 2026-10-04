import { useId } from "react";
import { TravelFeatureIcon } from "./TravelFeatureIcon";

export type TravelToolArtworkKind = "explore" | "translate" | "money" | "saved" | "needs" | "transit" | "offline" | "guide" | "embassies" | "photo" | "safety" | "trips" | "globe" | "passport" | "tools" | "alerts" | "community" | "league" | "events" | "privacy" | "settings" | "support" | "flight";

/** Companion illustrations to the Home shortcuts, decorative inside labelled buttons. */
export function TravelToolArtwork({ kind, size = 80, className = "" }: {
  kind: TravelToolArtworkKind;
  size?: number;
  className?: string;
}) {
  const id = `tool-art-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const paint = (name: string) => `url(#${id}-${name})`;
  const artworkClassName = `travel-tool-artwork ${className}`.trim();
  if (kind === "explore" || kind === "trips" || kind === "globe" || kind === "passport" || kind === "tools") {
    return <TravelFeatureIcon kind={kind === "explore" ? "route" : kind} size={size} className={artworkClassName} />;
  }

  return <svg className={artworkClassName} width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-blue`} x1="19" y1="15" x2="62" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#70CAFF"/><stop offset=".48" stopColor="#288DFF"/><stop offset="1" stopColor="#0754CB"/></linearGradient>
      <linearGradient id={`${id}-deep`} x1="20" y1="17" x2="58" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#347ED8"/><stop offset="1" stopColor="#194A9A"/></linearGradient>
      <linearGradient id={`${id}-gold`} x1="21" y1="19" x2="60" y2="62" gradientUnits="userSpaceOnUse"><stop stopColor="#FFE791"/><stop offset=".5" stopColor="#FFC45B"/><stop offset="1" stopColor="#EC9633"/></linearGradient>
      <linearGradient id={`${id}-mint`} x1="18" y1="18" x2="59" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#BBECD3"/><stop offset="1" stopColor="#49AF96"/></linearGradient>
      <linearGradient id={`${id}-paper`} x1="24" y1="18" x2="61" y2="67" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF"/><stop offset="1" stopColor="#DCECF9"/></linearGradient>
    </defs>
    <ellipse cx="40" cy="70" rx="27" ry="4" fill="#285C9B" opacity=".12"/>

    {kind === "translate" && <>
      <g transform="rotate(-8 30 32)"><path d="M12 15h34a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7H29L17 62v-9h-5a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7Z" fill="#155AAF" transform="translate(2 3)"/><path d="M12 15h34a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7H29L17 62v-9h-5a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7Z" fill={paint("blue")}/><path d="m18 42 8-20 8 20m-13-6h11" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 20h11" stroke="#CBEFFF" strokeWidth="2" strokeLinecap="round" opacity=".6"/></g>
      <g transform="rotate(8 56 50)"><path d="M43 31h23a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6h-3v7l-10-7H43a6 6 0 0 1-6-6V37a6 6 0 0 1 6-6Z" fill="#D29B42" transform="translate(1 2)"/><path d="M43 31h23a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6h-3v7l-10-7H43a6 6 0 0 1-6-6V37a6 6 0 0 1 6-6Z" fill={paint("gold")}/><path d="M46 42h17m-9-5v5m-6 2c1 7 7 11 14 14m-3-15c-1 6-6 11-13 15" stroke="#87551B" strokeWidth="2.4" strokeLinecap="round"/></g>
    </>}

    {kind === "money" && <>
      <g transform="rotate(-13 38 28)"><rect x="19" y="14" width="41" height="26" rx="4" fill="#319B81"/><rect x="16" y="11" width="41" height="26" rx="4" fill={paint("mint")}/><rect x="21" y="16" width="31" height="16" rx="3" stroke="#E2FFE8" strokeWidth="1.5"/><circle cx="36" cy="24" r="5" fill="#E7FFE0"/></g>
      <path d="M12 30a7 7 0 0 1 7-7h38v10H19" fill="#1B509A"/>
      <rect x="12" y="29" width="54" height="36" rx="8" fill="#174E9F" transform="translate(1 3)"/>
      <rect x="10" y="27" width="54" height="36" rx="8" fill={paint("blue")}/>
      <path d="M17 33h31" stroke="#B9E6FF" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
      <rect x="45" y="39" width="23" height="15" rx="5" fill={paint("deep")}/><circle cx="52" cy="46.5" r="2.4" fill="#FFD77B"/>
      <ellipse cx="26" cy="65" rx="12" ry="4" fill="#D68D30"/><rect x="14" y="58" width="24" height="7" fill="#ECA33C"/><ellipse cx="26" cy="58" rx="12" ry="4" fill={paint("gold")}/><ellipse cx="26" cy="57" rx="7" ry="2" stroke="#FFF0B0"/>
    </>}

    {kind === "saved" && <>
      <g transform="rotate(-8 37 43)"><rect x="15" y="23" width="43" height="42" rx="5" fill="#A0BFD3" transform="translate(2 3)"/><rect x="15" y="23" width="43" height="42" rx="5" fill={paint("paper")}/><path d="m20 53 10-8 9 9 13-12" stroke="#9FD4C4" strokeWidth="8" strokeLinejoin="round"/><path d="m25 25 5 38m12-39 5 40M18 38h38" stroke="#BCDDEB" strokeWidth="2"/><path d="M21 56c15-16 14 7 27-8" stroke="#388BE5" strokeWidth="2" strokeDasharray="3 4"/></g>
      <path d="M65 28c0 13-18 29-18 29S29 41 29 28a18 18 0 0 1 36 0Z" fill="#195AA9" transform="translate(1 3)"/><path d="M65 26c0 13-18 29-18 29S29 39 29 26a18 18 0 0 1 36 0Z" fill={paint("blue")}/><path d="M42 18h10v18l-5-4-5 4V18Z" fill="#FFDF82"/><path d="M35 23a12 12 0 0 1 8-8" stroke="#BDE9FF" strokeWidth="2.5" strokeLinecap="round"/>
    </>}

    {kind === "needs" && <>
      <path d="M25 28v-9a4 4 0 0 1 4-4h13a4 4 0 0 1 4 4v9" stroke="#4F93AC" strokeWidth="5"/><rect x="9" y="26" width="52" height="38" rx="9" fill="#237C87" transform="translate(2 3)"/><rect x="9" y="24" width="52" height="38" rx="9" fill={paint("mint")}/><path d="M18 30h13" stroke="#E0FFF0" strokeWidth="3" strokeLinecap="round"/><path d="M30 34h9v7h7v9h-7v7h-9v-7h-7v-9h7v-7Z" fill="#F8FFFD"/><path d="M73 46c0 8-12 19-12 19S49 54 49 46a12 12 0 1 1 24 0Z" fill={paint("blue")}/><circle cx="61" cy="46" r="4" fill="#EAF7FF"/>
    </>}

    {kind === "transit" && <>
      <path d="m23 65-7 8m39-8 7 8M23 68h33" stroke="#7391AB" strokeWidth="3" strokeLinecap="round"/><rect x="18" y="10" width="44" height="55" rx="13" fill="#1A4D92" transform="translate(2 3)"/><rect x="17" y="8" width="44" height="55" rx="13" fill={paint("blue")}/><rect x="29" y="13" width="19" height="5" rx="2.5" fill="#D5F3FF"/><rect x="23" y="23" width="32" height="21" rx="5" fill="#193D6D"/><path d="M25 25h13v17H25a2 2 0 0 1-2-2V27a2 2 0 0 1 2-2Zm16 0h11a3 3 0 0 1 3 3v14H41V25Z" fill="#BFE9F4"/><path d="m28 25 9 0-12 15V28Z" fill="#F3FDFF" opacity=".7"/><path d="M17 47h44v9H17Z" fill={paint("gold")}/><circle cx="26" cy="53" r="3" fill="#FFF9DE"/><circle cx="52" cy="53" r="3" fill="#FFF9DE"/><rect x="29" y="60" width="20" height="4" rx="2" fill="#22538B"/>
    </>}

    {kind === "offline" && <>
      <path d="m7 27 18-6 20 6 19-6v40l-19 6-20-6-18 6V27Z" fill="#398BB8" transform="translate(1 3)"/><path d="m7 25 18-6 20 6 19-6v40l-19 6-20-6-18 6V25Z" fill="#8FD6ED"/><path d="m25 19 20 6v40l-20-6V19Z" fill="#E0F7EF"/><path d="m45 25 19-6v40l-19 6V25Z" fill={paint("mint")}/><path d="m8 49 17-13 20 14 18-10M17 24l4 14-7 24m21-38-2 18 8 19" stroke="#F7FFFF" strokeWidth="3"/><circle cx="57" cy="29" r="18" fill="#1C5FA6" transform="translate(1 2)"/><circle cx="57" cy="27" r="18" fill={paint("blue")}/><path d="M57 16v19m-7-7 7 7 7-7M48 39h18" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </>}

    {kind === "guide" && <>
      <g transform="rotate(-9 37 39)"><rect x="15" y="12" width="44" height="55" rx="5" fill="#B17830"/><path d="M21 9h33a5 5 0 0 1 5 5v47H21a7 7 0 0 0 0 8h33" fill={paint("gold")}/><path d="M21 61h35v6H21a3 3 0 0 1 0-6Z" fill="#F9F4E6"/><path d="M22 12v43" stroke="#FFF1B9" strokeWidth="2"/><path d="M42 9h9v15l-4.5-3-4.5 3V9Z" fill="#2A86DC"/><circle cx="39" cy="39" r="12" fill="#FFF8DC"/><path d="M39 37v9" stroke="#B57B2B" strokeWidth="3.3" strokeLinecap="round"/><circle cx="39" cy="32" r="1.8" fill="#B57B2B"/></g><path d="m65 32 1.8 5.2L72 39l-5.2 1.8L65 46l-1.8-5.2L58 39l5.2-1.8L65 32Z" fill="#73B7E8"/>
    </>}

    {kind === "embassies" && <>
      <path d="M41 7v18" stroke="#5F859A" strokeWidth="2.5"/><path d="M43 7h15v10H43V7Z" fill={paint("gold")}/><path d="m10 35 30-18 30 18v6H10v-6Z" fill={paint("blue")}/><path d="m18 33 22-12 22 12H18Z" fill="#B6E7FF"/><circle cx="40" cy="29" r="3" fill="#2679C5"/><path d="M14 40h52v24H14V40Z" fill="#BAD7ED"/><path d="M21 42h7v19h-7zm15 0h7v19h-7zm15 0h7v19h-7Z" fill={paint("paper")}/><path d="M18 40h13m2 0h13m2 0h13M18 62h13m2 0h13m2 0h13" stroke="#F4FAFE" strokeWidth="3" strokeLinecap="round"/><rect x="10" y="64" width="60" height="5" rx="2" fill="#488CBD"/><rect x="7" y="69" width="66" height="3" rx="1.5" fill="#8DBED9"/>
    </>}

    {kind === "photo" && <>
      <path d="m25 24 5-9h19l5 9" fill={paint("deep")}/><rect x="10" y="25" width="59" height="38" rx="9" fill="#194C8E" transform="translate(1 3)"/><rect x="8" y="22" width="59" height="38" rx="9" fill={paint("blue")}/><rect x="13" y="26" width="10" height="5" rx="2" fill="#D8F4FF"/><circle cx="39" cy="42" r="16" fill="#C8E5EC"/><circle cx="39" cy="42" r="12" fill="#123B72"/><circle cx="39" cy="42" r="8" fill="#2D85C5"/><circle cx="36" cy="39" r="4" fill="#8EDAEF"/><circle cx="61" cy="29" r="2" fill="#FFE282"/><path d="m64 8 2.4 6.6L73 17l-6.6 2.4L64 26l-2.4-6.6L55 17l6.6-2.4L64 8Z" fill={paint("gold")}/>
    </>}

    {kind === "safety" && <>
      <path d="m40 9 25 10v20c0 16-25 29-25 29S15 55 15 39V19L40 9Z" fill="#247F78" transform="translate(1 3)"/><path d="m40 7 25 10v20c0 16-25 29-25 29S15 53 15 37V17L40 7Z" fill={paint("mint")}/><path d="m40 13 19 8v16c0 10-14 21-19 24-5-3-19-14-19-24V21l19-8Z" stroke="#DCF7E8" strokeWidth="2"/><path d="M36 25h8v9h9v8h-9v9h-8v-9h-9v-8h9v-9Z" fill="#F9FFFC"/>
    </>}

    {kind === "alerts" && <>
      <path d="M35 15v-4a4 4 0 0 1 8 0v4" stroke="#C48A36" strokeWidth="3.5"/>
      <circle cx="39" cy="60" r="7" fill="#B97927"/><circle cx="38" cy="58" r="7" fill={paint("gold")}/>
      <path d="M17 57c-3 0-4-3-2-5l5-7V32a19 19 0 0 1 38 0v13l5 7c2 2 1 5-2 5H17Z" fill="#C0802D" transform="translate(1 3)"/>
      <path d="M17 55c-3 0-4-3-2-5l5-7V30a19 19 0 0 1 38 0v13l5 7c2 2 1 5-2 5H17Z" fill={paint("gold")}/>
      <path d="M26 31c0-7 4-12 10-13M23 49h14" stroke="#FFF2BD" strokeWidth="3" strokeLinecap="round"/>
      <g transform="rotate(12 59 52)"><path d="M48 39h18l7 8-7 17H48V39Z" fill="#195199" transform="translate(1 2)"/><path d="M47 37h18l7 8-7 17H47V37Z" fill={paint("blue")}/><circle cx="64" cy="45" r="2" fill="#D6F3FF"/><path d="m52 49 4 4 7-4m-7 4v-8" stroke="#F5FBFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></g>
      <path d="m10 24-3 7m55-10 4 6" stroke="#71BBE5" strokeWidth="3" strokeLinecap="round"/>
    </>}

    {kind === "community" && <>
      <circle cx="18" cy="28" r="10" fill="#D49A43"/><circle cx="17" cy="26" r="10" fill={paint("gold")}/>
      <path d="M3 53c0-11 5-17 14-17s14 6 14 17v6H3v-6Z" fill="#D69C42" transform="translate(1 2)"/><path d="M3 51c0-10 5-16 14-16s14 6 14 16v6H3v-6Z" fill={paint("gold")}/>
      <circle cx="63" cy="28" r="10" fill="#348C7F"/><circle cx="62" cy="26" r="10" fill={paint("mint")}/>
      <path d="M48 53c0-11 5-17 14-17s14 6 14 17v6H48v-6Z" fill="#328E83" transform="translate(1 2)"/><path d="M48 51c0-10 5-16 14-16s14 6 14 16v6H48v-6Z" fill={paint("mint")}/>
      <path d="M19 62c0-15 7-24 21-24s21 9 21 24v4H19v-4Z" fill="#195499" transform="translate(1 3)"/><path d="M19 60c0-15 7-24 21-24s21 9 21 24v4H19v-4Z" fill={paint("blue")}/>
      <circle cx="41" cy="24" r="14" fill="#1C62AD"/><circle cx="40" cy="22" r="14" fill={paint("blue")}/>
      <path d="M32 17a8 8 0 0 1 7-4M26 54c1-5 3-8 7-10" stroke="#C5EDFF" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M32 38c1 5 15 5 16 0" stroke="#E3F6FF" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
    </>}

    {kind === "league" && <>
      <path d="M22 19H10v10c0 11 8 16 18 16m30-26h12v10c0 11-8 16-18 16" stroke="#CE9137" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 17H10v10c0 11 8 16 18 16m30-26h12v10c0 11-8 16-18 16" stroke="#FFD980" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M35 43h10v18H35V43Z" fill="#D49434"/><path d="M34 43h9v16h-9V43Z" fill={paint("gold")}/>
      <path d="M21 11h38v17c0 16-9 23-19 23s-19-7-19-23V11Z" fill="#C18230" transform="translate(1 3)"/>
      <path d="M21 9h38v17c0 16-9 23-19 23s-19-7-19-23V9Z" fill={paint("gold")}/>
      <path d="M27 15v11c0 6 1 10 4 13" stroke="#FFF0BC" strokeWidth="3" strokeLinecap="round"/>
      <path d="m40 18 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" fill="#FFF5CC"/>
      <path d="M25 58h30l4 9H21l4-9Z" fill="#174C98" transform="translate(1 3)"/><path d="M25 56h30l4 9H21l4-9Z" fill={paint("blue")}/><rect x="33" y="59" width="14" height="4" rx="1" fill="#FFE49A"/>
    </>}

    {kind === "events" && <>
      <g transform="rotate(-6 39 39)">
        <rect x="12" y="17" width="54" height="49" rx="8" fill="#255F9E" transform="translate(2 3)"/><rect x="11" y="15" width="54" height="49" rx="8" fill={paint("paper")}/>
        <path d="M19 15h38a8 8 0 0 1 8 8v9H11v-9a8 8 0 0 1 8-8Z" fill={paint("blue")}/>
        <path d="M24 10v12m28-12v12" stroke="#18528F" strokeWidth="5" strokeLinecap="round"/><path d="M23 9v11m28-11v11" stroke="#FFE1A0" strokeWidth="4" strokeLinecap="round"/>
        <path d="M20 39h5m10 0h5m10 0h5M20 49h5m10 0h5M20 58h5" stroke="#74AED7" strokeWidth="4" strokeLinecap="round"/>
      </g>
      <circle cx="57" cy="57" r="15" fill="#D49334" transform="translate(1 2)"/><circle cx="56" cy="55" r="15" fill={paint("gold")}/><path d="m49 55 5 5 9-11" stroke="#FFF9E5" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M47 50a10 10 0 0 1 7-5" stroke="#FFF0BB" strokeWidth="2" strokeLinecap="round"/>
    </>}

    {kind === "privacy" && <>
      <path d="m40 9 25 10v20c0 16-25 29-25 29S15 55 15 39V19L40 9Z" fill="#164A92" transform="translate(1 3)"/><path d="m40 7 25 10v20c0 16-25 29-25 29S15 53 15 37V17L40 7Z" fill={paint("blue")}/>
      <path d="m40 13 19 8v16c0 10-14 21-19 24-5-3-19-14-19-24V21l19-8Z" stroke="#C5EBFF" strokeWidth="2" opacity=".7"/>
      <path d="M32 34v-7a8 8 0 0 1 16 0v7" stroke="#ECF9FF" strokeWidth="4"/>
      <rect x="27" y="33" width="26" height="22" rx="5" fill="#BB842F" transform="translate(1 2)"/><rect x="27" y="31" width="26" height="22" rx="5" fill={paint("gold")}/>
      <circle cx="40" cy="40" r="3" fill="#9E6929"/><path d="M40 41v5" stroke="#9E6929" strokeWidth="3" strokeLinecap="round"/>
      <path d="M31 36h4" stroke="#FFF1BE" strokeWidth="2" strokeLinecap="round"/>
    </>}

    {kind === "settings" && <>
      <path d="m34 9 12 1 2 9 6 3 8-4 8 9-5 8 1 7 8 5-4 12-10-1-5 5-1 9-12 2-4-9-6-2-9 4-8-9 5-8-1-7-8-5 4-12 10 1 5-5 4-13Z" fill="#194D93" transform="translate(0 2) scale(.96)"/>
      <path d="m34 7 12 1 2 9 6 3 8-4 8 9-5 8 1 7 8 5-4 12-10-1-5 5-1 9-12 2-4-9-6-2-9 4-8-9 5-8-1-7-8-5 4-12 10 1 5-5 4-13Z" fill={paint("blue")} transform="scale(.96)"/>
      <circle cx="40" cy="39" r="18" fill="#174E96"/><circle cx="39" cy="37" r="18" fill="#BDDEF1"/><circle cx="39" cy="37" r="14" fill="#EAF7FD"/>
      <path d="M28 38a11 11 0 0 1 10-12" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="39" cy="37" r="8" fill="#CD943D"/><circle cx="38" cy="35" r="8" fill={paint("gold")}/><path d="m34 35 3 3 5-6" stroke="#FFFCED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="m28 22 4-5m17 2 4 3" stroke="#AFE5FF" strokeWidth="2.5" strokeLinecap="round"/>
    </>}

    {kind === "support" && <>
      <path d="M15 42V32a25 25 0 0 1 50 0v10" stroke="#194E96" strokeWidth="7" strokeLinecap="round"/><path d="M14 40V30a25 25 0 0 1 50 0v10" stroke="#50AFF1" strokeWidth="6" strokeLinecap="round"/>
      <path d="M20 27a20 20 0 0 1 34-11" stroke="#AFE7FF" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M26 25h27a7 7 0 0 1 7 7v17a7 7 0 0 1-7 7H39l-12 8v-8h-1a7 7 0 0 1-7-7V32a7 7 0 0 1 7-7Z" fill="#358C80" transform="translate(1 2)"/><path d="M26 23h27a7 7 0 0 1 7 7v17a7 7 0 0 1-7 7H39l-12 8v-8h-1a7 7 0 0 1-7-7V30a7 7 0 0 1 7-7Z" fill={paint("mint")}/>
      <circle cx="29" cy="39" r="2.5" fill="#F5FFFA"/><circle cx="39" cy="39" r="2.5" fill="#F5FFFA"/><circle cx="49" cy="39" r="2.5" fill="#F5FFFA"/>
      <rect x="8" y="33" width="12" height="22" rx="6" fill="#174E99" transform="translate(1 2)"/><rect x="7" y="31" width="12" height="22" rx="6" fill={paint("blue")}/>
      <rect x="60" y="33" width="12" height="22" rx="6" fill="#174E99" transform="translate(1 2)"/><rect x="59" y="31" width="12" height="22" rx="6" fill={paint("blue")}/>
      <path d="M65 52v5a9 9 0 0 1-9 9h-9" stroke="#256BAC" strokeWidth="3" strokeLinecap="round"/><rect x="38" y="61" width="14" height="7" rx="3.5" fill={paint("gold")}/>
      <path d="M11 36v9m52-9v9" stroke="#A6E0FF" strokeWidth="2" strokeLinecap="round"/>
    </>}

    {kind === "flight" && <>
      <circle cx="38" cy="37" r="27" fill="#DAF3EB"/><path d="M13 56c-4 9 4 14 14 8s16-17 30-17" stroke="#6DBBAC" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5"/>
      <g transform="rotate(25 40 38)">
        <path d="M40 7c-3 0-5 5-5 10v13L12 44v7l23-8v14l-9 8v4l14-4 14 4v-4l-9-8V43l23 8v-7L45 30V17c0-5-2-10-5-10Z" fill="#2B719B" transform="translate(1 3)"/>
        <path d="M40 5c-3 0-5 5-5 10v13L12 42v7l23-8v14l-9 8v4l14-4 14 4v-4l-9-8V41l23 8v-7L45 28V15c0-5-2-10-5-10Z" fill={paint("blue")}/>
        <path d="M40 5c-3 0-5 5-5 10v40l5 8 5-8V15c0-5-2-10-5-10Z" fill={paint("paper")}/>
        <path d="M37 16c2-2 4-2 6 0v5h-6v-5Z" fill="#418FBF"/><path d="M38 28v17" stroke="#B4DEEE" strokeWidth="2" strokeLinecap="round"/>
        <path d="m15 42 18-11m14 0 18 11" stroke="#A6E4FF" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="m29 63 6-5 5 5-11 3v-3Zm22 0-6-5-5 5 11 3v-3Z" fill={paint("gold")}/>
      </g>
      <path d="m67 12 1.5 4.5L73 18l-4.5 1.5L67 24l-1.5-4.5L61 18l4.5-1.5L67 12Z" fill="#FFD575"/>
    </>}
  </svg>;
}
