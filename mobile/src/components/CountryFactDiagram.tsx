import { useId } from "react";
import { countryFactClockHands, type CountryFactClockTime } from "../lib/countryFactClock";
import "./country-fact-diagram.css";

export type { CountryFactClockTime } from "../lib/countryFactClock";
export type CountryFactDiagramProps = {
  kind: "plugs" | "driving" | "time";
  plugTypes?: readonly string[];
  drivingSide?: "left" | "right";
  deviceClock?: CountryFactClockTime;
  targetClock?: CountryFactClockTime;
  deviceLabel?: string;
  targetLabel?: string;
  className?: string;
};

type SocketType = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O";
const SOCKET_TYPES = new Set<string>(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]);

function SocketFace({ type, id }: { type: SocketType; id: string }) {
  const hole = `url(#${id}-hole)`;
  // These are socket faces, not plug pin drawings. Type E has a projecting
  // earth pin; F has opposing perimeter contacts, not a third round hole.
  return <svg className="country-diagram-socket" viewBox="0 0 96 104" width="86" height="94" aria-hidden="true" focusable="false" data-socket-type={type}>
    <defs>
      <linearGradient id={`${id}-housing`} x1="15" y1="9" x2="80" y2="88" gradientUnits="userSpaceOnUse"><stop stopColor="#fffefa"/><stop offset=".6" stopColor="#f5f1e7"/><stop offset="1" stopColor="#dfdfd6"/></linearGradient>
      <radialGradient id={`${id}-recess`} cx=".48" cy=".38" r=".65"><stop stopColor="#fffdf5"/><stop offset=".72" stopColor="#e8e6dc"/><stop offset="1" stopColor="#c5c9c8"/></radialGradient>
      <linearGradient id={`${id}-hole`} x2="0" y2="1"><stop stopColor="#151f30"/><stop offset="1" stopColor="#485365"/></linearGradient>
      <linearGradient id={`${id}-metal`} x2="1" y2="1"><stop stopColor="#ffffff"/><stop offset=".45" stopColor="#a6adb4"/><stop offset="1" stopColor="#edf0ee"/></linearGradient>
    </defs>
    <ellipse cx="49" cy="89" rx="33" ry="6" fill="#153a75" opacity=".12"/>
    <rect x="10" y="9" width="78" height="80" rx="21" fill="#b2c4d8"/>
    <rect x="8" y="5" width="78" height="80" rx="21" fill={`url(#${id}-housing)`} stroke="#b8cee5" strokeWidth="1.5"/>
    <path d="M25 8h39a17 17 0 0 1 17 17" fill="none" stroke="#fff" strokeWidth="2" opacity=".9"/>
    <circle cx="47" cy="43" r="27" fill="#b8bfbd"/>
    <circle cx="47" cy="44" r="25.5" fill={`url(#${id}-recess)`} stroke="#fefcf5" strokeWidth="1.2"/>
    <circle cx="72" cy="17" r="3.2" fill="#ffe02c" stroke="#d3b715" strokeWidth=".6"/>
    {(type === "A" || type === "B") && <g data-contact="power-slots" fill={hole} stroke="#bac0bf" strokeWidth=".7"><rect x="33" y="30" width="5" height="17" rx="1.3"/><rect x="56" y="32" width="5" height="14" rx="1.3"/></g>}
    {type === "B" && <circle data-contact="earth-hole" cx="47" cy="59" r="4.8" fill={hole} stroke="#bac0bf" strokeWidth=".8"/>}
    {(type === "C" || type === "E" || type === "F" || type === "O") && <g data-contact="power-holes" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><circle cx="34" cy={type === "E" ? "49" : "43"} r="4.5"/><circle cx="60" cy={type === "E" ? "49" : "43"} r="4.5"/></g>}
    {type === "E" && <g data-contact="earth-pin"><ellipse cx="47" cy="29" rx="4" ry="3.8" fill="#aeb3b3"/><path d="M43 28v-8a4 4 0 0 1 8 0v8" fill={`url(#${id}-metal)`} stroke="#8c989e" strokeWidth=".7"/><ellipse cx="47" cy="20" rx="3.8" ry="2.1" fill="#f6f8f4" stroke="#aab4b7" strokeWidth=".6"/></g>}
    {type === "F" && <g data-contact="earth-clips" fill={`url(#${id}-metal)`} stroke="#8d999e" strokeWidth=".8"><path d="M42 18h10v8h-3v-5h-4v5h-3z"/><path d="M42 69h10v-8h-3v5h-4v-5h-3z"/></g>}
    {type === "G" && <g data-contact="rectangular-earth-and-power" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><rect data-contact-role="earth" x="43.5" y="22" width="7" height="13" rx="1"/><rect data-contact-role="power" x="27" y="45" width="14" height="6" rx="1"/><rect data-contact-role="power" x="54" y="45" width="14" height="6" rx="1"/></g>}
    {type === "L" && <g data-contact="inline-round-holes" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><circle cx="30" cy="44" r="4"/><circle data-contact-role="earth" cx="47" cy="44" r="4"/><circle cx="64" cy="44" r="4"/></g>}
    {type === "O" && <circle data-contact="earth-hole" cx="47" cy="61" r="4.8" fill={hole} stroke="#b5bcb9" strokeWidth=".8"/>}
    {(type === "D" || type === "M") && <g data-contact="round-earth-above-power" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><circle data-contact-role="earth" cx="47" cy="27" r={type === "M" ? "6" : "5.3"}/><circle cx="33" cy="51" r={type === "M" ? "4.8" : "4"}/><circle cx="61" cy="51" r={type === "M" ? "4.8" : "4"}/></g>}
    {type === "H" && <g data-contact="round-y-holes" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><circle cx="34" cy="36" r="4.3"/><circle cx="60" cy="36" r="4.3"/><circle data-contact-role="earth" cx="47" cy="59" r="4.3"/></g>}
    {type === "I" && <g data-contact="angled-power-slots" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><rect x="31" y="29" width="5.5" height="17" rx="1" transform="rotate(30 33.75 37.5)"/><rect x="57.5" y="29" width="5.5" height="17" rx="1" transform="rotate(-30 60.25 37.5)"/><rect data-contact-role="earth" x="44.3" y="52" width="5.5" height="14" rx="1"/></g>}
    {(type === "J" || type === "N") && <g data-contact="offset-round-earth" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><circle cx="31" cy="40" r="3.7"/><circle cx="63" cy="40" r="3.7"/><circle data-contact-role="earth" cx="47" cy={type === "J" ? "48.3" : "45"} r="3.7"/></g>}
    {type === "K" && <g data-contact="danish-earth" fill={hole} stroke="#b5bcb9" strokeWidth=".8"><circle cx="34" cy="38" r="4.3"/><circle cx="60" cy="38" r="4.3"/><path data-contact-role="earth" d="M41 54h12v4a6 6 0 0 1-12 0z"/></g>}
    <rect x="36" y="75" width="23" height="20" rx="7" fill="#1760bf" stroke="#fff" strokeWidth="1.5"/>
    <text x="47.5" y="89.2" textAnchor="middle" fill="#fff" fontSize="12" fontFamily="system-ui, sans-serif" fontWeight="800">{type}</text>
  </svg>;
}

