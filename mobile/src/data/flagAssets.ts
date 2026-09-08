// Bundled flag-icons (MIT) assets: no network or platform emoji support needed.
declare const __L2T_CONFIG__: unknown;
export function countryFlagAsset(code: string) {
  const normalized = code.trim().toLowerCase();
  const alpha2 = normalized === "xkk" || normalized === "xkx" ? "xk" : normalized;
  // Vite's native webDir uses './'; shared Next.js pages use public '/'.
  const base = typeof __L2T_CONFIG__ !== "undefined" ? "./" : "/";
  return /^[a-z]{2}$/.test(alpha2) ? `${base}flags/${alpha2}.svg` : "";
}
