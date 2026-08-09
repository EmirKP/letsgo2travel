import { NextResponse } from "next/server";
import { internalFlightSearchUrl } from "@/lib/affiliate";

function date(value: string | null) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin") || undefined;
  const destination = searchParams.get("destination") || undefined;
  const departDate = date(searchParams.get("departureDate") || searchParams.get("departDate"));
  const returnDate = date(searchParams.get("returnDate"));
  const target = new URL(internalFlightSearchUrl({ origin, destination, departDate, returnDate }));

  return NextResponse.json({
    mode: "letsgo2travel-meta-search",
    deprecated: true,
    url: `${target.pathname}${target.search}`,
    createSearchEndpoint: "/api/flights/searches",
    message: "Bu uyumluluk ucu artık harici bir meta-arama sitesine yönlendirmez. Uçuş araması LetsGo2Travel backend'i üzerinden oluşturulmalıdır.",
  }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}
