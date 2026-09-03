// =====================================================================
// Uygulama yardımcıları testleri (ağ yok, sağlayıcı yok):
// - Havalimanı arama (ortak kaynak; şehir/ülke/ad/IATA + Türkçe alias)
// - Saat dilimi güvenli tarih yardımcıları (geçmiş/ters tarih reddi)
// Çalıştırma: npm run test:app
// =====================================================================

import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { airportCount, findAirportByIata, normalizeSearchText, searchAirports } from "../../lib/airport-search";
import { collectKeysDeep, serializeAnswer, serializeQuestionDetail, serializeQuestionSummary } from "../../lib/community/serializers";
import {
  countryCodeFromForumSlug,
  createForumTopicSlug,
  forumCategoryFromCommunityCategory,
  forumCountrySlugFromCode,
  forumReplyLimit,
  forumStatusFromModeration,
  forumTopicIsPaywalled,
  GENERAL_FORUM_COUNTRY_CODE,
  MAX_FORUM_REPLIES_PER_DETAIL,
  PUBLIC_FORUM_REPLY_PREVIEW_COUNT,
} from "../../lib/community/forum-sync";
import { ISO_COUNTRIES, isoCountryByAlpha2 } from "../../lib/countries/isoSource";
import { isIsoDateString, isPastTravelDate, isValidTimeZone, isoDateAfterDays, sanitizeTimeZone, todayIsoInTimeZone } from "../../lib/date-utils";
import { normalizeFlightNumber, normalizePnr, tripFormError, type TripFormState } from "./_mobile/cockpitForm";
import { isPastLocalDate, localIsoDate } from "./_mobile/dates";
import { tripIdFromUrl } from "./_mobile/deepLink";
import { activityPhase, activitySyncAction, cockpitDeepLink, countdownMode, plannedReminders } from "./_mobile/liveActivity";
import { randomFallbackUuid } from "./_mobile/id";
import { canResetManagedPassword, parseModerationActionInput } from "../../lib/admin-security";
import { nextSessionGenerationValue } from "./_mobile/liveActivityGeneration";
import { guestDataCounts, guestDataSignature, mergeGuestData } from "./_mobile/guestData";
import { guestSyncOverallStatus, mergeProfileCountryIds, pendingGuestSyncAfterAttempt, routesAddedByGuestImport, runGuestSyncQueue } from "./_mobile/guestDataSyncCore";
import { snapshotPlannerInput } from "./_mobile/plannerState";
import { createPushOperationQueue, parsePendingPushDetach, resolvedPushPreference, shouldReplayPushRegistration } from "./_mobile/pushSession";
import { createTokenSyncEngine, RETRY_MAX_DELAY_MS, retryBackoffDelayMs } from "./_mobile/liveActivityTokenSync";
import { registerLiveActivityCronTests } from "./liveActivityCron";
import { registerLiveActivityAccountFlowTests } from "./liveActivityAccountFlow";
import { registerLiveActivityRetryTests } from "./liveActivityRetry";
import { registerLiveActivityTokenTests } from "./liveActivityTokens";

const tests: Array<[string, () => Promise<void> | void]> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push([name, fn]); }

test("misafir kayıt aktarımı: hesap verisini korur ve tekrar çalıştırınca kopya üretmez", () => {
  const account = {
    routes: [{ id: "account-route", value: "hesap" }],
    favorites: [{ alpha3: "DEU", value: "hesap" }],
    visitedCountries: [{ alpha3: "FRA", value: "hesap" }],
  };
  const guest = {
    routes: [{ id: "guest-route", value: "misafir" }, { id: "account-route", value: "çakışma" }],
    favorites: [{ alpha3: "ita", value: "misafir" }, { alpha3: "deu", value: "çakışma" }],
    visitedCountries: [{ alpha3: "ESP", value: "misafir" }],
  };
  const accountBefore = JSON.stringify(account);
  const guestBefore = JSON.stringify(guest);
  const first = mergeGuestData(account, guest);
  assert.deepEqual(first.added, { routes: 1, favorites: 1, visitedCountries: 1, total: 3 });
  assert.equal(first.merged.routes[0].value, "hesap", "hesap kaydı öncelikli kalmalı");
  assert.equal(first.merged.favorites[0].value, "hesap", "büyük/küçük harf çakışmasında hesap kaydı korunmalı");

  const second = mergeGuestData(first.merged, guest);
  assert.deepEqual(second.added, { routes: 0, favorites: 0, visitedCountries: 0, total: 0 });
  assert.deepEqual(second.merged, first.merged, "ikinci aktarım sonucu değişmemeli");
  assert.deepEqual(guestDataCounts(guest), { routes: 2, favorites: 2, visitedCountries: 1, total: 5 });
  assert.equal(JSON.stringify(account), accountBefore, "hesabın kaynak dizileri değişmemeli");
  assert.equal(JSON.stringify(guest), guestBefore, "misafir kaynak dizileri korunmalı");
});

test("misafir kayıt aktarımı: karar imzası sıradan bağımsız, yeni kayıtta farklıdır", () => {
  const first = {
    routes: [{ id: "r-1" }, { id: "r-2" }],
    favorites: [{ alpha3: "DEU" }, { alpha3: "ITA" }],
    visitedCountries: [{ alpha3: "FRA" }],
  };
  const reordered = {
    routes: [...first.routes].reverse(),
    favorites: [...first.favorites].reverse(),
    visitedCountries: first.visitedCountries,
  };
  assert.equal(guestDataSignature(first), guestDataSignature(reordered));
  assert.notEqual(
    guestDataSignature(first),
    guestDataSignature({ ...first, routes: [...first.routes, { id: "r-3" }] }),
    "yeni misafir verisi yeniden seçim gerektirmeli",
  );
});

test("misafir kayıt aktarımı: boş kapsamlı koleksiyon eski silinmiş veriyi diriltmez", () => {
  const storage = readFileSync("mobile/src/lib/storage.ts", "utf8");
  assert.ok(storage.includes("scopedRaw !== null"), "boş [] anahtar varlığı veri yokluğundan ayrılmalı");
  assert.ok(storage.includes("window.localStorage.removeItem(base)"), "tek sefer taşınan eski anahtar kaldırılmalı");
  assert.ok(storage.indexOf("window.localStorage.setItem(key") < storage.indexOf("window.localStorage.removeItem(base)"),
    "eski anahtar ancak kapsamlı kopya güvenle yazıldıktan sonra kaldırılmalı");
});

test("misafir web eşitlemesi: profil kimliklerini korur, yalnız eksik ülkeleri ekler", () => {
  const idToCode = (id: string) => ({ "276": "DEU", "legacy-special": null }[id] || null);
  const codeToId = (code: string) => ({ DEU: "276", ITA: "380", FRA: "250" }[code] || null);
  const result = mergeProfileCountryIds(
    ["276", "legacy-special"],
    ["deu", "ITA", "ITA", "XXX"],
    idToCode,
    codeToId,
  );
  assert.deepEqual(result, { ids: ["276", "legacy-special", "380"], added: 1 });
});

