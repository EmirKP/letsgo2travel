import { validTimeZone, zonedParts } from "./zoned-time";

export type EventTime = { startsAt: string; localDate?: string | null; timeZone?: string | null; timePrecision?: "exact" | "date" };
type DateLabelFormatter = (date: Date, locale: string, options: Intl.DateTimeFormatOptions) => string;
const defaultDateFormatter: DateLabelFormatter = (date, locale, options) => new Intl.DateTimeFormat(locale, options).format(date);
export function eventLocalDate(event: EventTime) {
  if (event.localDate && /^\d{4}-\d{2}-\d{2}$/.test(event.localDate)) return event.localDate;
  if (validTimeZone(event.timeZone) && Number.isFinite(Date.parse(event.startsAt))) return zonedParts(Date.parse(event.startsAt), event.timeZone).date;
  return event.startsAt.slice(0, 10);
}
export function hasEventTime(event: EventTime) {
  return event.timePrecision === "exact" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.startsAt) && Number.isFinite(Date.parse(event.startsAt));
}
export function eventDateLabel(event: EventTime, locale: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }, formatter: DateLabelFormatter = defaultDateFormatter) {
  const date = new Date(`${eventLocalDate(event)}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? formatter(date, locale, { ...options, timeZone: "UTC" }) : (locale.startsWith("tr") ? "Tarih açıklanmadı" : locale.startsWith("sq") ? "Data nuk është njoftuar" : "Date not announced");
}
export function eventTimeLabel(event: EventTime, locale: string, formatter: DateLabelFormatter = defaultDateFormatter) {
  if (!hasEventTime(event)) return locale.startsWith("tr") ? "Saat açıklanmadı" : locale.startsWith("sq") ? "Ora nuk është njoftuar" : "Time not announced";
  return formatter(new Date(event.startsAt), locale, { hour: "2-digit", minute: "2-digit", timeZone: validTimeZone(event.timeZone) ? event.timeZone : "UTC", timeZoneName: "short" });
}