function Car({ x, y, direction, blue, id }: { x: number; y: number; direction: "up" | "down"; blue: boolean; id: string }) {
  return <g transform={`translate(${x} ${y})${direction === "down" ? " rotate(180)" : ""}`} data-car-direction={direction}>
    <ellipse cx="2" cy="3" rx="15" ry="24" fill="#071b32" opacity=".18"/>
    <g fill="#152735"><rect x="-14" y="-13" width="4" height="10" rx="1.5"/><rect x="10" y="-13" width="4" height="10" rx="1.5"/><rect x="-14" y="9" width="4" height="10" rx="1.5"/><rect x="10" y="9" width="4" height="10" rx="1.5"/></g>
    <rect x="-11" y="-23" width="22" height="46" rx="8" fill={blue ? `url(#${id}-car)` : "#fff7d5"} stroke={blue ? "#c2e7ff" : "#e6d6a5"} strokeWidth="1"/>
    <path d="m-7-13 2-5H5l2 5v5H-7z" fill="#163b5d"/>
    <path d="M-7 9H7l-1 7H-6z" fill="#37617a"/>
    <path d="M-7-5v11M7-5v11" stroke={blue ? "#7cc3f4" : "#dacb9e"} strokeWidth="1.3"/>
    <path d="M-8-21h4m8 0h4" stroke="#fff4a8" strokeWidth="2.3" strokeLinecap="round"/>
    <path d="M-8 20h4m8 0h4" stroke="#e26f65" strokeWidth="1.8" strokeLinecap="round"/>
  </g>;
}