test("misafir web eşitlemesi: yalnız aktarımda eklenen rotaları tekilleştirir", () => {
  const routes = [{ id: "account-route" }, { id: "guest-route" }, { id: "guest-route" }, { id: "guest-route-2" }];
  assert.deepEqual(
    routesAddedByGuestImport(routes, new Set(["account-route"])).map((item) => item.id),
    ["guest-route", "guest-route-2"],
  );
});

test("misafir web eşitlemesi: bir rota hatası diğerlerini durdurmaz", async () => {
  let active = 0;
  let maxActive = 0;
  const outcomes = await runGuestSyncQueue(
    [{ id: "one" }, { id: "bad" }, { id: "three" }],
    (item) => item.id,
    async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (item.id === "bad") throw new Error("geçici hata");
    },
    (error) => error instanceof Error ? error.message : "bilinmeyen hata",
    2,
  );
  assert.deepEqual(outcomes, [
    { id: "one", ok: true },
    { id: "bad", ok: false, error: "geçici hata" },
    { id: "three", ok: true },
  ]);
  assert.equal(maxActive, 2, "eşitleme kuyruğu belirlenen paralellik sınırını aşmamalı");
});

test("misafir web eşitlemesi: yalnız sunucuya yazar, yerel kaynakları silmez", () => {
  const source = readFileSync("mobile/src/lib/guestDataSync.ts", "utf8");
  const storage = readFileSync("mobile/src/lib/storage.ts", "utf8");
  const dataClient = readFileSync("mobile/src/lib/supabaseData.ts", "utf8");
  const securitySql = readFileSync("supabase/migrations/20260903170000_protect_profile_roles.sql", "utf8");
  assert.ok(source.includes("upsertUserTrip("), "yeni rotalar web hesabına upsert edilmeli");
  assert.ok(source.includes("mergeUserProfileCountries("), "favori ve ziyaretler atomik profil birleştirmesine gitmeli");
  assert.ok(dataClient.includes('dataUrl("rpc/merge_mobile_profile_countries")'), "profil birleşimi RPC üzerinden yapılmalı");
  assert.ok(dataClient.includes('dataUrl("rpc/upsert_mobile_user_trip")'), "rota upsert ayrı cihazlarda da atomik RPC kullanmalı");
  assert.ok(securitySql.includes("for update") && securitySql.includes("pg_advisory_xact_lock"),
    "profil ve rota yarışları veritabanı transaction kilidiyle kapanmalı");
  for (const destructiveCall of ["deleteRoutePlan(", "setFavoriteDestinations(", "setVisitedCountries("]) {
    assert.ok(!source.includes(destructiveCall), `eşitleme yerel veriyi değiştirmemeli: ${destructiveCall}`);
  }
  assert.ok(storage.includes("GUEST_DATA_SYNC_KEY"), "ağ hatası için kalıcı eşitleme kuyruğu bulunmalı");
  assert.ok(storage.includes("queuePendingGuestDataSync"), "yerel aktarım kararından önce kalıcı kuyruğa alınmalı");
  assert.ok(storage.indexOf("queuePendingGuestDataSync(\n    accountId") < storage.indexOf('markGuestDataImportDecision(accountId, "imported")'),
    "web aktarım kuyruğu kullanıcı kararı işaretlenmeden önce saklanmalı");
  assert.ok(source.includes("report.routes.failures"), "yalnız başarısız rotalar kuyrukta kalmalı");
  assert.ok(source.includes("missingIds.map"), "cihazda geçici okunamayan rota sessiz başarı sayılmamalı");
  assert.ok(source.includes("strictProfileRead: pending.profile"), "profil okuma hatasında kalıcı kuyruk korunmalı");
  assert.ok(storage.includes("getProfileDestinationsForPendingSync"), "bekleyen profil verisi katı depolama okuması kullanmalı");
  const app = readFileSync("mobile/src/App.tsx", "utf8");
  assert.ok(app.includes("flushPendingGuestDataSync"), "bekleyen aktarım girişte/ağ dönüşünde yeniden denenmeli");
  assert.ok(app.includes('"appStateChange"'), "bekleyen aktarım uygulama öne geldiğinde yeniden denenmeli");
});

test("misafir web eşitlemesi: kısmi hata durumu başarıları kaybetmeden raporlanır", () => {
  assert.equal(guestSyncOverallStatus(0, 0, "unchanged"), "unchanged");
  assert.equal(guestSyncOverallStatus(2, 0, "synced"), "synced");
  assert.equal(guestSyncOverallStatus(1, 1, "failed"), "partial");
  assert.equal(guestSyncOverallStatus(0, 1, "unchanged"), "failed");
});

test("misafir web eşitlemesi: kuyruk yalnız başarısız ve eşitleme sırasında eklenen işi korur", () => {
  const pending = { routeIds: ["route-one", "route-two"], profile: true, revision: 2, updatedAt: "before" };
  assert.deepEqual(
    pendingGuestSyncAfterAttempt(pending, pending, ["route-two"], false, "after"),
    { routeIds: ["route-two"], profile: false, revision: 2, updatedAt: "after" },
  );
  assert.deepEqual(
    pendingGuestSyncAfterAttempt(
      pending,
      { routeIds: ["route-one", "route-two", "route-three"], profile: true, revision: 3, updatedAt: "during" },
      [],
      false,
      "after",
    ),
    { routeIds: ["route-three"], profile: true, revision: 3, updatedAt: "after" },
  );
  assert.equal(pendingGuestSyncAfterAttempt(pending, pending, [], false), null,
    "tam başarıda kalıcı kuyruk temizlenmeli");
});

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
  // Eksik değer TARAFSIZ UTC'ye düşer (sabit Europe/Istanbul varsayımı yok);
  // geçersiz değer API katmanında 400 ile reddedilir (isValidTimeZone).
  assert.equal(sanitizeTimeZone(undefined), "UTC", "eksik → UTC");
  assert.equal(sanitizeTimeZone("bozuk"), "UTC");
  assert.equal(sanitizeTimeZone(42), "UTC");
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

test("rota: üretilen planın tercihleri değişen formdan bağımsız saklanır", () => {
  const form = {
    origin: "İstanbul",
    days: "4–6 gün",
    month: "Eylül",
    budget: "Orta",
    accommodation: "Otel",
    who: "Tek başıma",
    tempo: "Dengeli",
    vibe: ["Şehir", "Kültür"],
    visa: "Vizesiz veya kolay giriş",
  };
  const snapshot = snapshotPlannerInput(form);
  form.origin = "Ankara";
  form.vibe.push("Deniz");
  assert.equal(snapshot.origin, "İstanbul");
  assert.deepEqual(snapshot.vibe, ["Şehir", "Kültür"]);

  const screen = readFileSync("mobile/src/screens/RouteAssistantScreen.tsx", "utf8");
  assert.ok(screen.includes("tripData: { input, plan, source"), "hesap kaydı üretim snapshot'ını kullanmalı");
  assert.ok(!screen.includes("tripData: { input: form"), "güncel form yanlış planla kaydedilmemeli");
});

