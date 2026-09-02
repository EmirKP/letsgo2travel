// =====================================================================
// Uygulama yardımcıları testleri (ağ yok, sağlayıcı yok):
// - Havalimanı arama (ortak kaynak; şehir/ülke/ad/IATA + Türkçe alias)
// - Saat dilimi güvenli tarih yardımcıları (geçmiş/ters tarih reddi)
// Çalıştırma: npm run test:app
// =====================================================================

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { airportCount, findAirportByIata, normalizeSearchText, searchAirports } from "../../lib/airport-search";
import { collectKeysDeep, serializeAnswer, serializeQuestionDetail, serializeQuestionSummary } from "../../lib/community/serializers";
import { ISO_COUNTRIES, isoCountryByAlpha2 } from "../../lib/countries/isoSource";
import { isIsoDateString, isPastTravelDate, isValidTimeZone, isoDateAfterDays, sanitizeTimeZone, todayIsoInTimeZone } from "../../lib/date-utils";
import { normalizeFlightNumber, normalizePnr, tripFormError, type TripFormState } from "./_mobile/cockpitForm";
import { isPastLocalDate, localIsoDate } from "./_mobile/dates";
import { tripIdFromUrl } from "./_mobile/deepLink";
import { activityPhase, cockpitDeepLink, plannedReminders } from "./_mobile/liveActivity";

const tests: Array<[string, () => Promise<void> | void]> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push([name, fn]); }

// ------------------------- havalimanı arama --------------------------

test("dataset: dünya çapında ve alan bütünlüğü tam", () => {
  assert.ok(airportCount() >= 7000, `dünya çapında IATA kapsamı ≥ 7000 olmalı (mevcut: ${airportCount()})`);
  const saw = findAirportByIata("SAW");
  assert.ok(saw, "SAW bulunmalı");
  assert.equal(saw!.countryCode, "TR");
  assert.ok(saw!.name.length > 5 && saw!.country === "Türkiye");
});

