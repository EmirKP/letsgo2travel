import { googleFlightsUrl } from "@/lib/affiliate";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

function iata(value: string | null, fallback: string) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{3}$/.test(normalized) ? normalized : fallback;
}

function date(value: string | null) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = iata(searchParams.get("origin"), "IST");
  const destination = iata(searchParams.get("destination"), "DXB");
  const departDate = date(searchParams.get("departureDate") || searchParams.get("departDate"));
  const returnDate = date(searchParams.get("returnDate"));

  return cachedJson({
    mode: "google-flights",
    url: googleFlightsUrl({ origin, destination, departDate, returnDate }),
    message: "Google Flights araması seçilen rota ve tarihlerle hazırlandı.",
  }, CACHE_TIMES.AFFILIATE_SHORT);
}
