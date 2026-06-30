import { NextResponse } from "next/server";
import { affiliateRedirectUrl, aviasalesUrl } from "@/lib/affiliate";
import { createSearchAnswer, parseTravelSearch } from "@/lib/ai-search-parser";
import { createTripPlan } from "@/lib/ai-trip-planner";

async function askOpenAI(query: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Sen Letsgo2Travel için Türkçe premium rota asistanısın. Kısa, net, satışa yönlendiren, hedeflenen yer için 1-2 'Neden burası?' ve 'Mutlaka gidilmesi gereken 1 mekan/restoran' tavsiyesi içeren zengin bir yanıt üret. Okuması keyifli, emojilerle süslenmiş 3-4 cümlelik bir metin olsun.",
          },
          { role: "user", content: query },
        ],
        temperature: 0.4,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: string } | null;
  const query = body?.query?.trim() || "vizesiz uygun rota";
  const intent = parseTravelSearch(query);
  const aiAnswer = await askOpenAI(query);
  const rawUrl = aviasalesUrl({ origin: intent.originCode, destination: intent.destinationCode });
  const url = affiliateRedirectUrl({
    provider: "aviasales",
    url: rawUrl,
    destination: intent.destinationCode,
    sourcePage: "ai_search_box",
    campaign: "ai_search",
  });
  const plan = createTripPlan(query);

  return NextResponse.json({
    answer: aiAnswer || createSearchAnswer(intent),
    intent,
    url,
    planPreview: {
      destination: plan.destination,
      score: plan.score,
      budgetText: plan.budgetText,
      tags: plan.tags,
      tips: plan.smartTips.slice(0, 3),
    },
  });
}
