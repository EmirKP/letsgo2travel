/** Cron secrets are accepted only as a bearer header, never in URLs. */
export function isAuthorizedPriceAlertCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const provided = header.slice(7).trim();
  if (!provided || provided.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i += 1) mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  return mismatch === 0;
}
