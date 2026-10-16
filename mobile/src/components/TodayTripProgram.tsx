import { useEffect, useRef } from "react";
import { useI18n } from "../lib/i18n";
import { isCalendarDate, localIsoDate } from "../lib/dates";
import type { CockpitJourneyDetails } from "../lib/cockpitJourney";
import type { CockpitTrip } from "../lib/supabaseData";
import { savedRouteDisplay } from "../lib/savedRouteDisplay";
import { RouteTranslation } from "./RouteTranslation";
import { eventLocalDate } from "../../../lib/event-time";

export function TodayTripProgram({ trip, details, ready, requestedTripId, onHandled, accessToken, loading = false }: {
  trip: CockpitTrip | null; details: CockpitJourneyDetails | null; ready: boolean;
  requestedTripId?: string; onHandled?: () => void;
  accessToken?: string; loading?: boolean;
}) {
  const { copy, locale } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const today = localIsoDate();
  const active = Boolean(trip && today >= trip.startDate && today <= trip.endDate);
  const requested = Boolean(trip && requestedTripId === trip.id);
  const day = trip ? Math.round((Date.parse(today) - Date.parse(trip.startDate)) / 86400000) + 1 : 0;
  const route = details?.route?.route;
  const routeStart = details?.route?.dates?.startDate;
  const routeDay = routeStart && isCalendarDate(routeStart) ? Math.round((Date.parse(today) - Date.parse(routeStart)) / 86400000) + 1 : day;
  const program = active && route ? savedRouteDisplay(route, locale).dailyPlan[routeDay - 1] : null;
  const events = trip?.checklistItems.filter(item => item.kind === "event" && eventLocalDate({ startsAt: item.eventStartsAt || "", localDate: item.eventLocalDate, timeZone: item.eventTimeZone, timePrecision: item.eventTimePrecision }) === today) || [];
  useEffect(() => {
    if (!requested || !ready) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "auto" });
    onHandled?.();
  }, [requested, ready, onHandled]);
  if (!trip || !active && !requested) return null;
  return <article className="cockpit-attached-route" data-testid="today-trip-program">
    <h2 ref={heading} tabIndex={-1}>{copy("Bugünün programı", "Today's itinerary", "Programi i sotëm")}</h2>
    <p>{trip.destinationCity} · {today}{active ? ` · ${copy(`${day}. gün`, `Day ${day}`, `Dita ${day}`)}` : ""}</p>
    {!ready ? <p role="status">{loading ? copy("Program yükleniyor…", "Loading itinerary…", "Po ngarkohet programi…") : copy("Program şu an okunamadı. Aşağıdaki Yenile düğmesiyle tekrar dene.", "The itinerary is unavailable. Use Reload below to try again.", "Programi nuk është i disponueshëm. Provo Rifresko më poshtë.")}</p>
      : <>{program && <p>{route?.mapJourney ? program : <RouteTranslation text={program} accessToken={accessToken}/>}</p>}{events.length > 0 && <ul>{events.map(item => <li key={item.id}><strong>{item.label}</strong>{item.eventVenue && <span> · {item.eventVenue}</span>}</li>)}</ul>}
        {!program && !events.length && <p>{copy("Bu seyahatte bugün için kayıtlı bir program yok. Planlar'dan rotanı bu seyahate ekleyebilirsin.", "This trip has no saved itinerary for today. Attach a route from Plans to this trip.", "Ky udhëtim nuk ka program të ruajtur për sot. Shto një itinerar nga Planet.")}</p>}</>}
  </article>;
}
