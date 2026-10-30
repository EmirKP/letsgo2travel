import { translateAppCopy } from '../../../lib/locale-copy';
import crypto from "crypto";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { aiRouteErrorReply, aiRouteOperation, aiRouteReply, requireAiRouteAccount } from "@/lib/ai-route-quota";
import { generateBoundedGroqJourneyJson, groqJourneyModel } from "@/lib/travel-assistant/journey-plan-groq";
import { journeyPlanProviderError, journeyPlanWait } from "@/lib/travel-assistant/journey-plan";
import { boundedJson } from "@/lib/travel-assistant/http";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findAirportByIata } from "@/lib/airport-search";
import { fixedDestinationStarter, routeMatchesDestination, validPlanDays, type PlanDestination, type PlanLocale } from "@/lib/route-planner";
import { normalizePlannerPreferences, plannerPreferenceInstructions, starterPreferenceNote, validTravelParty } from "@/lib/planner-preferences";
import {
  visaRuleMatchesPreference,
} from "@/lib/visa-entry-rules";

import { normalizePlannerPassport, validPlannerPassport, plannerEntry, plannerPassportLabel } from "@/lib/planner-passport";

export const maxDuration = 45;

const AI_REQUEST_TIMEOUT_MS = 18_000;
const PLAN_CACHE_VERSION = "passport-v8-complete-ai-2026-10-18";

type PlannerInput = ReturnType<typeof normalizeInput>;

type AiRouteData = {
  name: string;
  country: string;
  cityOrRegion: string;
  destinationCode?: string;
  why: string;
  visaStatus: string;
  visaNote: string;
  visaSourceUrl: string;
  visaVerifiedAt: string | null;
  verifiedEntryStatus: ReturnType<typeof plannerEntry>["verifiedEntryStatus"];
  estimatedBudget: string;
  idealDuration: string;
  bestFor: string;
  difficulty: string;
  firstTimeFriendly: boolean;
  transportEase: string;
  safetyNote: string;
  scores: {
    budget: number;
    visaEase: number;
    firstTime: number;
    transport: number;
    overall: number;
  };
  dailyPlan: string[];
  warnings: string[];
  cta: {
    guideText: string;
    forumText: string;
  };
};

type AiPlanData = {
  summary: string;
  routes: AiRouteData[];
};

type FallbackProfile = {
  name: string;
  country: string;
  why: string;
  bestFor: string;
  transportEase: string;
  safetyNote: string;
  dailyPlan: string[];
};

