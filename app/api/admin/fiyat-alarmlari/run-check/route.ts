import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { runPriceAlertCheck } from "@/lib/price-alert-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const limit = body?.limit ? Math.max(1, Math.min(Number(body.limit) || 80, 200)) : 80;
    const result = await runPriceAlertCheck({ limit });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Manual price alert check failed:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Manuel fiyat kontrolü çalıştırılamadı.",
    }, { status: 500 });
  }
}
