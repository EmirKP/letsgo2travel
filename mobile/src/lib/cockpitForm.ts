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

export function tripFormError(form: TripFormState, now: Date = new Date()) {
  if (form.mode === "flight") {
    if (!form.originAirport) return "Kalkış havalimanını listeden seç.";
    if (!form.airport) return "Varış havalimanını listeden seç (uçuşsuz seyahat için 'Uçuşsuz' sekmesini kullan).";
    if (form.originAirport.iata === form.airport.iata) return "Kalkış ve varış havalimanı aynı olamaz.";
  }
  if (form.destinationCountry.trim().length < 2 || !/^[A-Za-z]{2}$/.test(form.destinationCode.trim())) {
    return "Gideceğin ülkeyi listeden seç.";
  }
  if (!form.startDate || !form.endDate) return "Başlangıç ve bitiş tarihlerini seç.";
  if (isPastLocalDate(form.startDate, now)) return "Başlangıç tarihi geçmiş bir gün olamaz.";
  if (form.endDate < form.startDate) return "Bitiş tarihi başlangıçtan önce olamaz.";
  if (form.mode === "flight") {
    if (!/^\d{2}:\d{2}$/.test(form.departureTime)) return "Kalkış saatini seç (Ada/hatırlatma geri sayımı için gerekli).";
    if (!form.flightPnr.trim()) return "PNR kodunu yaz (biletindeki rezervasyon kodu).";
  }
  if (form.flightPnr && !/^[A-Z0-9-]{3,20}$/.test(form.flightPnr.trim())) return "PNR 3–20 harf, rakam veya tire içerebilir.";
  if (form.flightNumber && !/^[A-Z0-9]{2,8}$/.test(form.flightNumber.trim())) return "Uçuş numarası 2–8 harf/rakam olabilir (örn. TK1979).";
  if (form.airline.trim().length > 80) return "Havayolu adı en fazla 80 karakter olabilir.";
  return "";
}