const fallbackProfiles: Record<string, FallbackProfile> = {
  saraybosna: {
    name: "Saraybosna",
    country: "Bosna-Hersek",
    why: "Yürüyerek keşfedilebilen merkez ve bütçe dostu seçenekleriyle güçlü bir kısa rota.",
    bestFor: "İlk yurt dışı deneyimi ve kültür gezisi",
    transportEase: "Kolay",
    safetyNote: "Turistik ve kalabalık alanlarda standart kişisel güvenlik önlemlerini al.",
    dailyPlan: [
      "1. Gün: Başçarşı, Sebil ve Latin Köprüsü",
      "2. Gün: Umut Tüneli ve Trebeviç",
      "3. Gün: Vrelo Bosne veya Mostar günü",
    ],
  },
  uskup: {
    name: "Üsküp",
    country: "Kuzey Makedonya",
    why: "Kısa şehir molası ve merkezde kolay ulaşım sayesinde hafta sonu için uygulanabilir bir Balkan rotası.",
    bestFor: "Kısa kaçamak ve Balkan kültürü",
    transportEase: "Kolay",
    safetyNote: "Gece geç saatlerde tenha bölgeler yerine merkezi ulaşım noktalarını tercih et.",
    dailyPlan: [
      "1. Gün: Makedonya Meydanı, Taş Köprü ve Eski Çarşı",
      "2. Gün: Matka Kanyonu",
      "3. Gün: Vodno veya Ohrid bağlantısı ve dönüş",
    ],
  },
  belgrad: {
    name: "Belgrad",
    country: "Sırbistan",
    why: "Canlı şehir hayatı ve güçlü toplu taşıma ağıyla arkadaş grupları için dengeli bir seçenek.",
    bestFor: "Şehir hayatı, gastronomi ve arkadaşlarla gezi",
    transportEase: "Kolay",
    safetyNote: "Kalabalık ulaşım araçlarında çanta ve telefon güvenliğine dikkat et.",
    dailyPlan: [
      "1. Gün: Knez Mihailova ve Kalemegdan",
      "2. Gün: Zemun ve nehir kıyısı",
      "3. Gün: Aziz Sava Katedrali ve dönüş",
    ],
  },
  baku: {
    name: "Bakü",
    country: "Azerbaycan",
    why: "Kompakt merkez ve sahil yürüyüşleriyle pratik bir şehir rotası.",
    bestFor: "Şehir gezisi ve sahil yürüyüşleri",
    transportEase: "Kolay",
    safetyNote: "Resmî taksileri veya uygulama üzerinden çağrılan araçları tercih et.",
    dailyPlan: [
      "1. Gün: İçerişehir ve sahil hattı",
      "2. Gün: Haydar Aliyev Merkezi ve Ateşgah",
      "3. Gün: Nizami Caddesi ve dönüş",
    ],
  },
  tiflis: {
    name: "Tiflis",
    country: "Gürcistan",
    why: "Uygun şehir içi seçenekleri ve güçlü gastronomi rotasıyla kolay planlanabilir.",
    bestFor: "Ekonomik keşif ve gastronomi",
    transportEase: "Kolay",
    safetyNote: "Seyahat tarihlerini kapsayan zorunlu sağlık ve kaza sigortasını girişte sunmaya hazır tut.",
    dailyPlan: [
      "1. Gün: Eski Tiflis ve Narikala",
      "2. Gün: Kükürt hamamları ve Rustaveli",
      "3. Gün: Yerel pazar ve dönüş",
    ],
  },
  kisinev: {
    name: "Kişinev",
    country: "Moldova",
    why: "Sakin şehir temposuyla kısa, düşük yoğunluklu bir rota sunar.",
    bestFor: "Sakin hafta sonu ve ilk yurt dışı deneyimi",
    transportEase: "Orta",
    safetyNote: "Transdinyester bölgesine yönelik güncel resmî seyahat uyarılarını ayrıca kontrol et.",
    dailyPlan: [
      "1. Gün: Merkez parklar ve Stefan cel Mare Bulvarı",
      "2. Gün: Müze ve yerel gastronomi rotası",
      "3. Gün: Pazar gezisi ve dönüş",
    ],
  },
  roma: {
    name: "Roma",
    country: "İtalya",
    why: "Tarih, gastronomi ve yürüyüş ağırlıklı şehir deneyimiyle romantik veya kültür odaklı planlara uygundur.",
    bestFor: "Kültür, tarih ve romantik şehir tatili",
    transportEase: "Kolay",
    safetyNote: "Yoğun turistik alanlarda yankesiciliğe karşı çantanı kapalı tut.",
    dailyPlan: [
      "1. Gün: Kolezyum, Forum ve Trevi Çeşmesi",
      "2. Gün: Vatikan ve Trastevere",
      "3. Gün: Pantheon, Navona ve dönüş",
    ],
  },
  budapeste: {
    name: "Budapeşte",
    country: "Macaristan",
    why: "Tuna manzarası, termal hamamlar ve kompakt merkez sayesinde çiftler için dengeli bir şehir kaçamağıdır.",
    bestFor: "Romantik gezi ve Avrupa şehir deneyimi",
    transportEase: "Kolay",
    safetyNote: "Gece ulaşımında resmî toplu taşıma veya lisanslı araç kullan.",
    dailyPlan: [
      "1. Gün: Parlamento ve Tuna kıyısı",
      "2. Gün: Buda Kalesi ve Balıkçı Tabyası",
      "3. Gün: Termal hamam ve dönüş",
    ],
  },
  tiran: {
    name: "Tiran",
    country: "Arnavutluk",
    why: "Sahil bağlantıları sayesinde yaz veya şehir tatili için esnek bir başlangıç noktasıdır.",
    bestFor: "Yaz tatili ve Balkan keşfi",
    transportEase: "Orta",
    safetyNote: "Sahil transferlerinde lisanslı işletme ve doğrulanmış rezervasyon kullan.",
    dailyPlan: [
      "1. Gün: Skanderbeg Meydanı ve Blloku",
      "2. Gün: Dajti veya Berat günü",
      "3. Gün: Merkez turu ve dönüş",
    ],
  },
};

