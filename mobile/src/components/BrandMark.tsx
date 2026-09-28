import "./brand-logo.css";

/** Scalable wordmark following the user's September 28 app reference. */
export function BrandMark({ decorative = false }: { decorative?: boolean }) {
  return <svg className="brand-logo" viewBox="0 0 330 110" width="330" height="110" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : "LetsGo2Travel · Daha Fazla Keşfet"} focusable="false">
    <g transform="translate(212 0) scale(.84)" fill="#fff"><path d="m20 24 14 4L91 5c6-3 10-2 8 1-2 3-6 5-10 7L49 33l-15 1-15-8Zm32-4L31 8l8-1 29 7M18 28 8 18l5-1 20 9"/><path d="M4 33q10 7 26 1" fill="none" stroke="#ffda24" strokeWidth="1.5"/></g>
    <text x="4" y="72" fill="#fff" fontFamily="Inter, sans-serif" fontSize="43" fontWeight="700" letterSpacing="-2">LetsGo<tspan fill="#ffda24">2</tspan>Travel</text>
    <text x="6" y="97" fill="#d2e7f8" fontFamily="Inter, sans-serif" fontSize="19">Daha Fazla Keşfet</text>
  </svg>;
}
