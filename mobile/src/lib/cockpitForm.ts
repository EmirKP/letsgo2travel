// Kokpit formu saf yardımcıları (birim testlenebilir; ekran dosyasından ayrı).
import type { AirportOption } from "./airports";
import { isPastLocalDate } from "./dates";

export type TripFormState = {
  mode: "flight" | "other";
  airport: AirportOption | null;
  countryAlpha3: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  departureTime: string;
  flightPnr: string;
};

/** PNR'ı büyük harfe çevirir, boşlukları ve geçersiz karakterleri temizler. */
export function normalizePnr(value: string) {
  return value.toLocaleUpperCase("en-US").replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 20);
}

export function tripFormError(form: TripFormState, now: Date = new Date()) {
  if (form.mode === "flight" && !form.airport) return "Varış havalimanını listeden seç (uçuşsuz seyahat için 'Uçuşsuz' sekmesini kullan).";
  if (form.destinationCountry.trim().length < 2 || !/^[A-Za-z]{2}$/.test(form.destinationCode.trim())) {
    return "Gideceğin ülkeyi listeden seç.";
  }
  if (!form.startDate || !form.endDate) return "Başlangıç ve bitiş tarihlerini seç.";
  if (isPastLocalDate(form.startDate, now)) return "Başlangıç tarihi geçmiş bir gün olamaz.";
  if (form.endDate < form.startDate) return "Bitiş tarihi başlangıçtan önce olamaz.";
  if (form.flightPnr && !/^[A-Z0-9-]{3,20}$/.test(form.flightPnr.trim())) return "PNR 3–20 harf, rakam veya tire içerebilir.";
  return "";
}