function normalizeInput(body: unknown) {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const requested = record.destination && typeof record.destination === "object" ? record.destination as Record<string, unknown> : {};
  const airport = record.mode === "fixed" && typeof requested.code === "string" ? findAirportByIata(requested.code.trim().toUpperCase()) : null;
  const locale: PlanLocale = record.locale === 'ro' ? 'ro' : record.locale === "en" ? "en" : record.locale === "sq" ? "sq" : "tr";
  const destination: PlanDestination | undefined = airport ? { code: airport.iata, name: airport.city || airport.name, country: new Intl.DisplayNames([locale], { type: "region" }).of(airport.countryCode) || airport.country, countryCode: airport.countryCode } : undefined;
  return {
    mode: record.mode === "fixed" ? "fixed" as const : "discover" as const,
    destination,
    dayCount: validPlanDays(record.dayCount),
    origin: String(record.origin || "Belirtilmedi").slice(0, 80),
    days: String(record.days || "Belirtilmedi").slice(0, 40),
    month: String(record.month || "Belirtilmedi").slice(0, 40),
    accommodation: String(record.accommodation || "Belirtilmedi").slice(0, 60),
    who: String(record.who || "Belirtilmedi").slice(0, 60),
    tempo: String(record.tempo || "Belirtilmedi").slice(0, 60),
    vibe: Array.isArray(record.vibe)
      ? record.vibe.map((value) => String(value).slice(0, 40)).slice(0, 8)
      : [],
    visa: String(record.visa || "Belirtilmedi").slice(0, 60),
    locale,
    ...normalizePlannerPreferences(record),
    ...normalizePlannerPassport(record),
  };
}

function requestHash(input: Record<string, unknown>) {
  return crypto
    .createHash("sha256")
    .update(`${PLAN_CACHE_VERSION}:${JSON.stringify(input)}`)
    .digest("hex");
}

async function getCachedPlan(hash: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("ai_plan_cache")
      .select("output_json")
      .eq("request_hash", hash)
      .maybeSingle();

    if (error || !data?.output_json) return null;
    return data.output_json;
  } catch {
    return null;
  }
}

async function saveCachedPlan(hash: string, input: Record<string, unknown>, output: unknown) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    await supabase.from("ai_plan_cache").upsert({
      request_hash: hash,
      input_json: input,
      output_json: output,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Önbellek hatası kullanıcı cevabını engellemesin.
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, fallback: string, maxLength = 600) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, maxLength);
}

function cleanStringArray(value: unknown, fallback: string[], limit: number) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => cleanText(item, "", 500))
    .filter(Boolean)
    .slice(0, limit);
  return items.length > 0 ? items : fallback;
}

function score(value: unknown, fallback: number, max = 10) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(max, Math.round(numeric)));
}

