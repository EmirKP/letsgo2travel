export function safeAuthNext(search: string, origin: string) {
  const requested = new URLSearchParams(search).get("next");
  if (!requested?.startsWith("/") || requested.startsWith("//") || requested.includes("\\")) return "/profil";
  try {
    const target = new URL(requested,origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : "/profil";
  } catch { return "/profil"; }
}
