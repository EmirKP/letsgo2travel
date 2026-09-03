// Kokpit formu saf yardımcıları (birim testlenebilir; ekran dosyasından ayrı).
import type { AirportOption } from "./airports";
import { isPastLocalDate } from "./dates";

export type TripFormState = {
  mode: "flight" | "other";
  /** Uçuşlu seyahatte KALKIŞ havalimanı (listeden seçilir). */
  originAirport: AirportOption | null;
  /** Uçuşlu seyahatte VARIŞ havalimanı (listeden seçilir). */
  airport: AirportOption | null;
  countryAlpha3: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  airline: string;
  flightNumber: string;
  flightPnr: string;
};

/** PNR'ı büyük harfe çevirir, boşlukları ve geçersiz karakterleri temizler. */
export function normalizePnr(value: string) {
  return value.toLocaleUpperCase("en-US").replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 20);
}

/** Uçuş numarasını normalize eder: büyük harf, yalnız harf/rakam (örn. TK1979). */
export function normalizeFlightNumber(value: string) {
  return value.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function tripFormError(form: TripFormState, now: Date = new Date(), locale: "tr" | "en" = "tr") {
  const message = (tr: string, en: string) => locale === "en" ? en : tr;
  if (form.mode === "flight") {
    if (!form.originAirport) return message("Kalkış havalimanını listeden seç.", "Choose the departure airport from the list.");
    if (!form.airport) return message("Varış havalimanını listeden seç (uçuşsuz seyahat için 'Uçuşsuz' sekmesini kullan).", "Choose the arrival airport from the list (use 'No flight' for other trips).");
    if (form.originAirport.iata === form.airport.iata) return message("Kalkış ve varış havalimanı aynı olamaz.", "Departure and arrival airports cannot be the same.");
  }
  if (form.destinationCountry.trim().length < 2 || !/^[A-Za-z]{2}$/.test(form.destinationCode.trim())) {
    return message("Gideceğin ülkeyi listeden seç.", "Choose your destination country from the list.");
  }
  if (!form.startDate || !form.endDate) return message("Başlangıç ve bitiş tarihlerini seç.", "Choose start and end dates.");
  if (isPastLocalDate(form.startDate, now)) return message("Başlangıç tarihi geçmiş bir gün olamaz.", "The start date cannot be in the past.");
  if (form.endDate < form.startDate) return message("Bitiş tarihi başlangıçtan önce olamaz.", "The end date cannot be before the start date.");
  if (form.mode === "flight") {
    if (!/^\d{2}:\d{2}$/.test(form.departureTime)) return message("Kalkış saatini seç (Ada/hatırlatma geri sayımı için gerekli).", "Choose the departure time (needed for Live Activity and reminders).");
    if (!form.arrivalDate || !/^\d{2}:\d{2}$/.test(form.arrivalTime)) return message("Planlanan varış tarihini ve saatini seç (uçuşta kalan süre için gerekli).", "Choose the scheduled arrival date and time (needed for the in-flight countdown).");
    const departureAt = new Date(`${form.startDate}T${form.departureTime}:00`).getTime();
    const arrivalAt = new Date(`${form.arrivalDate}T${form.arrivalTime}:00`).getTime();
    if (!Number.isFinite(departureAt) || !Number.isFinite(arrivalAt) || arrivalAt <= departureAt) return message("Planlanan varış, kalkıştan sonra olmalı.", "Scheduled arrival must be after departure.");
    if (!form.flightPnr.trim()) return message("PNR kodunu yaz (biletindeki rezervasyon kodu).", "Enter the PNR (the booking code on your ticket).");
  }
  if (form.flightPnr && !/^[A-Z0-9-]{3,20}$/.test(form.flightPnr.trim())) return message("PNR 3–20 harf, rakam veya tire içerebilir.", "PNR must contain 3–20 letters, numbers or hyphens.");
  if (form.flightNumber && !/^[A-Z0-9]{2,8}$/.test(form.flightNumber.trim())) return message("Uçuş numarası 2–8 harf/rakam olabilir (örn. TK1979).", "Flight number must contain 2–8 letters or numbers (e.g. TK1979).");
  if (form.airline.trim().length > 80) return message("Havayolu adı en fazla 80 karakter olabilir.", "Airline name can contain at most 80 characters.");
  return "";
}