function normalizeRoute(value: unknown, input: PlannerInput): AiRouteData | null {
  const { locale } = input;
  const copy = (tr: string, en: string, sq: string) => translateAppCopy(locale, tr, en, sq);
  const route = asRecord(value);
  const name = cleanText(route.name, "", 80);
  const airport = typeof route.destinationCode === "string" ? findAirportByIata(route.destinationCode) : null;
  const country = airport ? new Intl.DisplayNames([locale], { type: "region" }).of(airport.countryCode) || airport.country : cleanText(route.country, "", 80);
  if (!name || !country) return null;

  const entry = plannerEntry(input, airport?.countryCode || country, locale);
  const scores = asRecord(route.scores);
  const cta = asRecord(route.cta);
  const warnings = cleanStringArray(route.warnings, [], 5);
  if (!warnings.some((warning) => /giriş|entry|visa/i.test(warning))) {
    warnings.push(copy("Seçili pasaportun için giriş kuralını bilet almadan önce resmî kaynaktan yeniden doğrula.", "Reconfirm the entry rule for your selected passport with an official source before booking.", "Verifiko kushtet e hyrjes për pasaportën e zgjedhur me burimin zyrtar përpara rezervimit."));
  }

  return {
    name,
    country,
    cityOrRegion: cleanText(route.cityOrRegion, name, 100),
    destinationCode: typeof route.destinationCode === "string" && /^[A-Z]{3}$/.test(route.destinationCode) ? route.destinationCode : undefined,
    why: cleanText(route.why, copy("Seçimlerinle uyumlu bir rota seçeneği.", "A route that matches your choices.", "Një rrugë që përputhet me zgjedhjet e tua."), 600),
    ...entry,
    estimatedBudget: cleanText(route.estimatedBudget, copy("Seçilen tarihler için ayrıca hesaplanmalı", "Estimate separately for your dates", "Llogarite veçmas për datat e tua"), 120),
    idealDuration: cleanText(route.idealDuration, copy("3 gün", "3 days", "3 ditë"), 80),
    bestFor: cleanText(route.bestFor, copy("Şehir keşfi", "City discovery", "Eksplorim urban"), 180),
    difficulty: cleanText(route.difficulty, copy("Kolay", "Easy", "I lehtë"), 40),
    firstTimeFriendly: route.firstTimeFriendly !== false,
    transportEase: cleanText(route.transportEase, copy("Orta", "Moderate", "Mesatar"), 80),
    safetyNote: cleanText(route.safetyNote, copy("Güncel resmî seyahat uyarılarını kontrol et.", "Check current official travel advice.", "Kontrollo këshillat zyrtare aktuale të udhëtimit."), 500),
    scores: {
      budget: score(scores.budget, 8),
      visaEase: entry.verifiedEntryStatus === "unknown" ? 0 : entry.verifiedEntryStatus === "visa_required" ? 4 : 9,
      firstTime: score(scores.firstTime, 8),
      transport: score(scores.transport, 8),
      overall: score(scores.overall, 85, 100),
    },
    dailyPlan: cleanStringArray(route.dailyPlan, [copy("Şehir merkezini ve ana ulaşım noktalarını keşfet.", "Explore the city centre and main transport points.", "Eksploro qendrën e qytetit dhe pikat kryesore të transportit.")], 30),
    warnings,
    cta: {
      guideText: cleanText(cta.guideText, copy("Rehberi gör", "View guide", "Shih udhëzuesin"), 100),
      forumText: cleanText(cta.forumText, copy("Forumda sor", "Ask the community", "Pyet komunitetin"), 100),
    },
  };
}

function fallbackRoute(profile: FallbackProfile, input: PlannerInput): AiRouteData {
  return normalizeRoute({
    ...profile,
    dailyPlan: Array.from({ length: input.dayCount || profile.dailyPlan.length }, (_, index) => `${profile.dailyPlan[index] || (translateAppCopy(input.locale, `${index + 1}. Gün: ${profile.name} çevresinde yakın duraklar ve serbest zaman.`, `Day ${index + 1}: A relaxed nearby walk in ${profile.name}.`, `Dita ${index + 1}: Një shëtitje e qetë pranë në ${profile.name}.`))} ${starterPreferenceNote(input, input.locale)}`),
    cityOrRegion: profile.name,
    estimatedBudget: translateAppCopy(input.locale, `Planlama seviyesi: ${input.budget}`, `Planning level: ${input.budget}`, `Niveli: ${input.budget}`),
    idealDuration: input.days !== "Belirtilmedi" ? input.days : "3 gün",
    difficulty: "Kolay",
    firstTimeFriendly: true,
    scores: { budget: 8, visaEase: 9, firstTime: 9, transport: 8, overall: 88 },
    warnings: [
      "Uçak bileti ücreti bu tahmine dahil değildir; konaklama tutarlarını tarihler için yeniden kontrol et.",
    ],
  }, input)!;
}

function fallbackKeys(input: PlannerInput) {
  const visa = input.visa.toLocaleLowerCase("tr-TR");
  const vibe = input.vibe.join(" ").toLocaleLowerCase("tr-TR");
  if (visa.includes("kimlikle")) return ["baku", "tiflis", "kisinev"];
  if (visa.includes("sadece vizesiz")) {
    if (vibe.includes("deniz") || vibe.includes("yaz")) return ["tiran", "saraybosna", "uskup"];
    return ["saraybosna", "uskup", "belgrad"];
  }
  if (vibe.includes("romantik")) return ["roma", "budapeste", "saraybosna"];
  if (vibe.includes("deniz") || vibe.includes("yaz")) return ["tiran", "saraybosna", "tiflis"];
  return ["saraybosna", "tiflis", "roma"];
}

