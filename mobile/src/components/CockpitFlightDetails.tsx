import { formatAppDate } from "../lib/localeFormatting";
import type { FlightMatch } from "../../../lib/flight-lookup";
import { useI18n } from "../lib/i18n";

export function CockpitFlightDetails({ flight, now, compact = false }: { flight: FlightMatch; now: number; compact?: boolean }) {
  const { copy, dateLocale } = useI18n();
  const progress = flight.progress;
  const fresh = Boolean(progress?.freshUntil && Date.parse(progress.freshUntil) > now);
  const phase = progress?.phase;
  const state = phase === "en-route" ? copy("Havada bildirildi", "Reported airborne") : phase === "arrived" ? copy("Varış bildirildi", "Reported arrived")
    : progress?.status === "Delayed" ? copy("Gecikme bildirildi", "Reported delayed") : phase === "upcoming" ? copy("Kalkış öncesi", "Before departure") : copy("Plan bilgisi", "Schedule details");
  const format = (value: string, zone: string, date = false) => formatAppDate(new Date(value), dateLocale, { ...(date ? { day: "2-digit", month: "short" } : {}), hour: "2-digit", minute: "2-digit", timeZone: zone });
  const Container = compact ? "span" : "div";
  return <Container className={`cockpit-journey-flight ${compact ? "compact" : ""}`}>
    <span className="cockpit-flight-state"><span>{state}{progress && !fresh ? copy(" · son bilinen", " · last known") : ""}</span><small>{fresh ? copy("Yakın zamanda güncellendi", "Recently updated") : copy("Güncelliği doğrulanmadı", "Freshness unconfirmed")}</small></span>
    <span className="cockpit-journey-route">{(["departure", "arrival"] as const).map(movement => {
      const airport = movement === "departure" ? flight.origin : flight.destination;
      const scheduled = movement === "departure" ? flight.departureAt : flight.arrivalAt;
      const timing = progress?.[movement];
      const revised = timing?.revisedAt && timing.revisedKind !== "unknown" ? timing.revisedAt : null;
      return <span key={movement}><small>{movement === "departure" ? copy("Kalkış", "Departure") : copy("Varış", "Arrival")}</small><strong>{airport.iata}</strong><span>{airport.city}</span>
        <b>{format(revised || scheduled, airport.timeZone, true)}</b>
        <small>{revised ? timing?.revisedKind === "actual" ? copy("Gerçekleşen · kaynak bildirimi", "Actual · reported by source") : copy("Tahmini · değişebilir", "Estimated · may change") : copy("Planlanan", "Scheduled")}</small>
        {revised && revised !== scheduled && <small>{copy("Plan", "Scheduled")}: {format(scheduled, airport.timeZone, true)}</small>}
      </span>;
    })}</span>
    {!compact && <p className="cockpit-flight-freshness">{progress?.sourceUpdatedAt ? <>{copy("Kaynak güncellemesi", "Source update")}: {format(progress.sourceUpdatedAt, Intl.DateTimeFormat().resolvedOptions().timeZone, true)}</> : copy("Kaynağın güncelleme zamanı bilinmiyor.", "The source update time is unknown.")}<br/>{copy("Alındı", "Retrieved")}: {format(flight.fetchedAt, Intl.DateTimeFormat().resolvedOptions().timeZone, true)} · <a href="https://aerodatabox.com/" target="_blank" rel="noopener">AeroDataBox</a></p>}
  </Container>;
}
