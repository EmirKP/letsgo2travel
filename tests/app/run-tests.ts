// =====================================================================
// Uygulama yardımcıları testleri (ağ yok, sağlayıcı yok):
// - Havalimanı arama (ortak kaynak; şehir/ülke/ad/IATA + Türkçe alias)
// - Saat dilimi güvenli tarih yardımcıları (geçmiş/ters tarih reddi)
// Çalıştırma: npm run test:app
// =====================================================================

import assert from "node:assert";
import { airportCount, findAirportByIata, normalizeSearchText, searchAirports } from "../../lib/airport-search";
import { isIsoDateString, isPastTravelDate, isoDateAfterDays, todayIsoInTimeZone } from "../../lib/date-utils";
import { normalizePnr, tripFormError, type TripFormState } from "./_mobile/cockpitForm";
import { isPastLocalDate, localIsoDate } from "./_mobile/dates";

const tests: Array<[string, () => Promise<void> | void]> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push([name, fn]); }

// ------------------------- havalimanı arama --------------------------

test("dataset: dünya çapında ve alan bütünlüğü tam", () => {
  assert.ok(airportCount() > 3000, "en az 3000 havalimanı olmalı (dünya çapında)");
  const saw = findAirportByIata("SAW");
  assert.ok(saw, "SAW bulunmalı");
  assert.equal(saw!.countryCode, "TR");
  assert.ok(saw!.name.length > 5 && saw!.country === "Türkiye");
});

test("arama: IATA koduyla birebir eşleşme önce gelir", () => {
  const rows = searchAirports("JFK");
  assert.equal(rows[0]?.iata, "JFK");
  assert.ok(rows[0]!.city.toLowerCase().includes("new york"));
});

test("arama: şehir adıyla (IATA bilmeden) bulunur", () => {
  const rows = searchAirports("izmir");
  assert.equal(rows[0]?.iata, "ADB", "İzmir → ADB");
  const antalya = searchAirports("antalya");
  assert.equal(antalya[0]?.iata, "AYT");
});

test("arama: Türkçe karakter ve büyük/küçük harf toleranslı", () => {
  const a = searchAirports("İSTANBUL").map((r) => r.iata);
  const b = searchAirports("istanbul").map((r) => r.iata);
  assert.deepEqual(a, b, "İ/i normalize edilmeli");
  assert.ok(a.includes("IST") && a.includes("SAW"), "İstanbul araması IST ve SAW içermeli");
});

test("arama: Türkçe şehir alias'ları çalışır (Roma, Münih)", () => {
  const roma = searchAirports("roma").map((r) => r.iata);
  assert.ok(roma.includes("FCO"), `Roma → FCO bekleniyordu, gelen: ${roma.join(",")}`);
  const munih = searchAirports("münih").map((r) => r.iata);
  assert.ok(munih.includes("MUC"), "Münih → MUC");
});

test("arama: ülke adıyla arama sonuç verir", () => {
  const rows = searchAirports("gürcistan");
  assert.ok(rows.length >= 2, "Gürcistan araması havalimanları döndürmeli");
  assert.ok(rows.every((r) => r.countryCode === "GE"));
});

test("arama: havalimanı adıyla bulunur", () => {
  const rows = searchAirports("heathrow");
  assert.equal(rows[0]?.iata, "LHR");
});

test("arama: 2 karakterden kısa sorgu boş döner (performans sözleşmesi)", () => {
  assert.deepEqual(searchAirports("a"), []);
  assert.deepEqual(searchAirports(""), []);
});

test("arama: sonuç sayısı sınırlı (istemciye büyük liste inmez)", () => {
  assert.ok(searchAirports("international", 12).length <= 12);
  assert.ok(searchAirports("a b", 50).length <= 20, "üst sınır 20");
});

test("normalizeSearchText: aksan/ı normalizasyonu", () => {
  assert.equal(normalizeSearchText("İstanbul"), "istanbul");
  assert.equal(normalizeSearchText("MÜNİH"), "munih");
  assert.equal(normalizeSearchText("  Çok   Boşluk  "), "cok bosluk");
});

// ----------------------- tarih yardımcıları --------------------------

test("todayIsoInTimeZone: UTC gece yarısı çevresinde günü kaydırmaz", () => {
  // 2026-06-30T22:30Z = İstanbul'da 1 Temmuz 01:30 → İstanbul günü 07-01 olmalı
  const lateNight = new Date("2026-06-30T22:30:00Z");
  assert.equal(todayIsoInTimeZone("Europe/Istanbul", lateNight), "2026-07-01");
  // Aynı an UTC gününde hâlâ 06-30
  assert.equal(todayIsoInTimeZone("UTC", lateNight), "2026-06-30");
});