function buildUnfilteredFallbackPlan(input: PlannerInput): AiPlanData {
  if (input.mode === "fixed" && input.destination) {
    const starter = fixedDestinationStarter({ ...input, dayCount: input.dayCount || 3 }, input.locale);
    return { summary: starter.summary, routes: starter.routes.map(route => normalizeRoute(route, input)!) };
  }
  if (input.locale === "ro" || input.locale === "sq" || input.dayCount || input.party.children > 0) {
    const codes: Record<string, string> = { baku: "GYD", tiflis: "TBS", kisinev: "RMO", tiran: "TIA", saraybosna: "SJJ", uskup: "SKP", belgrad: "BEG", roma: "FCO", budapeste: "BUD" };
    return { summary: translateAppCopy(input.locale, "Seyahat seviyene ve grubuna göre düzenlenebilir başlangıç taslağı. Seyahatten önce güncel giriş koşullarını doğrula.", "Editable starter outlines for your travel level and group. Check current entry conditions before travelling.", "Plane fillestare të redaktueshme. Nuk janë krijuar rishtazi nga AI; kontrollo kushtet aktuale të hyrjes para udhëtimit."), routes: fallbackKeys(input).map(key => {
      const airport = findAirportByIata(codes[key]);
      const profile = fallbackProfiles[key];
      const destination = { code: codes[key], name: airport?.city || profile.name, country: airport ? new Intl.DisplayNames([input.locale], { type: "region" }).of(airport.countryCode) || profile.country : profile.country, countryCode: airport?.countryCode || "" };
      const starter = fixedDestinationStarter({ ...input, destination, dayCount: input.dayCount || Math.min(14, Math.max(1, parseInt(input.days, 10) || 3)) }, input.locale);
      return normalizeRoute(starter.routes[0], input)!;
    }) };
  }
  return {
    summary: translateAppCopy(input.locale, "Seçimlerine göre başlangıç rotaları hazırladık. Pasaportuna göre gösterilen giriş koşullarını kontrol et.", "We prepared starter routes for your choices. Review the entry conditions shown for your passport."),
    routes: fallbackKeys(input).map((key) => fallbackRoute(fallbackProfiles[key], input)),
  };
}

function buildFallbackPlan(input: PlannerInput): AiPlanData {
  const plan = buildUnfilteredFallbackPlan(input);
  if (input.mode === "fixed") return plan;
  return { ...plan, routes: plan.routes.filter(route => visaRuleMatchesPreference(route.verifiedEntryStatus, input.visa)) };
}