test("mobil fiyat alarmı: hata durumu veriyi korur, yeniden deneme ve zorunlu alanlar görünürdür", () => {
  const screen = readFileSync("mobile/src/screens/PriceAlertsScreen.tsx", "utf8");
  assert.ok(screen.includes("setLoadError("), "yükleme hatası işlem/form hatasından ayrılmalı");
  assert.ok(screen.includes("Ekrandaki son kayıtların korunuyor."), "yenileme hatasında mevcut kayıtların korunduğu anlatılmalı");
  assert.ok(screen.includes("Tekrar dene"), "yükleme hatasının yeniden deneme eylemi olmalı");
  assert.ok(screen.includes("!loadError && !actionError"), "hata ile boş durum aynı anda çizilmemeli");
  assert.ok(screen.includes('<AirportField label="Nereden" required'), "kalkış seçimi semantik olarak zorunlu olmalı");
  assert.ok(screen.includes('type="date" required aria-required="true"'), "tarih semantik olarak zorunlu olmalı");
  assert.ok(screen.includes('<fieldset className="alert-channels"'), "bildirim kanalları erişilebilir bir alan grubu olmalı");
  assert.ok(screen.includes("alert.last_error_message"), "sunucunun alarm uyarısı kullanıcıya gösterilmeli");
});