test("dataset: küçük ada/bölgesel havalimanları da bulunur (medium/large sınırı yok)", () => {
  // Aitutaki (Cook Adaları) OurAirports medium/large kümesinde YOKTUR;
  // tamamlayıcı kaynak sayesinde aranabilir olmalı.
  const ait = findAirportByIata("AIT");
  assert.ok(ait, "AIT (Aitutaki) bulunmalı");
  assert.equal(ait!.country, "Cook Adaları", "ülke adı Türkçe olmalı");
  const rows = searchAirports("aitutaki").map((r) => r.iata);
  assert.ok(rows.includes("AIT"), "ada adıyla arama AIT döndürmeli");
  const fun = findAirportByIata("FUN");
  assert.ok(fun && fun.country === "Tuvalu", "Tuvalu/Funafuti kapsanmalı");
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

// ------------------------ ülke kapsamı (ISO) -------------------------

test("ülkeler: TEK ISO 3166 kaynağı ≥ 240 kayıt ve alanlar eksiksiz", () => {
  assert.ok(ISO_COUNTRIES.length >= 240, `kapsam ≥ 240 olmalı (mevcut: ${ISO_COUNTRIES.length})`);
  for (const row of ISO_COUNTRIES) {
    assert.match(row.alpha2, /^[A-Z]{2}$/, `alpha2 bozuk: ${JSON.stringify(row)}`);
    assert.match(row.alpha3, /^[A-Z]{3}$/, `alpha3 bozuk: ${row.alpha2}`);
    assert.match(row.numeric, /^\d{3}$/, `numeric bozuk: ${row.alpha2}`);
    assert.ok(row.name.length >= 2 && row.flag.length > 0, `ad/bayrak eksik: ${row.alpha2}`);
  }
  const alpha2Set = new Set(ISO_COUNTRIES.map((row) => row.alpha2));
  assert.equal(alpha2Set.size, ISO_COUNTRIES.length, "alpha2 tekrarsız olmalı");
  assert.equal(isoCountryByAlpha2("TR")?.name, "Türkiye");
  // Küçük ada devletleri listede seçilebilir olmalı (harita şekli olmasa da).
  for (const code of ["TV", "NR", "MC", "SM", "PW"]) {
    assert.ok(alpha2Set.has(code), `${code} listede olmalı`);
  }
});

test("ülkeler: web ve mobil aynı üretilmiş kaynağı kullanır (bayt eşit)", () => {
  const web = readFileSync("lib/countries/iso3166.json", "utf8");
  const mobile = readFileSync("mobile/src/data/iso3166.json", "utf8");
  assert.equal(web, mobile, "iki iso3166.json kopyası birebir aynı olmalı (scripts/generate-countries.mjs)");
});

// ----------------------- tarih yardımcıları --------------------------

test("saat dilimi: IANA doğrulama ve temizleme", () => {
  assert.equal(isValidTimeZone("Europe/Istanbul"), true);
  assert.equal(isValidTimeZone("America/Argentina/Buenos_Aires"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone("<script>"), false);
  assert.equal(sanitizeTimeZone("Asia/Tokyo"), "Asia/Tokyo");
  assert.equal(sanitizeTimeZone("bozuk"), "Europe/Istanbul", "geçersiz → varsayılan");
  assert.equal(sanitizeTimeZone(undefined), "Europe/Istanbul", "eksik → varsayılan");
  assert.equal(sanitizeTimeZone(42), "Europe/Istanbul");
});

test("saat dilimi: geçmiş tarih denetimi kullanıcının YEREL gününe göre", () => {
  // Aynı an (2026-09-02T10:00Z): Kiritimati'de (UTC+14) 3 Eylül, Midway'de (UTC-11) 1 Eylül.
  const now = new Date("2026-09-02T10:00:00Z");
  assert.equal(todayIsoInTimeZone("Pacific/Kiritimati", now), "2026-09-03");
  assert.equal(todayIsoInTimeZone("Pacific/Midway", now), "2026-09-01");
  // 2 Eylül: Kiritimati kullanıcısı için GEÇMİŞ, Midway kullanıcısı için gelecek.
  assert.equal(isPastTravelDate("2026-09-02", "Pacific/Kiritimati", now), true);
  assert.equal(isPastTravelDate("2026-09-02", "Pacific/Midway", now), false);
  // 1 Eylül: Midway kullanıcısı için BUGÜN (geçerli).
  assert.equal(isPastTravelDate("2026-09-01", "Pacific/Midway", now), false);
});

test("saat dilimi: iki yıllık üst sınır saat dilimine göre kayar", () => {
  const now = new Date("2026-09-02T10:00:00Z");
  assert.equal(isoDateAfterDays(730, "Pacific/Kiritimati", now), "2028-09-02");
  assert.equal(isoDateAfterDays(730, "Pacific/Midway", now), "2028-08-31");
  assert.equal(isoDateAfterDays(730, "Europe/Istanbul", now), "2028-09-01");
});

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
    originAirport: { iata: "IST", name: "İstanbul Havalimanı", city: "İstanbul", country: "Türkiye", countryCode: "TR" },
    airport: { iata: "FCO", name: "Roma Fiumicino", city: "Roma", country: "İtalya", countryCode: "IT" },
    countryAlpha3: "",
    destinationCountry: "İtalya",
    destinationCode: "IT",
    destinationCity: "Roma",
    startDate: localIsoDate(10),
    endDate: localIsoDate(15),
    departureTime: "10:30",
    airline: "Türk Hava Yolları",
    flightNumber: "TK1979",
    flightPnr: "ABC123",
    ...overrides,
  };
}

test("kokpit: geçerli form hata vermez", () => {
  assert.equal(tripFormError(makeTripForm()), "");
});

test("kokpit: uçuşlu seyahatte havalimanı seçimi zorunlu", () => {
  assert.ok(tripFormError(makeTripForm({ airport: null })).includes("havalima"));
  assert.ok(tripFormError(makeTripForm({ originAirport: null })).includes("Kalkış havalimanı"));
});

test("kokpit: kalkış ve varış aynı havalimanı olamaz", () => {
  const error = tripFormError(makeTripForm({
    originAirport: { iata: "FCO", name: "Roma Fiumicino", city: "Roma", country: "İtalya", countryCode: "IT" },
  }));
  assert.ok(error.includes("aynı olamaz"));
});

test("kokpit: uçuşlu seyahatte kalkış saati ve PNR zorunlu", () => {
  assert.ok(tripFormError(makeTripForm({ departureTime: "" })).includes("saat"));
  assert.ok(tripFormError(makeTripForm({ flightPnr: "" })).includes("PNR"));
});

test("kokpit: uçuş numarası normalize edilir ve doğrulanır", () => {
  assert.equal(normalizeFlightNumber(" tk 19-79 "), "TK1979");
  assert.equal(tripFormError(makeTripForm({ flightNumber: "TK1979" })), "");
  assert.ok(tripFormError(makeTripForm({ flightNumber: "X" })).includes("Uçuş numarası"));
});

test("kokpit: uçuşsuz seyahat yalnız ülke/şehir ile geçerli", () => {
  assert.equal(tripFormError(makeTripForm({ mode: "other", originAirport: null, airport: null, flightPnr: "", departureTime: "", airline: "", flightNumber: "" })), "");
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

// ---------------------- Live Activity durumu -------------------------

test("liveActivity: evreler doğru (before/active/ended)", () => {
  const departure = "2026-10-10T10:00:00.000Z";
  assert.equal(activityPhase(departure, new Date("2026-10-10T05:00:00Z")), "before", "3 saatten önce başlamaz");
  assert.equal(activityPhase(departure, new Date("2026-10-10T07:30:00Z")), "active", "kalkışa 3 saat kala aktif");
  assert.equal(activityPhase(departure, new Date("2026-10-10T10:30:00Z")), "active", "kalkış sonrası 1 saat aktif kalır");
  assert.equal(activityPhase(departure, new Date("2026-10-10T11:30:00Z")), "ended", "1 saat sonra biter");
  assert.equal(activityPhase(null), "ended");
  assert.equal(activityPhase("bozuk-tarih"), "ended");
});

test("liveActivity: hatırlatma planı yalnız uygun uçuşlar için", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const plans = plannedReminders([
    { id: "t1", title: "Roma, İtalya", departureAt: "2026-10-10T10:00:00Z", status: "upcoming" },
    { id: "t2", title: "İptal", departureAt: "2026-10-11T10:00:00Z", status: "cancelled" },
    { id: "t3", title: "Uçuşsuz", departureAt: null, status: "upcoming" },
    { id: "t4", title: "Çok yakın", departureAt: "2026-10-01T01:00:00Z", status: "upcoming" },
  ], now);
  assert.equal(plans.length, 1, "yalnız t1 planlanmalı");
  assert.equal(plans[0].tripId, "t1");
  assert.equal(plans[0].at.toISOString(), "2026-10-10T07:00:00.000Z", "kalkıştan 3 saat önce");
  assert.ok(plans[0].body.includes("Roma"));
});

test("liveActivity: derin bağlantı tripId taşır ve ayrıştırılır", () => {
  const tripId = "a2f9c1de-4b7e-4c1a-9b3f-2f6d8e5a1c44";
  const link = cockpitDeepLink(tripId);
  assert.equal(link, `letsgo2travel://cockpit?tripId=${tripId}`);
  assert.equal(tripIdFromUrl(link), tripId, "üretilen bağlantı geri okunabilmeli");
});

test("deepLink: yalnız geçerli UUID kabul edilir", () => {
  assert.equal(tripIdFromUrl("letsgo2travel://cockpit?tripId=<script>"), null);
  assert.equal(tripIdFromUrl("letsgo2travel://cockpit?tripId=123"), null);
  assert.equal(tripIdFromUrl("letsgo2travel://cockpit"), null);
  assert.equal(tripIdFromUrl(""), null);
  assert.equal(
    tripIdFromUrl("https://www.letsgo2travel.com.tr/#cockpit?tripId=A2F9C1DE-4B7E-4C1A-9B3F-2F6D8E5A1C44"),
    "a2f9c1de-4b7e-4c1a-9b3f-2f6d8e5a1c44",
    "hash yönlendirmesi ve büyük harf normalize edilmeli",
  );
});

// -------------------- topluluk serileştiricileri ---------------------

test("forum: yanıtlar user_id/e-posta/gizli profil alanı içermez", () => {
  // Satırlara KASITLI olarak gizli alanlar eklenir; beyaz-liste bunları
  // kopyalamamalı.
  const dirtyQuestion = {
    id: "q1", user_id: "u-secret", country_code: "IT", title: "Roma",
    body: "soru", category: "genel", created_at: "2026-09-01T00:00:00Z",
    status: "visible", email: "kisi@example.com", ip_address: "1.2.3.4",
  };
  const dirtyAnswer = {
    id: "a1", user_id: "u-secret-2", question_id: "q1", body: "cevap",
    created_at: "2026-09-01T01:00:00Z", email: "cevap@example.com",
  };
  const detail = serializeQuestionDetail(dirtyQuestion, "gezgin", [serializeAnswer(dirtyAnswer, null)]);
  const summary = serializeQuestionSummary(dirtyQuestion, null, 3);
  const keys = collectKeysDeep({ detail, summary });
  for (const forbidden of ["user_id", "userId", "email", "ip_address", "status", "question_id"]) {
    assert.ok(!keys.has(forbidden), `yasak alan sızdı: ${forbidden}`);
  }
  assert.equal(detail.username, "gezgin");
  assert.equal(summary.username, "anonim_gezgin", "kullanıcı adı yoksa takma ad");
  assert.equal(detail.answers[0].username, "anonim_gezgin");
  assert.equal(summary.answerCount, 3);
  assert.equal(detail.answers.length, 1);
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