function finalizePlan(value: unknown, input: PlannerInput): AiPlanData {
  const plan = asRecord(value);
  const rawRoutes = Array.isArray(plan.routes) ? plan.routes : [];
  if (input.mode === "fixed" && input.destination) {
    // Reject unrelated model output; never rename an unrelated itinerary to the user's city.
    const raw = rawRoutes.find(route => routeMatchesDestination(asRecord(route), input.destination!));
    const normalized = raw ? normalizeRoute({ ...asRecord(raw), name: input.destination.name, country: input.destination.country, cityOrRegion: input.destination.name, destinationCode: input.destination.code }, input) : null;
    if (!normalized || !Array.isArray(asRecord(raw).dailyPlan) || normalized.dailyPlan.length !== input.dayCount) return buildFallbackPlan(input);
    normalized.idealDuration = translateAppCopy(input.locale, `${input.dayCount} gün`, `${input.dayCount} days`, `${input.dayCount} ditë`);
    return { summary: cleanText(plan.summary, `${input.origin} → ${input.destination.name}`, 500), routes: [normalized] };
  }
  const normalizedRoutes = rawRoutes
    .map((route) => normalizeRoute(route, input))
    .filter((route): route is AiRouteData => Boolean(route))
    .map(route => input.dayCount ? { ...route, idealDuration: translateAppCopy(input.locale, `${input.dayCount} gün`, `${input.dayCount} days`, `${input.dayCount} ditë`) } : route);
  const preferenceIsRestricted = input.visa.toLocaleLowerCase("tr-TR").includes("kimlikle")
    || input.visa.toLocaleLowerCase("tr-TR").includes("sadece vizesiz");
  const acceptedRoutes = preferenceIsRestricted
    ? normalizedRoutes.filter((route) => visaRuleMatchesPreference(route.verifiedEntryStatus, input.visa))
    : normalizedRoutes;

  const routes: AiRouteData[] = [];
  // An AI result must stand on its own. Filling missing suggestions with local
  // starters would falsely label those as generated and spend a daily allowance.
  for (const route of acceptedRoutes) {
    const key = `${route.country}:${route.name}`.toLocaleLowerCase("tr-TR");
    if (routes.some((existing) => `${existing.country}:${existing.name}`.toLocaleLowerCase("tr-TR") === key)) continue;
    routes.push(route);
    if (routes.length === 3) break;
  }

  return {
    summary: cleanText(
      plan.summary,
      translateAppCopy(input.locale, "Seçimlerine göre rota seçenekleri hazırladık. Pasaportuna göre gösterilen giriş koşullarını kontrol et.", "We prepared route options for your choices. Review the entry conditions shown for your passport.", "Përgatitëm itinerare sipas zgjedhjeve të tua. Kontrollo kushtet e hyrjes për pasaportën tënde."),
      500,
    ),
    routes,
  };
}

