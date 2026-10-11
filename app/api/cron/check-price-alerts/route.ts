import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { priceAlertScan } from "@/workflows/price-alert-scan";
import { isAuthorizedPriceAlertCron } from "@/lib/price-alert-cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (!isAuthorizedPriceAlertCron(request)) return unauthorized();

  try {
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(Number(limitParam) || 80, 200)) : 80;
    // The workflow captures this snapshot, coordinates same-day duplicates and
    // excludes rows already checked today while including this morning's rows.
    const cutoff = new Date().toISOString();
    const run = await start(priceAlertScan, [cutoff,limit]);
    return NextResponse.json({success:true,status:"queued",runId:run.runId,cutoff}, { status:202, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Price alert cron failed:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Fiyat alarmı cron çalıştırılamadı.",
    }, { status: 500 });
  }
}
