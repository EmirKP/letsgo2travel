/** Keep each scan finite: only rows present before its cutoff and not checked
 * since then are candidates. A single nested OR avoids overwriting filters. */
export function priceAlertScanFilter(cutoff?: string) {
  if (!cutoff) return "notify_email.eq.true,notify_push.eq.true";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cutoff) || !Number.isFinite(Date.parse(cutoff))) throw new Error("Invalid price scan cutoff");
  const dayStart = `${cutoff.slice(0,10)}T00:00:00.000Z`;
  return `and(or(notify_email.eq.true,notify_push.eq.true),or(last_checked_at.is.null,last_checked_at.lt.${dayStart}),created_at.lte.${cutoff})`;
}

export async function remainingPriceAlertScanRows(db: any, cutoff: string, oldestDeparture: string) {
  const {count,error} = await db.from("flight_price_alerts").select("id", {count:"exact",head:true})
    .eq("is_active",true).is("cancelled_at",null).gte("departure_date",oldestDeparture)
    .in("status",["active","triggered","error"]).or(priceAlertScanFilter(cutoff));
  if (error || count === null || count === undefined) throw new Error("Price alert scan count unavailable");
  return Number(count);
}