test("fiyat alarmı API: aktif kayıt teslim kanalsız bırakılamaz", () => {
  const route = readFileSync("app/api/flight-alerts/[id]/route.ts", "utf8");
  const collectionRoute = readFileSync("app/api/flight-alerts/route.ts", "utf8");
  assert.ok(route.includes("resolveAlertDeliveryState("), "PATCH son kanal durumunu ortak kuralla çözmeli");
  assert.ok(route.includes("if (!delivery.valid)"), "kanalsız aktif alarm sunucuda reddedilmeli");
  assert.ok(route.includes("warnings"), "sunucu uyarıları istemciye taşınmalı");
  assert.ok(collectionRoute.includes('{ status: 503 }'), "servis yokken boş alarm listesi yerine yeniden denenebilir hata dönmeli");
  assert.ok(!collectionRoute.includes("if (!supabase) return NextResponse.json({ data: [] })"), "altyapı hatası boş liste gibi gösterilmemeli");
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

test("liveActivity: iptal/tamamlandı durumu aktif uçuşu yeniden başlatmaz", () => {
  const now = new Date("2026-10-10T10:30:00Z");
  const activeFlight = { id: "t1", title: "Roma", departureAt: "2026-10-10T10:00:00Z", status: "upcoming" };
  assert.equal(activitySyncAction(activeFlight, now), "start");
  assert.equal(activitySyncAction({ ...activeFlight, status: "cancelled" }, now), "end");
  assert.equal(activitySyncAction({ ...activeFlight, status: "completed" }, now), "end");

  const cockpit = readFileSync("mobile/src/screens/CockpitScreen.tsx", "utf8");
  const statusHandler = cockpit.slice(cockpit.indexOf("const changeStatus"), cockpit.indexOf("const persistChecklist"));
  assert.ok(cockpit.includes("listCockpitTrips(session.userId, session.accessToken, true)"), "iptal edilen seyahat yeniden açılabilmeli");
  assert.ok(statusHandler.includes("syncRemindersForSession(session, next)"), "durum değişimi cihaz hatırlatmalarını hemen eşitlemeli");
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

test("forum senkronu: web ülke slug'ı mobil ISO koduna çift yönlü çevrilir", () => {
  assert.equal(countryCodeFromForumSlug("almanya"), "DE");
  assert.equal(countryCodeFromForumSlug("bae"), "AE", "geçmiş kısa web slug'ı korunmalı");
  assert.equal(countryCodeFromForumSlug(null), GENERAL_FORUM_COUNTRY_CODE);
  assert.equal(forumCountrySlugFromCode("DE"), "almanya");
  assert.equal(forumCountrySlugFromCode(GENERAL_FORUM_COUNTRY_CODE), null);
});

test("forum ülke slug'ı: legacy veri güvenle temizlenir ve istemci yalnız canonical ülke yazar", () => {
  const canonicalSlug = (value: string) => forumCountrySlugFromCode(
    countryCodeFromForumSlug(value),
  );

  assert.equal(canonicalSlug(" BAE "), "birlesik-arap-emirlikleri", "eski alias canonical slug'a dönmeli");
  assert.equal(
    canonicalSlug("makedonya") ?? canonicalSlug("Kuzey Makedonya"),
    "kuzey-makedonya",
    "eski rehber slug'ı canonical ülke adından güvenle çözülmeli",
  );
  assert.equal(canonicalSlug("x"), null, "allowlist dışı kısa slug reddedilmeli");
  assert.equal(canonicalSlug("a".repeat(101)), null, "allowlist dışı uzun slug reddedilmeli");
  for (const country of ISO_COUNTRIES) {
    const slug = forumCountrySlugFromCode(country.alpha2);
    assert.ok(slug && slug.length >= 2 && slug.length <= 100, `${country.alpha2} canonical slug sınırında olmalı`);
    assert.equal(countryCodeFromForumSlug(slug), country.alpha2, `${country.alpha2} canonical slug geri çözülmeli`);
  }

  const countryModal = readFileSync("app/forum/ulke/[slug]/CountryQuestionModal.tsx", "utf8");
  const newTopic = readFileSync("app/forum/yeni/ClientPage.tsx", "utf8");
  for (const source of [countryModal, newTopic]) {
    assert.match(
      source,
      /forumCountrySlugFromCode\(\s*countryCodeFromForumSlug\(/,
      "forum yazma yolu ortak ISO allowlist ve canonical normalizer kullanmalı",
    );
  }
  assert.ok(countryModal.includes("if (!canonicalCountrySlug)"), "ülke modalı geçersiz route slug'ını reddetmeli");
  assert.ok(countryModal.includes("country_slug: canonicalCountrySlug"), "ülke modalı yalnız canonical slug yazmalı");
  assert.ok(newTopic.includes("if (hasSelectedCountry && !selectedCountrySlug)"), "yeni konu formu geçersiz ülkeyi reddetmeli");
  assert.ok(!newTopic.includes("initialCountrySlug || normalizeCountrySlug"), "URL slug'ı doğrulanmadan yazılmamalı");

  const migration = readFileSync(
    "supabase/migrations/20260903170000_protect_profile_roles.sql",
    "utf8",
  ).toLowerCase();
  const cleanupStart = migration.indexOf("update public.forum_topics\nset country_slug = case");
  const constraintStart = migration.indexOf("alter table public.forum_topics\nadd constraint forum_topics_country_slug_shape");
  assert.ok(cleanupStart >= 0 && cleanupStart < constraintStart, "legacy temizlik constraint'ten önce çalışmalı");
  const cleanup = migration.slice(cleanupStart, constraintStart);
  assert.ok(
    cleanup.includes("when length(nullif(lower(btrim(country_slug)), '')) between 2 and 100"),
    "legacy slug yalnız DB uzunluk sınırındaysa korunmalı",
  );
  assert.ok(cleanup.includes("else null"), "boş, kısa veya uzun legacy slug NULL'a çekilmeli");
});

test("forum senkronu: mobil kategori ve moderasyon web sözleşmesine çevrilir", () => {
  assert.equal(forumCategoryFromCommunityCategory("general"), "Ülke Bazlı Sorunlar");
  assert.equal(forumCategoryFromCommunityCategory("visa"), "Vize & Konsolosluk");
  assert.equal(forumStatusFromModeration("visible"), "published");
  assert.equal(forumStatusFromModeration("pending_review"), "pending");
  assert.equal(
    createForumTopicSlug("Almanya girişinde dönüş bileti?", "AABBCCDD-1122-4333-8444-556677889900"),
    "almanya-girisinde-donus-bileti-aabbccdd11",
  );
});

test("forum senkronu: kilitli cevap önizlemesi ve hesap yetkisi aynı kuralı kullanır", () => {
  assert.equal(forumReplyLimit(true, false), PUBLIC_FORUM_REPLY_PREVIEW_COUNT);
  assert.equal(forumReplyLimit(true, true), MAX_FORUM_REPLIES_PER_DETAIL);
  assert.equal(forumReplyLimit(false, false), MAX_FORUM_REPLIES_PER_DETAIL);
  assert.equal(forumTopicIsPaywalled("almanya", "Vize & Konsolosluk", false), true);
  assert.equal(forumTopicIsPaywalled("almanya", "Genel", true), true);
  assert.equal(forumTopicIsPaywalled("", "Genel", true), true,
    "DB normalize edilmeden önceki boş ama non-null slug güvenli biçimde kilitli kalmalı");
  assert.equal(
    forumTopicIsPaywalled(null, "Vize & Konsolosluk", true),
    false,
    "ülkesiz vize konusu web ve DB gibi herkese açık kalmalı",
  );

  const route = readFileSync("app/api/country-community/questions/[id]/route.ts", "utf8");
  const unlockRoute = readFileSync("app/api/country-community/questions/[id]/unlock/route.ts", "utf8");
  const feedRoute = readFileSync("app/api/country-community/feed/route.ts", "utf8");
  const mobile = readFileSync("mobile/src/screens/CommunityScreen.tsx", "utf8");
  const web = readFileSync("app/forum/[id]/page.tsx", "utf8");
  assert.ok(route.includes('supabase.rpc("has_forum_topic_unlock"'), "sunucu hesap kilidini doğrulamalı");
  assert.ok(route.includes('supabase.rpc(\n    "is_forum_topic_paywalled"'), "mobil detay API'si kanonik DB paywall kararını kullanmalı");
  assert.ok(web.includes("forumTopicIsPaywalled("), "web ve mobil aynı paywall yardımcısını kullanmalı");
  assert.ok(route.includes("supabase.auth.getUser(token)"), "yetki yalnız doğrulanmış oturumdan alınmalı");
  assert.ok(unlockRoute.includes("requireAuthenticatedUser(request)"), "kilit açma yalnız doğrulanmış kullanıcıyla çalışmalı");
  assert.ok(unlockRoute.includes('from("forum_country_unlocks")'), "mobil üyelik webdeki ülke kilidi kaydını kullanmalı");
  assert.ok(mobile.includes("/unlock`"), "kilitli cevaplarda kullanıcıya çalışan açma eylemi sunulmalı");
  assert.ok(feedRoute.includes('rpc("get_forum_reply_counts"'), "akış cevap sayısını sınırsız toplu sayım RPC'sinden almalı");
  assert.ok(!feedRoute.includes(".limit(5000)"), "cevap sayısı sabit satır limitinde kesilmemeli");
  assert.ok(mobile.includes("Authorization: `Bearer ${accessToken}`"), "mobil detay isteği oturumunu taşımalı");
  assert.ok(mobile.includes("totalAnswerCount ? `${totalAnswerCount} cevap`"), "detay başlığı toplam cevap sayısını kullanmalı");
  assert.ok(mobile.includes("${shownAnswerCount} gösteriliyor · ${hiddenAnswerCount} kilitli"), "gösterilen ve kilitli cevap sayıları açıklanmalı");
});

test("forum senkronu: mobil API uçları yalnız ortak web forum tablolarını kullanır", () => {
  const routeFiles = [
    "app/api/country-community/feed/route.ts",
    "app/api/country-community/questions/route.ts",
    "app/api/country-community/questions/[id]/route.ts",
    "app/api/country-community/answers/route.ts",
  ];
  const source = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.ok(source.includes('.from("forum_topics")'), "ortak konu tablosu kullanılmalı");
  assert.ok(source.includes('.from("forum_replies")'), "ortak cevap tablosu kullanılmalı");
  assert.ok(!/\.from\(["']country_questions["']\)/.test(source), "eski mobil konu tablosu kullanılmamalı");
  assert.ok(!/\.from\(["']country_answers["']\)/.test(source), "eski mobil cevap tablosu kullanılmamalı");
});

test("mobil admin: görünürlük ve bütün işlemler sunucu rolüyle korunur", () => {
  const route = readFileSync("app/api/admin/mobile-overview/route.ts", "utf8");
  const accessRoute = readFileSync("app/api/admin/mobile-access/route.ts", "utf8");
  const adminClient = readFileSync("mobile/src/lib/admin.ts", "utf8");
  const app = readFileSync("mobile/src/App.tsx", "utf8");
  const admin = readFileSync("mobile/src/screens/AdminScreen.tsx", "utf8");
  assert.ok(route.includes("requireAuthenticatedUser(request)"), "mobil admin oturumu sunucuda doğrulanmalı");
  assert.ok(route.includes('new Set(["super_admin"])'), "mobil yönetim özeti yalnız süper yöneticiye açılmalı");
  assert.ok(accessRoute.includes("requireAuthenticatedUser(request)"), "hafif erişim kontrolü doğrulanmış kullanıcı kullanmalı");
  assert.ok(accessRoute.includes('.select("role")'), "hafif erişim kontrolü yalnız rolü sorgulamalı");
  assert.ok(!accessRoute.includes("Promise.all"), "erişim kontrolü pahalı yönetim sayaçlarını çalıştırmamalı");
  assert.ok(accessRoute.includes('profile?.role === "super_admin"'), "erişim yalnız süper yönetici rolüne verilmeli");
  assert.ok(accessRoute.includes('"Cache-Control": "private, no-store"'), "rol yanıtı önbelleğe alınmamalı");
  assert.ok(adminClient.includes("getMobileAdminAccess"), "mobil istemci önce hafif erişim kontrolünü çağırabilmeli");
  assert.ok(adminClient.includes('"/api/admin/mobile-access"'), "mobil erişim yardımcısı doğru ucu kullanmalı");
  assert.ok(!route.toLocaleLowerCase("tr-TR").includes("@letsgo2travel"), "yönetici e-postası koda gömülmemeli");
  assert.ok(app.includes("isAdmin={adminAllowed}"), "admin bağlantısı yalnız hafif sunucu yetki kontrolünden sonra çizilmeli");
  assert.ok(app.includes('activeView !== "admin" || !adminAllowed'), "pahalı özet yalnız yetkili kullanıcı paneli açınca istenmeli");
  assert.ok(app.includes("scheduleRetry"), "geçici yönetim erişim hatası sınırlı biçimde yeniden denenmeli");
  assert.ok(!app.includes('.catch(() => { if (active) setAdminAllowed(false); })'), "ağ hatası yetki reddi sayılmamalı");
  assert.ok(admin.includes("getVerificationEvidence"), "belgeli gezgin kararı öncesi güvenli belge açılmalı");
  assert.ok(admin.includes("!openedEvidenceIds.has(item.id)"), "belge görülmeden onay/red düğmeleri kapalı olmalı");
});

test("profil güvenliği: kullanıcı kendi rolünü yükseltemez, güvenli tercihlerini güncelleyebilir", () => {
  const sql = readFileSync(
    "supabase/migrations/20260903170000_protect_profile_roles.sql",
    "utf8",
  ).toLowerCase();
  const allowedColumns = sql.match(
    /v_allowed_columns constant text\[\] := array\[([\s\S]*?)\];/,
  )?.[1] || "";

  assert.ok(sql.includes("revoke update on table public.profiles from public, anon, authenticated"),
    "geniş istemci UPDATE yetkisi kaldırılmalı");
  for (const column of ["username", "visited_countries", "wishlist_countries", "opt_in_leaderboard"]) {
    assert.ok(allowedColumns.includes(`'${column}'`), `${column} self-service güncellemesine açık kalmalı`);
  }
  assert.ok(!allowedColumns.includes("'role'"), "role istemci kolon beyaz listesinde olmamalı");
  assert.ok(sql.includes("as restrictive\nfor update\nto authenticated"),
    "başka permissive policy'ler kullanıcı-satır sınırını genişletememeli");
  assert.ok(sql.includes("before insert or update on public.profiles"),
    "rol hem yeni satırda hem güncellemede tetikleyiciyle korunmalı");
  assert.ok(sql.includes("new.role is distinct from old.role"), "rol değişimi OLD/NEW ile denetlenmeli");
  assert.ok(sql.includes("new.id is distinct from old.id"), "profil kimliği view veya istemci üzerinden değiştirilememeli");
  assert.ok(sql.includes("new.role is distinct from 'user'"), "istemci ayrıcalıklı rolle profil ekleyememeli");
  assert.ok(sql.includes("v_jwt_role = 'service_role'"), "güvenilir sunucu rol yönetmeye devam edebilmeli");
  assert.ok(sql.includes("revoke insert, update, delete on table public.l2t_public_profiles from public, anon, authenticated"),
    "genel profil view'i istemci DML işlemlerine kapalı olmalı");
  assert.ok(sql.includes("revoke insert, update, delete on table public.l2t_public_leaderboard from public, anon, authenticated"),
    "genel liderlik view'i istemci DML işlemlerine kapalı olmalı");

  const roleRoute = readFileSync("app/api/admin/users/[id]/role/route.ts", "utf8");
  assert.ok(roleRoute.includes('adminPrincipalFromRequest(request, ["super_admin"])'),
    "rol yönetim API'si yalnız super_admin kabul etmeli");
  assert.ok(roleRoute.includes("getSupabaseAdmin()"),
    "rol değişikliği anonim istemci yerine service-role sunucu istemcisinden yapılmalı");
});

test("mobil optimizasyon: ağır modüller bölünür, harita sabit katmanda çizilir", () => {
  const app = readFileSync("mobile/src/App.tsx", "utf8");
  const map = readFileSync("mobile/src/components/PassportWorldMap.tsx", "utf8");
  const splash = readFileSync("mobile/src/components/AnimatedSplash.tsx", "utf8");
  const airport = readFileSync("mobile/src/components/AirportField.tsx", "utf8");
  assert.ok(app.includes('lazy(() => import("./screens/PassportScreen")'), "pasaport modülü açılış paketinden ayrılmalı");
  assert.ok(app.includes('lazy(() => import("./screens/AdminScreen")'), "admin kodu yalnız gerektiğinde yüklenmeli");
  assert.ok(map.includes("const WorldCountries = memo"), "ülke path'leri pan sırasında yeniden çizilmemeli");
  assert.ok(map.includes("window.requestAnimationFrame"), "harita güncellemeleri ekran karesine göre sınırlanmalı");
  assert.ok(map.includes("pointerCountries.current.set"), "pointer capture ülke dokunuş hedefini kaybetmemeli");
  assert.ok(!map.includes("Sürükle · iki parmakla yakınlaştır"), "haritayı kapatan kalıcı yazı kaldırılmalı");
  assert.ok(airport.includes("const requestId = ++generation.current"), "eski havalimanı cevapları geçersiz kılınmalı");
  assert.ok(splash.includes('assets/splash-mark.webp'), "açılışta büyük App Store ikonu taşınmamalı");
  assert.ok(statSync("mobile/src/assets/splash-mark.webp").size < 100_000, "açılış görseli 100 KB altında olmalı");
});

test("mobil havalimanı seçici: iOS klavyesi sonuç dokunuşunu blur ile yutmaz", () => {
  const airport = readFileSync("mobile/src/components/AirportField.tsx", "utf8");
  assert.ok(!airport.includes("onBlur="), "iOS'un relatedTarget vermeyen blur olayı listeyi click öncesi kaldırmamalı");
  assert.ok(airport.includes('document.addEventListener("pointerdown", closeFromOutside)'), "alan dışı dokunuş listeyi kapatmalı");
  assert.ok(airport.includes('event.key === "Tab"'), "klavye odağı alan dışına çıkarken liste kapanmalı");
  assert.ok(airport.includes("onClick={() => selectOption(option)}"), "sonuç satırı seçimi onClick ile tamamlamalı");
});

test("mobil hesap geçişi: hesaba duyarlı ekran ağacı yeni sahipte yeniden kurulur", () => {
  const app = readFileSync("mobile/src/App.tsx", "utf8");
  assert.ok(app.includes('const authUiKey = ownerId ? `user-${ownerId}` : "guest"'), "ekran anahtarı doğrulanmış sahip kimliğini taşımalı");
  assert.ok(app.includes("<Suspense key={authUiKey}"), "hesap değişiminde eski ekran örneği yeniden kullanılmamalı");
  assert.ok(app.includes("lastUiOwnerRef.current === nextOwner"), "hesap değişimi açık taslakları temizlemeli");
});

test("mobil yayın bütünlüğü: tek manifest paket ve native sürümleri doğrular", () => {
  const release = JSON.parse(readFileSync("release-manifest.json", "utf8")) as { appVersion: string; buildNumber: number };
  const vite = readFileSync("mobile/vite.config.ts", "utf8");
  const capacitor = readFileSync("capacitor.config.ts", "utf8");
  const doctor = readFileSync("scripts/mobile-doctor.mjs", "utf8");
  const android = readFileSync("android/app/build.gradle", "utf8");
  assert.equal(release.appVersion, "1.4.0");
  assert.equal(release.buildNumber, 12);
  assert.ok(vite.includes('readFileSync(path.join(rootDir, "release-manifest.json")'), "Vite sürümü tek manifestten okumalı");
  assert.ok(vite.includes('fileName: "release.json"'), "paket kendi sürüm kanıtını içermeli");
  assert.ok(capacitor.includes('loggingBehavior: "none"'), "yayın bridge logları kapalı olmalı");
  assert.ok(capacitor.includes("zoomEnabled: true"), "sistem erişilebilirlik yakınlaştırması açık kalmalı");
  assert.ok(doctor.includes("packagedRelease?.appVersion === expectedAppVersion"), "doktor paket sürümünü kaynakla karşılaştırmalı");
  assert.ok(doctor.includes('iosConfig.loggingBehavior === "none"'), "doktor iOS üretilmiş log ayarını doğrulamalı");
  assert.ok(doctor.includes('androidConfig?.loggingBehavior === "none"'), "doktor Android üretilmiş log ayarını doğrulamalı");
  assert.ok(android.includes("releaseRequested && !googleServicesReady"), "Android release FCM yapılandırması olmadan çıkmamalı");
});

test("mobil erişilebilirlik: üst modal arka planı ayırır ve klavye odağı görünürdür", () => {
  const sheet = readFileSync("mobile/src/components/Sheet.tsx", "utf8");
  const css = readFileSync("mobile/src/App.css", "utf8");
  const indexCss = readFileSync("mobile/src/index.css", "utf8");
  assert.ok(sheet.includes("root.inert = true"), "açık modal ana uygulamayı etkileşime kapatmalı");
  assert.ok(sheet.includes("inert={!topSheet || undefined}"), "üst üste modallarda alt katman inert olmalı");
  assert.ok(sheet.includes("aria-modal={topSheet || undefined}"), "yalnız en üst modal aria-modal olmalı");
  assert.ok(indexCss.includes("button:focus-visible") && indexCss.includes("outline: 3px solid"), "klavye odağı yüksek kontrastlı olmalı");
  assert.ok(!/\.search-input input[^}]*outline:\s*0/.test(css), "arama alanı global odak halkasını bastırmamalı");
  assert.ok(!/\.alert-form input[^}]*outline:\s*0/.test(css), "alarm alanı global odak halkasını bastırmamalı");
  assert.ok(!/\.airport-field input[^}]*outline:\s*0/.test(css), "havalimanı alanı global odak halkasını bastırmamalı");
});

test("admin forum API: durum ve toplu işlem girdileri sınırlıdır", () => {
  for (const file of ["topics", "replies", "reports"]) {
    const route = readFileSync(`app/api/admin/forum/${file}/route.ts`, "utf8");
    assert.ok(route.includes("ALLOWED_STATUSES"), `${file} durum beyaz listesi olmalı`);
    assert.ok(route.includes("targetIds.length > 100"), `${file} toplu işlem sınırı olmalı`);
    assert.ok(route.includes("UUID_PATTERN"), `${file} kayıt kimlikleri doğrulanmalı`);
  }
});

test("admin güvenliği: normal yönetici ayrıcalıklı hesap şifresini değiştiremez", () => {
  assert.equal(canResetManagedPassword("admin", "admin"), false);
  assert.equal(canResetManagedPassword("admin", "super_admin"), false);
  assert.equal(canResetManagedPassword("admin", "user"), true);
  assert.equal(canResetManagedPassword("super_admin", "admin"), true);
  assert.equal(canResetManagedPassword("super_admin", "super_admin"), true);

  const route = readFileSync("app/api/admin/users/[id]/password/route.ts", "utf8");
  assert.ok(route.includes("targetProfile?.role"), "hedef hesabın rolü sunucuda okunmalı");
  assert.ok(route.includes("canResetManagedPassword(principal.role"), "rol hiyerarşisi güncellemeden önce uygulanmalı");
});

test("admin güvenliği: imzalı çerezdeki eski rol her istekte veritabanından doğrulanır", () => {
  const auth = readFileSync("lib/admin-auth.ts", "utf8");
  assert.ok(auth.includes('session.subject === "legacy-admin"'), "parola tabanlı eski yönetici yolu açıkça ayrılmalı");
  assert.ok(auth.includes("adminPrincipalFromSignedSession"), "imzalı oturum için tek güncel rol doğrulayıcısı bulunmalı");
  assert.ok(auth.includes('.from("profiles")'), "kullanıcıya bağlı admin çerezi güncel profiles rolünü okumalı");
  assert.ok(auth.includes("return { role: profile.role, subject: session.subject }"), "yetki çerez rolünden değil güncel profil rolünden dönmeli");
  const sessionRoute = readFileSync("app/api/admin/session/route.ts", "utf8");
  assert.ok(sessionRoute.includes("adminPrincipalFromSignedSession"), "admin oturum durumu da eski çerez rolünü doğrudan kabul etmemeli");
  assert.ok(sessionRoute.includes("ADMIN_ROLES"), "moderator/editor oturumları güncel rol doğrulamasında yanlışlıkla dışlanmamalı");
  const server = readFileSync("lib/admin-server.ts", "utf8");
  assert.ok(server.includes("adminPrincipalFromSignedSession(session, ADMIN_ROLES)"),
    "server action ve RSC yönetim kapıları da güncel veritabanı rolünü doğrulamalı");
});

test("admin güvenliği: moderasyon hedefi ve eylemi yalnız beyaz listeden gelir", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(parseModerationActionInput({ targetType: "question", targetId: id, action: "restore" }), {
    ok: true,
    value: { reportId: null, targetType: "question", targetId: id, action: "restore", reason: null },
  });
  assert.equal(parseModerationActionInput({ targetType: "profile", targetId: id, action: "hide" }).ok, false);
  assert.equal(parseModerationActionInput({ targetType: "question", targetId: id, action: "publish" }).ok, false);
  assert.equal(parseModerationActionInput({ targetType: "question", targetId: "not-a-uuid", action: "hide" }).ok, false);
  assert.equal(parseModerationActionInput({ targetType: "question", targetId: id, action: "close" }).ok, false);

  const route = readFileSync("app/api/admin/moderation/action/route.ts", "utf8");
  assert.ok(route.includes("MODERATION_ROLES"), "moderasyon rolleri açıkça sınırlandırılmalı");
  assert.ok(!route.includes("let newStatus = 'visible'"), "bilinmeyen eylem görünür duruma düşmemeli");
});

test("normal push: A çıkışı ve B girişi yarışsa bile son sahip B olur", async () => {
  const enqueue = createPushOperationQueue();
  const events: string[] = [];
  let owner: string | null = null;
  let releaseA: () => void = () => undefined;
  const heldA = new Promise<void>((resolve) => { releaseA = resolve; });

  const registerA = enqueue(async () => {
    await heldA;
    owner = "A";
    events.push("register-A");
  });
  const logoutA = enqueue(async () => {
    if (owner === "A") owner = null;
    events.push("logout-A");
  });
  const registerB = enqueue(async () => {
    owner = "B";
    events.push("register-B");
  });

  releaseA();
  await Promise.all([registerA, logoutA, registerB]);
  assert.deepEqual(events, ["register-A", "logout-A", "register-B"]);
  assert.equal(owner, "B", "gecikmiş A kaydı B'nin cihaz sahipliğini geri alamamalı");
});

test("normal push: logout tercihi korur ve izinli token yeni hesapta replay edilir", async () => {
  const migratedPreference = resolvedPushPreference(null, true);
  assert.equal(migratedPreference, "enabled", "eski cihaz kaydı açık tercih olarak taşınmalı");
  assert.equal(shouldReplayPushRegistration(migratedPreference, false, "granted"), true);
  assert.equal(shouldReplayPushRegistration("disabled", true, "granted"), false, "açık OS izni kullanıcı tercihini ezmemeli");
  assert.equal(shouldReplayPushRegistration("enabled", false, "denied"), false, "reddedilmiş OS izninde kayıt denenmemeli");

  const push = readFileSync("mobile/src/lib/push.ts", "utf8");
  const auth = readFileSync("mobile/src/hooks/useAuth.ts", "utf8");
  const signOutSource = auth.slice(auth.indexOf("const signOut ="));
  const app = readFileSync("mobile/src/App.tsx", "utf8");
  const server = readFileSync("app/api/push-devices/route.ts", "utf8");
  assert.ok(auth.includes("detachPushForLogout"), "logout kullanıcı tercihini kapatan işlevi çağırmamalı");
  assert.ok(signOutSource.indexOf("setSession(null)") < signOutSource.indexOf("const revokeAuthSession"),
    "yerel oturum remote logout beklenmeden kapanmalı; eski hesap yeniden push bağlayamamalı");
  assert.ok(signOutSource.includes('authUrl("/logout?scope=local")'),
    "normal çıkış başka cihazları veya yeni açılan oturumu kapatmamalı");
  assert.ok(app.includes("syncPushAfterLogin"), "yeni hesap oturumu normal push tokenını replay etmeli");
  assert.ok(app.indexOf("const cleanupSync = initLiveActivityTokenSync") < app.indexOf("void syncTokensAfterLogin(userId)"),
    "Live Activity getter/dinleyicisi soğuk açılış login eşitlemesinden önce kurulmalı");
  assert.ok(app.includes("if (active && synced"), "başarısız push/login eşitlemesi sahip olarak işaretlenmemeli");
  assert.ok(push.includes('storePushPreference("enabled")'), "logout öncesi açık tercih korunmalı");
  assert.ok(push.includes("clearPendingDetach(registered.deviceId)"),
    "token rotasyonu yalnız eşleşen bekleyen detach kaydını temizlemeli");
  assert.ok(server.includes('{ onConflict: "platform,device_token" }'), "aynı cihaz tokenı yeni hesaba atomik devredilmeli");
  assert.ok(server.includes('.eq("user_id", user.id)'), "gecikmiş logout yalnız eski sahibin satırını kapatmalı");
});

test("normal push: başarısız logout temizliği secretsiz saklanır ve tekrar denenir", () => {
  const pending = parsePendingPushDetach({
    deviceId: "11111111-aaaa-4aaa-8aaa-000000000001",
    ownerId: "22222222-bbbb-4bbb-8bbb-000000000002",
    createdAt: 1_788_451_200_000,
    token: "saklanmamasi-gereken-push-tokeni",
    accessToken: "saklanmamasi-gereken-bearer",
  });
  assert.deepEqual(pending, {
    deviceId: "11111111-aaaa-4aaa-8aaa-000000000001",
    ownerId: "22222222-bbbb-4bbb-8bbb-000000000002",
    createdAt: 1_788_451_200_000,
  }, "kalıcı kuyruk push/bearer tokenı taşımamalı");
  assert.equal(parsePendingPushDetach({ deviceId: "bozuk", ownerId: "bozuk", createdAt: 1 }), null);

  const push = readFileSync("mobile/src/lib/push.ts", "utf8");
  assert.ok(push.includes("PENDING_DETACH_STORAGE_KEY"), "başarısız detach yeniden başlatmada kaybolmamalı");
  assert.ok(push.includes("retryPendingPushDetach"), "aynı hesap yeniden girince detach tekrar denenmeli");
  assert.ok(push.includes("await pushPlugin()?.unregister"), "sunucu kapatılamazsa eski hesaba yerel teslim durdurulmalı");
});

test("Live Activity replay: token kaydı başarıya ulaşmadan giriş tamamlandı sayılmaz", async () => {
  let registerOk = false;
  let ackCount = 0;
  const engine = createTokenSyncEngine({
    getAccessToken: () => "bearer",
    getInstallationId: () => "installation",
    makeEpochId: () => "epoch",
    nextGeneration: () => 1,
    beginSession: async () => ({ ok: true }),
    send: async () => registerOk ? { ok: true } : { ok: false, status: 503 },
    ack: async () => { ackCount += 1; },
    getLatestPushToStartToken: async () => "aa11aa11aa11aa11aa11aa11aa11aa11",
  });
  assert.equal(await engine.onLogin(), false, "503 alan replay tamamlandı işaretlenmemeli");
  assert.equal(ackCount, 0, "başarısız replay native tamponu ACK etmemeli");
  registerOk = true;
  assert.equal(await engine.flushAndWait(), true, "bağlantı dönünce aynı kuşak tamamlanmalı");
  assert.equal(ackCount, 1);
});

test("uçuş hatırlatmaları: logout eski eşitlemenin arkasında seri temizlenir", () => {
  const source = readFileSync("mobile/src/lib/liveActivity.ts", "utf8");
  const logoutCleanup = source.slice(source.indexOf("export function endAllFlightActivities"));
  assert.ok(logoutCleanup.includes("++reminderSyncGeneration"), "logout bekleyen eski snapshotları hemen geçersiz kılmalı");
  assert.ok(logoutCleanup.includes("reminderSyncQueue"), "temizlik yoldaki reminder sync ile aynı kuyrukta olmalı");
  assert.ok((logoutCleanup.match(/cancelLocalFlightReminders/g) || []).length >= 2, "yerel bildirimler aktivite kapanışının iki yanında temizlenmeli");
});

test("forum SQL: temiz projede akış ve cevap tablolarını güvenli biçimde kurar", () => {
  const sql = readFileSync(
    "supabase/migrations/20260903143000_country_community_foundation.sql",
    "utf8",
  ).toLowerCase();
  for (const table of [
    "country_questions",
    "country_answers",
    "country_experience_permissions",
    "user_points_log",
  ]) {
    assert.ok(sql.includes(`create table if not exists public.${table}`), `${table} idempotent kurulmalı`);
    assert.ok(sql.includes(`alter table public.${table} enable row level security`), `${table} RLS kullanmalı`);
    assert.ok(sql.includes(`revoke all on public.${table} from anon, authenticated`), `${table} doğrudan istemciye kapalı olmalı`);
    assert.ok(sql.includes(`grant all on public.${table} to service_role`), `${table} yalnız sunucuya açık olmalı`);
  }
  assert.ok(sql.includes("where status = 'visible'"), "görünür içerik sorgusu indekslenmeli");
  assert.ok(sql.includes("notify pgrst, 'reload schema'"), "postgrest şeması yenilenmeli");
});

test("Supabase migration: her dosyanın sürüm numarası benzersizdir", () => {
  const versions = readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, version: file.split("_", 1)[0] }));
  const seen = new Map<string, string>();
  for (const item of versions) {
    const previous = seen.get(item.version);
    assert.equal(previous, undefined, `${item.version} hem ${previous} hem ${item.file} tarafından kullanılıyor`);
    seen.set(item.version, item.file);
  }
});

test("liveActivity: kalkış geçince TERS geri sayım aralığı oluşturulmaz (widget ayna kuralı)", () => {
  const departure = "2026-10-10T10:00:00.000Z";
  // Kalkıştan önce: canlı geri sayım.
  assert.equal(countdownMode(departure, new Date("2026-10-10T09:00:00Z")), "countdown");
  // Kalkış anı ve SONRASI (aktivite +1 saat açık kalır): ters
  // Date.now...departureAt aralığı YASAK — güvenli görünüm.
  assert.equal(countdownMode(departure, new Date("2026-10-10T10:00:00Z")), "departed");
  assert.equal(countdownMode(departure, new Date("2026-10-10T10:30:00Z")), "departed");
  assert.equal(countdownMode(departure, new Date("2026-10-10T10:59:59Z")), "departed");
  // Bu pencerede aktivite hâlâ AKTİF: tehlikeli birleşim testte sabitlenir.
  assert.equal(activityPhase(departure, new Date("2026-10-10T10:30:00Z")), "active");
  // Bozuk/boş veri güvenli dala düşer.
  assert.equal(countdownMode(null), "departed");
  assert.equal(countdownMode("bozuk"), "departed");
});

test("id: SON ÇARE fallback bile geçerli RFC 4122 UUID v4 üretir", () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  // Deterministik random ile de, gerçek Math.random ile de v4 biçimi korunur.
  let seed = 0.1234;
  const pseudoRandom = () => {
    seed = ((seed * 9301 + 49297) % 233280) / 233280;
    return seed;
  };
  for (let index = 0; index < 100; index += 1) {
    assert.match(randomFallbackUuid(pseudoRandom), UUID_V4, "deterministik fallback v4 olmalı");
    assert.match(randomFallbackUuid(), UUID_V4, "Math.random fallback v4 olmalı");
  }
  // Uç değerler: hep 0 / hep 1'e yakın random bile version/variant bitlerini korur.
  assert.match(randomFallbackUuid(() => 0), UUID_V4);
  assert.match(randomFallbackUuid(() => 0.999999), UUID_V4);
});

test("Live Activity generation: kalıcı sayaç monoton ve güvenli sınırda", () => {
  assert.equal(nextSessionGenerationValue(null), 1);
  assert.equal(nextSessionGenerationValue("1"), 2);
  assert.equal(nextSessionGenerationValue(42), 43);
  assert.equal(nextSessionGenerationValue(-5), 1);
  assert.equal(nextSessionGenerationValue("bozuk"), 1);
  assert.equal(nextSessionGenerationValue(Number.MAX_SAFE_INTEGER), 0, "taşmada kayıt güvenli biçimde durmalı");
});

test("Live Activity SQL: activity_update güvenlik kontrolleri ve upsert TEK atomik RPC'de", () => {
  const sql = readFileSync("supabase/migrations/20260902120000_live_activity_push_tokens.sql", "utf8");
  const match = sql.match(/create or replace function public\.register_live_activity_update\([\s\S]*?\n\$\$;/);
  assert.ok(match, "register_live_activity_update RPC bulunmalı");
  const fn = match![0];
  for (const required of [
    "pg_advisory_xact_lock",
    "live_activity_installation_sessions",
    "public.trips",
    "live_activity_epoch_bars",
    "insert into public.live_activity_tokens",
  ]) assert.ok(fn.includes(required), `atomik activity_update RPC eksik: ${required}`);
  const serverLogic = readFileSync("lib/live-activity-tokens.ts", "utf8");
  assert.ok(!serverLogic.includes('.from("live_activity_epoch_bars")'), "bar SELECT + ayrı upsert TOCTOU geri gelmemeli");
  assert.ok(!serverLogic.includes('.from("live_activity_tokens")'), "token yazımı RPC dışına çıkmamalı");
});

test("Live Activity SQL: her token kaydı güncel generation+epoch+user oturumunu zorunlu kılar", () => {
  const sql = readFileSync("supabase/migrations/20260902120000_live_activity_push_tokens.sql", "utf8");
  assert.ok(sql.includes("create table if not exists public.live_activity_installation_sessions"));
  assert.ok(sql.includes("create or replace function public.begin_live_activity_session"));
  assert.ok(sql.includes("p_generation < v_current.generation"), "düşük generation reddedilmeli");
  assert.ok(sql.includes("p_generation = v_current.generation"), "eşit generation kimlik çakışması reddedilmeli");
  assert.equal((sql.match(/and generation = p_generation and active/g) || []).length, 2,
    "PTS ve activity_update yalnız güncel aktif oturumdan yazılmalı");
  assert.ok(sql.includes("and session_epoch = p_epoch and session_generation = p_generation"),
    "gecikmiş logout yalnız kendi generation tokenlarını kapatmalı");
});

test("retry: geri çekilme SINIRLI ve tavanlı (agresif istek/sonsuz büyüme yok)", () => {
  assert.equal(retryBackoffDelayMs(0), 30_000, "ilk deneme 30 sn sonra");
  assert.equal(retryBackoffDelayMs(1), 60_000);
  assert.equal(retryBackoffDelayMs(2), 120_000);
  assert.equal(retryBackoffDelayMs(10), RETRY_MAX_DELAY_MS, "tavan 10 dk");
  assert.equal(retryBackoffDelayMs(1000), RETRY_MAX_DELAY_MS, "büyük deneme sayısı taşmaz");
  assert.equal(retryBackoffDelayMs(-5), 30_000, "negatif giriş güvenli");
  let previous = 0;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const delay = retryBackoffDelayMs(attempt);
    assert.ok(delay >= previous && delay <= RETRY_MAX_DELAY_MS, "monoton ve tavanlı olmalı");
    previous = delay;
  }
});

// ------------------- Live Activity cron çekirdeği --------------------

registerLiveActivityCronTests(test);
registerLiveActivityTokenTests(test);
registerLiveActivityAccountFlowTests(test);
registerLiveActivityRetryTests(test);

// ------------------------------ runner -------------------------------

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        Promise.resolve().then(fn),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Test 30 saniyede tamamlanmadı.")), 30_000);
        }),
      ]);
      console.log(`PASS  ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${name}`);
      console.error(error instanceof Error ? `      ${error.message}` : error);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} test gecti.`);
  if (failed > 0) process.exit(1);
})();
