import { useId } from "react";
import { TravelFeatureIcon } from "./TravelFeatureIcon";

export type TravelToolArtworkKind = "explore" | "translate" | "money" | "saved" | "needs" | "transit" | "offline" | "guide" | "embassies" | "photo" | "safety";

/** Companion illustrations to the Home shortcuts, decorative inside labelled buttons. */
export function TravelToolArtwork({ kind }: { kind: TravelToolArtworkKind }) {
  const id = `tool-art-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const paint = (name: string) => `url(#${id}-${name})`;
  if (kind === "explore") return <TravelFeatureIcon kind="route" size={80} />;

  return <svg className="travel-tool-artwork" width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
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
  </svg>;
}
