import { NextResponse } from "next/server";
import { runPriceAlertCheck } from "@/lib/price-alert-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // GÜVENLİK: secret YALNIZ Authorization: Bearer başlığıyla kabul edilir.
  // Query parametresi (?secret=...) desteklenmez — URL'ler loglara/proxylere
  // sızabildiği için query ile gelen doğru secret bile yetki VERMEZ.
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7).trim();
  if (!provided || provided.length !== cronSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cronSecret.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (!isAuthorizedCron(request)) return unauthorized();

  try {
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(Number(limitParam) || 80, 200)) : 80;
    const result = await runPriceAlertCheck({ limit });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Price alert cron failed:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Fiyat alarmı cron çalıştırılamadı.",
    }, { status: 500 });
  }
}
