import crypto from "crypto";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const maxDuration = 60;

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function normalizeInput(body: any) {
  return {
    origin: String(body?.origin || "Belirtilmedi").slice(0, 80),
    days: String(body?.days || "Belirtilmedi").slice(0, 40),
    month: String(body?.month || "Belirtilmedi").slice(0, 40),
    budget: String(body?.budget || "Belirtilmedi").slice(0, 60),
    accommodation: String(body?.accommodation || "Belirtilmedi").slice(0, 60),
    who: String(body?.who || "Belirtilmedi").slice(0, 60),
    tempo: String(body?.tempo || "Belirtilmedi").slice(0, 60),
    vibe: Array.isArray(body?.vibe) ? body.vibe.map((v: any) => String(v).slice(0, 40)).slice(0, 8) : [],
    visa: String(body?.visa || "Belirtilmedi").slice(0, 60),
  };
}

function requestHash(input: Record<string, unknown>) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
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
    // Cache hatası kullanıcı cevabını engellemesin.
  }
}

function fallbackResponse() {
  return NextResponse.json(
    { success: true, data: null, isFallback: true },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
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
          { status: 429, headers: { "Cache-Control": "private, no-store, max-age=0" } }
        );
      }
      rateLimitInfo.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + 60_000 });
    }

    const body = await req.json().catch(() => ({}));
    const input = normalizeInput(body);
    const hash = requestHash(input);

    const cached = await getCachedPlan(hash);
    if (cached) {
      return NextResponse.json(
        { success: true, data: cached, isFallback: false, cached: true },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } }
      );
    }

    const aiEnabled = process.env.AI_PLAN_ENABLED === "true";
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!aiEnabled || !apiKey) {
      return fallbackResponse();
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
      Sen profesyonel bir seyahat danışmanısın. Kullanıcının verdiği seçimlere göre, en iyi 3 farklı rota seçeneği oluştur.
      Yanıtını SADECE geçerli bir JSON olarak ver. Markdown (\`\`\`json ... \`\`\`) KULLANMA. Doğrudan JSON objesi döndür.
      KESİNLİKLE "canlı fiyat", "garanti giriş" veya "kesin vize bilgisi" gibi iddialarda bulunma.

      Kullanıcı Seçimleri:
      - Çıkış Noktası: ${input.origin}
      - Süre: ${input.days}
      - Dönem: ${input.month}
      - Bütçe: ${input.budget}
      - Konaklama: ${input.accommodation}
      - Kiminle: ${input.who}
      - Tempo: ${input.tempo}
      - Seyahat Tipi: ${input.vibe.length > 0 ? input.vibe.join(", ") : "Belirtilmedi"}
      - Vize Tercihi: ${input.visa}

      JSON formatı:
      {
        "summary": "Bu seçimlere göre kısa, samimi genel bir değerlendirme (max 2 cümle).",
        "routes": [
          {
            "name": "Şehir Adı",
            "country": "Ülke",
            "cityOrRegion": "Arama için şehir veya bölge adı",
            "why": "Bu rota bu kullanıcı için neden uygun?",
            "visaStatus": "Vizesiz / Kimlikle / Schengen vb.",
            "estimatedBudget": "Tahmini bütçe",
            "idealDuration": "İdeal süre",
            "bestFor": "Kimin için uygun",
            "difficulty": "Kolay / Orta / Zor",
            "firstTimeFriendly": true,
            "transportEase": "Kolay / Orta",
            "safetyNote": "Kısa güvenlik notu.",
            "scores": { "budget": 9, "visaEase": 10, "firstTime": 9, "transport": 8, "overall": 90 },
            "dailyPlan": ["1. Gün: ...", "2. Gün: ..."],
            "warnings": ["Hava durumu ile ilgili not..."],
            "cta": { "flightSearchText": "Bu rota için bilet ara", "guideText": "Rehberi gör", "forumText": "Forumda sor" }
          }
        ]
      }
    `;

    const result = await model.generateContent(prompt);
    let textResult = result.response.text().trim();

    if (textResult.startsWith("```json")) {
      textResult = textResult.replace(/^```json\n/, "").replace(/\n```$/, "");
    }
    if (textResult.startsWith("```")) {
      textResult = textResult.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    let jsonData;
    try {
      jsonData = JSON.parse(textResult);
    } catch (parseError) {
      console.error("AI JSON Parse Error:", parseError);
      return fallbackResponse();
    }

    if (!jsonData.routes || !Array.isArray(jsonData.routes)) {
      return fallbackResponse();
    }

    jsonData.routes = jsonData.routes.slice(0, 3);
    await saveCachedPlan(hash, input, jsonData);

    return NextResponse.json(
      { success: true, data: jsonData, isFallback: false, cached: false },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("AI Route Error:", error);
    return fallbackResponse();
  }
}
