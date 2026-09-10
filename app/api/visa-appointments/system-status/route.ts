import { NextResponse } from "next/server";
import { getWorkerHealth } from "@/lib/visa-appointments/worker-health";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await getWorkerHealth(), { headers: { "Cache-Control": "no-store" } });
}