function fallbackResponse(input: PlannerInput) {
  return NextResponse.json(
    {
      success: true,
      data: buildFallbackPlan(input),
      isFallback: true,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

function expectedDailyPlans(value: unknown, input: PlannerInput) {
  if (!input.dayCount) return true;
  const routes = asRecord(value).routes;
  return Array.isArray(routes) && routes.length === (input.mode === "fixed" ? 1 : 3)
    && routes.every(route => {
      const days = asRecord(route).dailyPlan;
      return Array.isArray(days) && days.length === input.dayCount && days.every(day => typeof day === "string" && day.trim().length > 0);
    });
}

export async function POST(req: Request) {
  let input: PlannerInput | null = null;
  let operation: ReturnType<typeof aiRouteOperation> | undefined;
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(40_000)]);
  try {
    let rawInput: Record<string, unknown>;
    try { rawInput = asRecord(await journeyPlanWait(boundedJson(req, 16_000), AbortSignal.any([signal, AbortSignal.timeout(3000)]))); }
    catch (error) { return aiRouteReply({ code: 'plan_invalid' }, error instanceof Error && error.message === 'too-large' ? 413 : 400); }
    input = normalizeInput(rawInput);
    if ((rawInput.party !== undefined && !validTravelParty(rawInput.party)) || (rawInput.dayCount !== undefined && !validPlanDays(rawInput.dayCount))) {
      return NextResponse.json({ error: translateAppCopy(input.locale, "Gün, yetişkin, çocuk sayısı ve çocuk yaşlarını kontrol et.", "Check duration, adult and child counts, and child ages.", "Kontrollo ditët, numrin e të rriturve e fëmijëve dhe moshat.") }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
    if (input.mode === "fixed" && (!input.destination || !input.dayCount || input.origin === "Belirtilmedi")) {
      return NextResponse.json({ error: translateAppCopy(input.locale, "Çıkış şehri, geçerli bir hedef ve 1–14 gün seç.", "Choose a departure city, a valid destination and 1–14 days.", "Zgjidh qytetin e nisjes, një destinacion të vlefshëm dhe 1–14 ditë.") }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
    const passportOmitted = (rawInput.passportCountry === undefined || rawInput.passportCountry === '') && (rawInput.passportType === undefined || rawInput.passportType === '');
    if (!passportOmitted && !validPlannerPassport(input)) return NextResponse.json({ error: translateAppCopy(input.locale, "Geçerli bir pasaport ülkesi ve türü seç.", "Choose a valid passport country and type.", "Zgjidh shtetin dhe llojin e vlefshëm të pasaportës.") }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    const aiEnabled = process.env.AI_PLAN_ENABLED === "true";
    const hash = requestHash(input);
    const cached = await journeyPlanWait(getCachedPlan(hash), AbortSignal.any([signal, AbortSignal.timeout(3000)]));
    // Local starter outlines remain free and are always explicitly labelled.
    if (!aiEnabled && !cached) return fallbackResponse(input);
    const account = await requireAiRouteAccount(req, signal);
    operation = aiRouteOperation(account, req, input, 'suggestions');
    const admitted = await operation.begin(signal);
    if (admitted.state === 'succeeded') return aiRouteReply({ ...admitted.result, quota: admitted.quota }, 200, {}, req);
    if (cached) {
      if (!expectedDailyPlans(cached, input)) return fallbackResponse(input);
      const finalizedCache = finalizePlan(cached, input);
      if (finalizedCache.routes.length !== (input.mode === 'fixed' ? 1 : 3)) return fallbackResponse(input);
      if (input.mode === "fixed" && finalizedCache.routes[0]?.scores.overall === 0) return fallbackResponse(input);
      const result = { success: true, data: finalizedCache, isFallback: false, cached: true };
      signal.throwIfAborted();
      return aiRouteReply({ ...result, quota: await operation.complete(result) }, 200, {}, req);
    }

    const provider = process.env.JOURNEY_AI_PROVIDER?.trim();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const groq = provider === 'groq';
    if (groq ? !groqJourneyModel() : (!apiKey || !!provider && provider !== 'gemini')) return fallbackResponse(input);

    const configuredModel = process.env.GEMINI_MODEL?.trim();
    const modelName = !configuredModel || configuredModel === "gemini-3.5-flash"
      ? "gemini-3.6-flash"
      : configuredModel;
    const destinationCatalog = Object.values(fallbackProfiles).map(profile => ({ name: profile.name, country: profile.country, entry: plannerEntry(input!, profile.country, input!.locale).visaStatus }));

    const prompt = `
      Sen profesyonel bir seyahat rota danışmanısın. ${input.mode === "fixed" ? `Kullanıcının seçtiği tek hedef için tam 1 rota hazırla: ${JSON.stringify(input.destination)}. name ve cityOrRegion değerlerini aynen ${JSON.stringify(input.destination?.name)} yaz. Alternatif destinasyon önermek veya başka bir şehre geçmek yasak. Bu hedef için tam ${input.dayCount} günlük plan hazırla, dailyPlan dizisinde her gün için tek öğe olsun. Gidiş/dönüş günlerini de bu süreye dahil et.` : `Kullanıcının seçimlerine göre tam 3 farklı rota oluştur. Yalnızca şu doğrulanabilir rota havuzundan seçim yap: ${JSON.stringify(destinationCatalog)}.`}
      ${input.locale === 'ro' ? 'All descriptions, itineraries, warnings and user-visible text must be natural Romanian (România), using informal second-person singular. Preserve place names, source quotations and user-provided names.' : input.locale === 'en' ? 'Açıklamalar, plan, uyarılar ve tüm kullanıcıya gösterilen metinler tamamen İngilizce olmalı.' : input.locale === 'sq' ? 'Tüm açıklamalar, planlar, uyarılar ve kullanıcıya görünen metinler doğal Arnavutça (Shqip) olmalı.' : 'Tüm kullanıcıya gösterilen metinleri Türkçe yaz.'}
      Vize veya kimlikle giriş bilgisini tahmin etme. visaStatus alanına yalnızca "Sistem doğrulayacak" yaz;
      sunucu bu alanı seçili pasaport ve hedef ülke için ortak resmî giriş kurallarıyla değiştirecek. Diğer alanlarda da giriş hakkı tahmin etme veya vizesiz iddiası yazma.
      Canlı fiyat, garanti giriş, kesin güvenlik veya kesin uygunluk iddiasında bulunma.

      Kullanıcı seçimleri:
      - Çıkış noktası: ${input.origin}
      - Süre: ${input.mode === "fixed" ? `${input.dayCount} gün` : input.days}
      - Dönem: ${input.month}
      - Bütçe: ${input.budget}
      - Konaklama: ${input.accommodation}
      - Kiminle: ${input.who}
      - Tempo: ${input.tempo}
      - Seyahat tipi: ${input.vibe.length > 0 ? input.vibe.join(", ") : "Belirtilmedi"}
      - Pasaport: ${plannerPassportLabel(input, input.locale)} (${input.passportCountry}/${input.passportType})
      - Giriş tercihi: ${input.visa}
      - Tercihlere uyarlama: ${plannerPreferenceInstructions(input)}
      ${input.dayCount ? `Her rota için tam ${input.dayCount} günlük plan oluştur; dailyPlan dizisinde her gün için bir öğe olmalı.` : ""}
      - Maliyet gösterim para birimi: ${input.currency}. Fiyat uydurma; estimatedBudget alanında yalnızca bütçe seviyesini ve tahmin olduğunu belirt.

      JSON formatı:
      {
        "summary": "En fazla 2 cümlelik genel değerlendirme",
        "routes": [
          {
            "name": "Şehir",
            "country": "Ülke",
            "cityOrRegion": "Şehir veya bölge",
            "why": "Bu rota neden uygun?",
            "visaStatus": "Sistem doğrulayacak",
            "estimatedBudget": "Tahmini bütçe; canlı fiyat olmadığını belirt",
            "idealDuration": "İdeal süre",
            "bestFor": "Kimin için uygun",
            "difficulty": "Kolay / Orta / Zor",
            "firstTimeFriendly": true,
            "transportEase": "Kolay / Orta / Zor",
            "safetyNote": "Kısa ve temkinli güvenlik notu",
            "scores": { "budget": 8, "visaEase": 8, "firstTime": 8, "transport": 8, "overall": 85 },
            "dailyPlan": ["1. Gün: ...", "2. Gün: ...", "3. Gün: ..."],
            "warnings": ["Tahmini fiyat uyarısı"],
            "cta": { "guideText": "Rehberi gör", "forumText": "Forumda sor" }
          }
        ]
      }
    `;

    const providerSignal = AbortSignal.any([signal, AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)]);
    let textResult = "";
    try {
      if (groq) {
        textResult = await generateBoundedGroqJourneyJson({ prompt, signal: providerSignal, maxOutputTokens: 4000, reserveProviderAttempt: operation.reserveProviderAttempt });
      } else {
      await operation.reserveProviderAttempt(7500, providerSignal);
      const response = await new GoogleGenAI({ apiKey: apiKey! }).models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          abortSignal: providerSignal,
          httpOptions: { timeout: AI_REQUEST_TIMEOUT_MS },
          responseMimeType: "application/json",
          temperature: 0.45,
          maxOutputTokens: 4_000,
        },
      });
      textResult = (response.text || "").trim();
      }
    } catch (error) {
      const mapped = journeyPlanProviderError(error, providerSignal.aborted);
      if (mapped.code === 'plan_busy' || mapped.code === 'plan_daily_capacity' || mapped.code === 'plan_request_too_large') throw mapped;
      console.warn("ai_suggestions_generation_failed", { code: mapped.code });
      return fallbackResponse(input);
    }

    if (!textResult) return fallbackResponse(input);

    let parsed: unknown;
    try {
      parsed = JSON.parse(textResult);
    } catch (error) {
      console.error("AI plan JSON parse failed:", error instanceof Error ? error.message : "unknown error");
      return fallbackResponse(input);
    }

    if (!expectedDailyPlans(parsed, input)) return fallbackResponse(input);
    const finalizedPlan = finalizePlan(parsed, input);
    if (finalizedPlan.routes.length !== (input.mode === "fixed" ? 1 : 3)) return fallbackResponse(input);
    if (input.mode === "fixed" && finalizedPlan.routes[0]?.scores.overall === 0) return fallbackResponse(input);

    const result = { success: true, data: finalizedPlan, isFallback: false, cached: false };
    const quota = await operation.complete(result);
    try { await journeyPlanWait(saveCachedPlan(hash, input, finalizedPlan), AbortSignal.timeout(1500)); }
    catch { /* Successful private receipt already persists; shared cache is optional. */ }
    return aiRouteReply({ ...result, quota }, 200, {}, req);
  } catch (error: unknown) {
    console.warn("ai_suggestions_request_failed");
    if (input?.mode === "fixed" && !input.destination) return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
    return aiRouteErrorReply(error, req);
  } finally { await operation?.release(); }
}
