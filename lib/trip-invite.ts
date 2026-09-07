export function parseTripInvite(value: string): string {
  const text = value.trim();
  const valid = (code: string) => /^[A-Za-z0-9_-]{20,200}$/.test(code) ? code : "";
  if (valid(text)) return text;
  try {
    const url = new URL(text, "https://www.letsgo2travel.com.tr");
    const app = url.protocol === "tr.com.letsgo2travel.app:";
    const web = url.protocol === "https:" && ["letsgo2travel.com.tr","www.letsgo2travel.com.tr"].includes(url.hostname);
    if ((!app && !web) || url.username || url.password || url.port) return "";
    const invitePath = app && url.hostname === "davet" ? `/davet${url.pathname}` : url.pathname;
    const pathCode = /^\/davet\/([^/]+)\/?$/.exec(invitePath)?.[1] || "";
    return valid(url.searchParams.get("tripInvite") || decodeURIComponent(pathCode));
  } catch { return ""; }
}