test("isPastTravelDate: geçmiş gün reddedilir, bugün kabul edilir", () => {
  const now = new Date("2026-09-02T01:00:00Z"); // İstanbul 04:00
  assert.equal(isPastTravelDate("2026-09-01", "Europe/Istanbul", now), true, "dün geçmiş");
  assert.equal(isPastTravelDate("2026-09-02", "Europe/Istanbul", now), false, "bugün geçerli");
  assert.equal(isPastTravelDate("2026-12-01", "Europe/Istanbul", now), false);
});

test("isPastTravelDate: bozuk format güvenli reddedilir", () => {
  assert.equal(isPastTravelDate("2026-02-30"), true, "olmayan gün");
  assert.equal(isPastTravelDate("01.09.2026"), true, "yanlış format");
  assert.equal(isPastTravelDate(""), true);
});

test("isoDateAfterDays: gün ekleme tutarlı", () => {
  const now = new Date("2026-09-02T10:00:00Z");
  assert.equal(isoDateAfterDays(0, "Europe/Istanbul", now), "2026-09-02");
  assert.equal(isoDateAfterDays(30, "Europe/Istanbul", now), "2026-10-02");
});

test("isIsoDateString: format doğrulama", () => {
  assert.equal(isIsoDateString("2026-10-10"), true);
  assert.equal(isIsoDateString("2026-13-01"), false);
  assert.equal(isIsoDateString("2026-1-1"), false);
});

// -------------------------- kokpit formu -----------------------------

function makeTripForm(overrides: Partial<TripFormState> = {}): TripFormState {
  return {
    mode: "flight",
    airport: { iata: "FCO", name: "Roma Fiumicino", city: "Roma", country: "İtalya", countryCode: "IT" },
    countryAlpha3: "",
    destinationCountry: "İtalya",
    destinationCode: "IT",
    destinationCity: "Roma",
    startDate: localIsoDate(10),
    endDate: localIsoDate(15),
    departureTime: "10:30",
    flightPnr: "ABC123",
    ...overrides,
  };
}

test("kokpit: geçerli form hata vermez", () => {
  assert.equal(tripFormError(makeTripForm()), "");
});

test("kokpit: uçuşlu seyahatte havalimanı seçimi zorunlu", () => {
  assert.ok(tripFormError(makeTripForm({ airport: null })).includes("havalima"));
});

test("kokpit: uçuşsuz seyahat yalnız ülke/şehir ile geçerli", () => {
  assert.equal(tripFormError(makeTripForm({ mode: "other", airport: null, flightPnr: "" })), "");
});

test("kokpit: başlangıç geçmiş olamaz", () => {
  assert.ok(tripFormError(makeTripForm({ startDate: "2020-01-01" })).includes("geçmiş"));
});

test("kokpit: bitiş başlangıçtan önce olamaz", () => {
  const error = tripFormError(makeTripForm({ startDate: localIsoDate(10), endDate: localIsoDate(5) }));
  assert.ok(error.includes("başlangıçtan önce"));
});

test("kokpit: ülke seçimsiz form reddedilir", () => {
  assert.ok(tripFormError(makeTripForm({ mode: "other", airport: null, destinationCode: "", destinationCountry: "" })).includes("ülke"));
});

test("kokpit: PNR büyük harfe çevrilir, boşluklar temizlenir", () => {
  assert.equal(normalizePnr(" ab c1 23 "), "ABC123");
  assert.equal(normalizePnr("xy-99*!"), "XY-99");
  assert.ok(tripFormError(makeTripForm({ flightPnr: normalizePnr(" ab c1 23 ") })) === "");
});

test("mobil tarih yardımcıları: geçmiş/bugün ayrımı", () => {
  assert.equal(isPastLocalDate(localIsoDate(0)), false, "bugün geçmiş değildir");
  assert.equal(isPastLocalDate(localIsoDate(-1)), true, "dün geçmiştir");
  assert.equal(isPastLocalDate("bozuk"), true);
});

// ------------------------------ runner -------------------------------

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`PASS  ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${name}`);
      console.error(error instanceof Error ? `      ${error.message}` : error);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} test gecti.`);
  if (failed > 0) process.exit(1);
})();
