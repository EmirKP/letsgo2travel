import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60; // Max execution time for Vercel Hobby

// Simple in-memory rate limit for AI route (Not fully persistent in serverless, but helps against basic spam)
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();

export async function POST(req: Request) {
  try {
    // 1. Rate Limiting Check
    const ip = req.headers.get("x-forwarded-for") || "unknown-ip";
    const now = Date.now();
    const rateLimitInfo = rateLimitMap.get(ip);
    
    if (rateLimitInfo && now < rateLimitInfo.resetTime) {
      if (rateLimitInfo.count >= 5) {
        // En fazla 5 istek / 1 dakika
        return NextResponse.json(
          { error: "Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin." }, 
          { status: 429 }
        );
      }
      rateLimitInfo.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 }); // 1 min window
    }

    // 2. Feature Flag & Key Check
    const aiEnabled = process.env.AI_PLAN_ENABLED === "true";
    const apiKey = process.env.GEMINI_API_KEY;

    const body = await req.json();
    
    // If feature flag is false or no API key, return a designated fallback signal so client uses fallback data safely
    if (!aiEnabled || !apiKey) {
      return NextResponse.json({ success: true, data: null, isFallback: true });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash"; // Varsayılan olarak çalışan modeli kullanıyoruz
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
      Sen profesyonel bir seyahat danışmanısın. Kullanıcının verdiği seçimlere göre, en iyi 3 farklı rota seçeneği oluştur.
      Yanıtını SADECE geçerli bir JSON olarak ver. Markdown (\`\`\`json ... \`\`\`) KULLANMA. Doğrudan JSON objesi döndür.
      KESİNLİKLE "canlı fiyat", "garanti giriş" veya "kesin vize bilgisi" gibi iddialarda bulunma. Fiyatların ve kuralların tahmini olduğunu belirtmeye gerek yok, biz arayüzde belirteceğiz. Sadece istenen yapıyı ver.
      
      Kullanıcı Seçimleri:
      - Çıkış Noktası: ${body.origin || "Belirtilmedi"}
      - Süre: ${body.days || "Belirtilmedi"}
      - Dönem: ${body.month || "Belirtilmedi"}
      - Bütçe: ${body.budget || "Belirtilmedi"}
      - Konaklama: ${body.accommodation || "Belirtilmedi"}
      - Kiminle: ${body.who || "Belirtilmedi"}
      - Tempo: ${body.tempo || "Belirtilmedi"}
      - Seyahat Tipi: ${body.vibe && body.vibe.length > 0 ? body.vibe.join(", ") : "Belirtilmedi"}
      - Vize Tercihi: ${body.visa || "Belirtilmedi"}

      Lütfen aşağıdaki JSON formatına birebir uy:
      {
        "summary": "Bu seçimlere göre kısa, samimi genel bir değerlendirme (max 2 cümle).",
        "routes": [
          {
            "name": "Şehir Adı (örn: Saraybosna)",
            "country": "Ülke (örn: Bosna Hersek)",
            "cityOrRegion": "Arama için şehir veya bölge adı (örn: Sarajevo)",
            "why": "Bu rota bu kullanıcı için neden uygun? (1 paragraf)",
            "visaStatus": "Vizesiz / Kimlikle / Schengen vb.",
            "estimatedBudget": "Tahmini bütçe (örn: 10.000 - 15.000 TL)",
            "idealDuration": "İdeal süre (örn: 3 gün)",
            "bestFor": "Kimin için uygun (örn: İlk kez yurt dışı, Kültür gezisi)",
            "difficulty": "Kolay / Orta / Zor",
            "firstTimeFriendly": true,
            "transportEase": "Kolay / Orta",
            "safetyNote": "Güvenlik veya dikkat edilmesi gerekenler (kısa).",
            "scores": {
              "budget": 9,
              "visaEase": 10,
              "firstTime": 9,
              "transport": 8,
              "overall": 90
            },
            "dailyPlan": [
              "1. Gün: ...",
              "2. Gün: ..."
            ],
            "warnings": [
              "Hava durumu ile ilgili not..."
            ],
            "cta": {
              "flightSearchText": "Bu rota için bilet ara",
              "guideText": "Rehberi gör",
              "forumText": "Forumda sor"
            }
          }
        ]
      }
    `;

    const result = await model.generateContent(prompt);
    let textResult = result.response.text().trim();
    
    // 3. Response Validation & Parsing
    if (textResult.startsWith("\`\`\`json")) {
      textResult = textResult.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
    }
    if (textResult.startsWith("\`\`\`")) {
      textResult = textResult.replace(/^\`\`\`\n/, "").replace(/\n\`\`\`$/, "");
    }

    let jsonData;
    try {
      jsonData = JSON.parse(textResult);
    } catch (parseError) {
      console.error("AI JSON Parse Error:", parseError);
      return NextResponse.json({ success: true, data: null, isFallback: true });
    }

    // 4. Data sanitization
    if (!jsonData.routes || !Array.isArray(jsonData.routes)) {
      return NextResponse.json({ success: true, data: null, isFallback: true });
    }

    // En fazla 3 rota sınırı
    jsonData.routes = jsonData.routes.slice(0, 3);

    return NextResponse.json({ success: true, data: jsonData, isFallback: false });
  } catch (error: any) {
    console.error("AI Route Error:", error);
    // Explicitly return fallback mode on error so client side triggers its own fallback safely
    return NextResponse.json({ success: true, data: null, isFallback: true });
  }
}
