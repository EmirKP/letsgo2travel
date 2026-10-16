import { eventLocalDate } from "../../../lib/event-time";
import type { TravelEvent } from "../types";
import type { ChecklistItem } from "./supabaseData";
import { isCalendarDate } from "./dates";
import { createId } from "./id";

export type EventTripIntent = { ownerId: string; event: TravelEvent };

export function validEventTripIntent(intent: EventTripIntent | null | undefined, ownerId: string): intent is EventTripIntent {
  if (!intent || !ownerId || intent.ownerId !== ownerId) return false;
  const event = intent.event;
  return Boolean(event && event.id && event.title && /^[A-Z]{2}$/.test(event.countryCode)
    && event.city && (event.status === "scheduled" || event.status === "postponed") && isCalendarDate(eventLocalDate(event)));
}

export function travelEventChecklistItem(event: TravelEvent): ChecklistItem {
  return { id: createId(), label: event.title.slice(0, 90), completed: false, category: "other",
    createdAt: new Date().toISOString(), kind: "event", eventId: event.id,
    eventStartsAt: event.startsAt, eventLocalDate: eventLocalDate(event), eventTimeZone: event.timeZone,
    eventTimePrecision: event.timePrecision, eventCity: event.city, eventVenue: event.venue || "",
    eventCountryCode: event.countryCode, eventSourceUrl: event.ticketUrl || event.sourceUrl };
}
