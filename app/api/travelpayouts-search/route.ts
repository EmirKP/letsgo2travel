import { NextResponse } from "next/server";
import { aviasalesUrl } from "@/lib/affiliate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin") || "IST";
  const destination = searchParams.get("destination") || "DXB";
  return NextResponse.json({
    mode: process.env.TRAVELPAYOUTS_TOKEN ? "api-ready" : "affiliate-fallback",
    url: aviasalesUrl({ origin, destination }),
    message: "Travelpayouts token eklenirse burada gerçek fiyat API entegrasyonu yapılabilir.",
  });
}
