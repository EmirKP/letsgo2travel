import crypto from "crypto";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveVerifiedVisaRule,
  verifiedDestinationCatalog,
  visaRuleMatchesPreference,
} from "@/lib/visa-entry-rules";

export const maxDuration = 45;

const AI_REQUEST_TIMEOUT_MS = 18_000;
const PLAN_CACHE_VERSION = "verified-visa-v2-2026-08-05";
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

type PlannerInput = ReturnType<typeof normalizeInput>;

type AiRouteData = {
  name: string;
  country: string;
  cityOrRegion: string;
  why: string;
  visaStatus: string;
  visaNote: string;
  visaSourceUrl: string;
  visaVerifiedAt: string | null;
  verifiedEntryStatus: ReturnType<typeof resolveVerifiedVisaRule>["status"];
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
    flightSearchText: string;
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
    why: "Vizesiz giriş, yürüyerek keşfedilebilen merkez ve bütçe dostu seçenekleriyle güçlü bir kısa rota.",
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
    why: "Vizesiz giriş, kısa uçuş ve merkezde kolay ulaşım sayesinde hafta sonu için uygulanabilir bir Balkan rotası.",
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
    why: "Vizesiz giriş, canlı şehir hayatı ve güçlü toplu taşıma ağıyla arkadaş grupları için dengeli bir seçenek.",
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
    why: "Türkiye'den doğrudan seyahatte kimlik kartı kolaylığı ve kısa uçuş süresiyle pratik bir ilk yurt dışı rotası.",
    bestFor: "Kimlikle seyahat ve şehir gezisi",
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
    why: "Kimlik kartıyla giriş, uygun şehir içi seçenekleri ve güçlü gastronomi rotasıyla kolay planlanabilir.",
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
    why: "Kimlik kartıyla seyahat seçeneği ve sakin şehir temposuyla kısa, düşük yoğunluklu bir rota sunar.",
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
    why: "Vizesiz giriş ve sahil bağlantıları sayesinde yaz veya şehir tatili için esnek bir başlangıç noktasıdır.",
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
  return {
    origin: String(record.origin || "Belirtilmedi").slice(0, 80),
    days: String(record.days || "Belirtilmedi").slice(0, 40),
    month: String(record.month || "Belirtilmedi").slice(0, 40),
    budget: String(record.budget || "Belirtilmedi").slice(0, 60),
    accommodation: String(record.accommodation || "Belirtilmedi").slice(0, 60),
    who: String(record.who || "Belirtilmedi").slice(0, 60),
    tempo: String(record.tempo || "Belirtilmedi").slice(0, 60),
    vibe: Array.isArray(record.vibe)
      ? record.vibe.map((value) => String(value).slice(0, 40)).slice(0, 8)
      : [],
    visa: String(record.visa || "Belirtilmedi").slice(0, 60),
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

function normalizeRoute(value: unknown): AiRouteData | null {
  const route = asRecord(value);
  const name = cleanText(route.name, "", 80);
  const country = cleanText(route.country, "", 80);
  if (!name || !country) return null;

  const verifiedRule = resolveVerifiedVisaRule({
    name,
    country,
    cityOrRegion: route.cityOrRegion,
  });
  const scores = asRecord(route.scores);
  const cta = asRecord(route.cta);
  const warnings = cleanStringArray(route.warnings, [], 5);
  if (!warnings.some((warning) => warning.toLocaleLowerCase("tr-TR").includes("giriş"))) {
    warnings.push("Giriş kuralını bilet almadan önce T.C. Dışişleri Bakanlığı kaynağından yeniden doğrula.");
  }

  return {
    name,
    country: verifiedRule.status === "unknown" ? country : verifiedRule.country,
    cityOrRegion: cleanText(route.cityOrRegion, name, 100),
    why: cleanText(route.why, "Seçimlerinle uyumlu bir rota seçeneği.", 600),
    visaStatus: verifiedRule.label,
    visaNote: verifiedRule.note,
    visaSourceUrl: verifiedRule.sourceUrl,
    visaVerifiedAt: verifiedRule.verifiedAt,
    verifiedEntryStatus: verifiedRule.status,
    estimatedBudget: cleanText(route.estimatedBudget, "Seçilen tarihler için ayrıca hesaplanmalı", 120),
    idealDuration: cleanText(route.idealDuration, "3 gün", 80),
    bestFor: cleanText(route.bestFor, "Şehir keşfi", 180),
    difficulty: cleanText(route.difficulty, "Kolay", 40),
    firstTimeFriendly: route.firstTimeFriendly !== false,
    transportEase: cleanText(route.transportEase, "Orta", 80),
    safetyNote: cleanText(route.safetyNote, "Güncel resmî seyahat uyarılarını kontrol et.", 500),
    scores: {
      budget: score(scores.budget, 8),
      visaEase: score(scores.visaEase, verifiedRule.status === "visa_required" ? 4 : 9),
      firstTime: score(scores.firstTime, 8),
      transport: score(scores.transport, 8),
      overall: score(scores.overall, 85, 100),
    },
    dailyPlan: cleanStringArray(route.dailyPlan, ["Şehir merkezini ve ana ulaşım noktalarını keşfet."], 10),
    warnings,
    cta: {
      flightSearchText: cleanText(cta.flightSearchText, "Bu rota için bilet ara", 100),
      guideText: cleanText(cta.guideText, "Rehberi gör", 100),
      forumText: cleanText(cta.forumText, "Forumda sor", 100),
    },
  };
}

function fallbackRoute(profile: FallbackProfile, input: PlannerInput): AiRouteData {
  return normalizeRoute({
    ...profile,
    cityOrRegion: profile.name,
    estimatedBudget: input.budget !== "Belirtilmedi"
      ? `Hedef bütçe: ${input.budget}`
      : "Seçilen tarihler için ayrıca hesaplanmalı",
    idealDuration: input.days !== "Belirtilmedi" ? input.days : "3 gün",
    difficulty: "Kolay",
    firstTimeFriendly: true,
    scores: { budget: 8, visaEase: 9, firstTime: 9, transport: 8, overall: 88 },
    warnings: [
      "Uçuş ve konaklama tutarları canlı fiyat değildir; tarihler için yeniden kontrol et.",
    ],
  })!;
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

function buildFallbackPlan(input: PlannerInput): AiPlanData {
  return {
    summary: "Seçimlerine göre doğrulanmış giriş kuralları kullanılan üç uygulanabilir başlangıç rotası hazırladık.",
    routes: fallbackKeys(input).map((key) => fallbackRoute(fallbackProfiles[key], input)),
  };
}

function finalizePlan(value: unknown, input: PlannerInput): AiPlanData {
  const plan = asRecord(value);
  const rawRoutes = Array.isArray(plan.routes) ? plan.routes : [];
  const normalizedRoutes = rawRoutes
    .map(normalizeRoute)
    .filter((route): route is AiRouteData => Boolean(route));
  const preferenceIsRestricted = input.visa.toLocaleLowerCase("tr-TR").includes("kimlikle")
    || input.visa.toLocaleLowerCase("tr-TR").includes("sadece vizesiz");
  const acceptedRoutes = preferenceIsRestricted
    ? normalizedRoutes.filter((route) => visaRuleMatchesPreference(route.verifiedEntryStatus, input.visa))
    : normalizedRoutes;

  const routes: AiRouteData[] = [];
  for (const route of [...acceptedRoutes, ...buildFallbackPlan(input).routes]) {
    const key = `${route.country}:${route.name}`.toLocaleLowerCase("tr-TR");
    if (routes.some((existing) => `${existing.country}:${existing.name}`.toLocaleLowerCase("tr-TR") === key)) continue;
    routes.push(route);
    if (routes.length === 3) break;
  }

  return {
    summary: cleanText(
      plan.summary,
      "Seçimlerine göre doğrulanmış giriş kuralları kullanılan rota seçenekleri hazırladık.",
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

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
    const now = Date.now();
    const rateLimitInfo = rateLimitMap.get(ip);

    if (rateLimitInfo && now < rateLimitInfo.resetTime) {
      if (rateLimitInfo.count >= 5) {
        return NextResponse.json(
          { error: "Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin." },
          { status: 429, headers: { "Cache-Control": "private, no-store, max-age=0" } },
        );
      }
      rateLimitInfo.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + 60_000 });
    }

    const input = normalizeInput(await req.json().catch(() => ({})));
    const hash = requestHash(input);
    const cached = await getCachedPlan(hash);
    if (cached) {
      const finalizedCache = finalizePlan(cached, input);
      return NextResponse.json(
        { success: true, data: finalizedCache, isFallback: false, cached: true },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }

    const aiEnabled = process.env.AI_PLAN_ENABLED === "true";
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!aiEnabled || !apiKey) return fallbackResponse(input);

    const genAI = new GoogleGenAI({ apiKey });
    const configuredModel = process.env.GEMINI_MODEL?.trim();
    const modelName = !configuredModel || configuredModel === "gemini-3.5-flash"
      ? "gemini-3.6-flash"
      : configuredModel;
    const destinationCatalog = verifiedDestinationCatalog(input.visa);

    const prompt = `
      Sen profesyonel bir seyahat rota danışmanısın. Kullanıcının seçimlerine göre tam 3 farklı rota oluştur.
      Yalnızca şu doğrulanabilir rota havuzundan seçim yap: ${destinationCatalog}.
      Vize veya kimlikle giriş bilgisini tahmin etme. visaStatus alanına yalnızca "Sistem doğrulayacak" yaz;
      sunucu bu alanı T.C. Dışişleri Bakanlığı verisiyle değiştirecek.
      Canlı fiyat, garanti giriş, kesin güvenlik veya kesin uygunluk iddiasında bulunma.

      Kullanıcı seçimleri:
      - Çıkış noktası: ${input.origin}
      - Süre: ${input.days}
      - Dönem: ${input.month}
      - Bütçe: ${input.budget}
      - Konaklama: ${input.accommodation}
      - Kiminle: ${input.who}
      - Tempo: ${input.tempo}
      - Seyahat tipi: ${input.vibe.length > 0 ? input.vibe.join(", ") : "Belirtilmedi"}
      - Giriş tercihi: ${input.visa}

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
            "cta": { "flightSearchText": "Bu rota için bilet ara", "guideText": "Rehberi gör", "forumText": "Forumda sor" }
          }
        ]
      }
    `;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    let textResult = "";
    try {
      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          httpOptions: { timeout: AI_REQUEST_TIMEOUT_MS },
          responseMimeType: "application/json",
          temperature: 0.45,
          maxOutputTokens: 4_000,
        },
      });
      textResult = (response.text || "").trim();
    } catch (error) {
      console.error("AI plan request failed or timed out:", error instanceof Error ? error.message : "unknown error");
      return fallbackResponse(input);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!textResult) return fallbackResponse(input);

    let parsed: unknown;
    try {
      parsed = JSON.parse(textResult);
    } catch (error) {
      console.error("AI plan JSON parse failed:", error instanceof Error ? error.message : "unknown error");
      return fallbackResponse(input);
    }

    const finalizedPlan = finalizePlan(parsed, input);
    if (finalizedPlan.routes.length !== 3) return fallbackResponse(input);

    await saveCachedPlan(hash, input, finalizedPlan);
    return NextResponse.json(
      { success: true, data: finalizedPlan, isFallback: false, cached: false },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error: unknown) {
    console.error("AI Route Error:", error instanceof Error ? error.message : "unknown error");
    return fallbackResponse(normalizeInput({}));
  }
}
