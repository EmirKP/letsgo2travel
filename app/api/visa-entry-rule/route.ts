import { NextResponse } from "next/server";
import { resolveVerifiedVisaRule } from "@/lib/visa-entry-rules";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = String(searchParams.get("country") || "").trim().slice(0, 80);
  const destination = String(searchParams.get("destination") || "").trim().slice(0, 80);

  if (!country && !destination) {
    return NextResponse.json({ error: "Ülke veya destinasyon gerekli." }, { status: 400 });
  }

  return NextResponse.json({
    data: resolveVerifiedVisaRule({ country, name: destination, cityOrRegion: destination }),
  }, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