function DrivingDiagram({ side, id }: { side: "left" | "right"; id: string }) {
  const forward = side === "right" ? 108 : 60, opposing = side === "right" ? 60 : 108;
  return <svg className="country-diagram-road" viewBox="0 0 168 124" width="168" height="124" aria-hidden="true" focusable="false" data-driving-side={side}>
    <defs><linearGradient id={`${id}-road`} x1="26" y1="0" x2="136" y2="120" gradientUnits="userSpaceOnUse"><stop stopColor="#526877"/><stop offset="1" stopColor="#283e50"/></linearGradient><linearGradient id={`${id}-car`} x2="1" y2="1"><stop stopColor="#52bbff"/><stop offset=".55" stopColor="#2477d3"/><stop offset="1" stopColor="#074caa"/></linearGradient></defs>
    <rect x="27" y="8" width="118" height="112" rx="25" fill="#173869" opacity=".13"/>
    <rect x="24" y="2" width="120" height="116" rx="24" fill="#bdcfd9"/>
    <rect x="30" y="2" width="108" height="116" rx="19" fill={`url(#${id}-road)`}/>
    <path d="M35 19v82M133 19v82" stroke="#d8e5ea" strokeWidth="1.8"/>
    <path d="M84 8v103" stroke="#ffe03d" strokeWidth="2.8" strokeDasharray="12 10"/>
    <g data-forward-lane={side}>
      <path data-arrow-direction="up" d={`M${forward} 38V17m-7 7 7-7 7 7`} fill="none" stroke="#f9fcff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <Car x={forward} y={81} direction="up" blue id={id}/>
    </g>
    <g data-opposing-lane={side === "right" ? "left" : "right"}>
      <Car x={opposing} y={38} direction="down" blue={false} id={id}/>
      <path data-arrow-direction="down" d={`M${opposing} 81v23m-7-7 7 7 7-7`} fill="none" stroke="#e9f0ed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  </svg>;
}

function ClockFace({ clock, label, id }: { clock: CountryFactClockTime; label?: string; id: string }) {
  const hands = countryFactClockHands(clock)!;
  return <figure className="country-diagram-clock">
    <svg viewBox="0 0 90 92" width="82" height="84" aria-hidden="true" focusable="false" data-clock-hour={clock.hour} data-clock-minute={clock.minute}>
      <defs><linearGradient id={`${id}-rim`} x1="12" y1="12" x2="76" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="#79c2f0"/><stop offset=".35" stopColor="#2678cf"/><stop offset="1" stopColor="#154b9c"/></linearGradient><radialGradient id={`${id}-face`} cx=".4" cy=".3" r=".8"><stop stopColor="#fffef8"/><stop offset="1" stopColor="#eeeadd"/></radialGradient></defs>
      <ellipse cx="46" cy="82" rx="33" ry="6" fill="#153a75" opacity=".13"/>
      <circle cx="45" cy="43" r="36" fill={`url(#${id}-rim)`} stroke="#b7daef" strokeWidth="1"/>
      <circle cx="45" cy="43" r="30.5" fill={`url(#${id}-face)`} stroke="#d2d4ca" strokeWidth="1"/>
      <g transform="translate(45 43)" stroke="#365268" strokeLinecap="round">{Array.from({ length: 12 }, (_, index) => <line key={index} x1="0" y1="-25" x2="0" y2={index % 3 === 0 ? "-20.5" : "-23"} transform={`rotate(${index * 30})`} strokeWidth={index % 3 === 0 ? "1.7" : "1"}/>)}</g>
      <g transform="translate(45 43)" strokeLinecap="round"><line data-clock-hand="hour" x1="0" y1="3" x2="0" y2="-14" transform={`rotate(${hands.hour})`} stroke="#143b63" strokeWidth="3.5"/><line data-clock-hand="minute" x1="0" y1="4" x2="0" y2="-22" transform={`rotate(${hands.minute})`} stroke="#1e72c9" strokeWidth="2.4"/><circle r="3.3" fill="#ffdf2c" stroke="#af8e13" strokeWidth=".6"/></g>
    </svg>
    <figcaption>{label && <span>{label}</span>}<strong>{String(clock.hour).padStart(2, "0")}:{String(clock.minute).padStart(2, "0")}</strong></figcaption>
  </figure>;
}

/** Country data supplies the facts; these illustrations make their meaning visible. */
export function CountryFactDiagram({ kind, plugTypes, drivingSide, deviceClock, targetClock, deviceLabel, targetLabel, className = "" }: CountryFactDiagramProps) {
  const id = `country-diagram-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const classes = `country-fact-diagram country-fact-diagram--${kind} ${className}`.trim();
  if (kind === "plugs") {
    const types = [...new Set((plugTypes || []).map(type => type.trim().toUpperCase()))].filter((type): type is SocketType => SOCKET_TYPES.has(type));
    if (!types.length) return null;
    return <div className={classes} data-diagram="plugs" data-type-count={types.length} aria-hidden="true">{types.map(type => <SocketFace key={type} type={type} id={`${id}-${type}`}/>)}</div>;
  }
  if (kind === "driving") {
    if (drivingSide !== "left" && drivingSide !== "right") return null;
    return <div className={classes} data-diagram="driving" aria-hidden="true"><DrivingDiagram side={drivingSide} id={id}/></div>;
  }
  if (!countryFactClockHands(deviceClock) || !countryFactClockHands(targetClock)) return null;
  return <div className={classes} data-diagram="time"><ClockFace clock={deviceClock!} label={deviceLabel} id={`${id}-device`}/><ClockFace clock={targetClock!} label={targetLabel} id={`${id}-target`}/></div>;
}
