export interface TravelpayoutsPriceInfo {
  price: number;
  currency: string;
  airline?: string;
  flight_number?: string;
  departure_at?: string;
  return_at?: string;
}

/**
 * Gets the cheapest flight price using Travelpayouts Data API v2 (or v3).
 * Falls back to mock prices in development if MOCK_PRICE_ALERTS is true.
 */
export async function fetchCheapestPrice(params: {
  origin: string;
  destination: string;
  departDate: string; // YYYY-MM-DD
  returnDate?: string | null;
  currency?: string;
}): Promise<TravelpayoutsPriceInfo | null> {
  const isMock = process.env.MOCK_PRICE_ALERTS === "true";
  
  if (isMock) {
    // Generate a pseudo-random realistic mock price for development testing
    const baseMockPrice = Math.floor(Math.random() * 5000) + 1500;
    console.log(`[MOCK] Fetched mock price for ${params.origin}-${params.destination}: ${baseMockPrice} TRY`);
    return {
      price: baseMockPrice,
      currency: "TRY",
      airline: "TK",
      departure_at: params.departDate,
    };
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) {
    console.warn("TRAVELPAYOUTS_TOKEN is missing. Returning null for flight price.");
    return null;
  }

  try {
    // Travelpayouts Prices API v2 - Latest prices
    // Docs: https://travelpayouts.github.io/slate/
    const url = new URL("https://api.travelpayouts.com/v2/prices/latest");
    url.searchParams.set("currency", params.currency || "TRY");
    url.searchParams.set("origin", params.origin);
    url.searchParams.set("destination", params.destination);
    url.searchParams.set("depart_date", params.departDate);
    if (params.returnDate) {
      url.searchParams.set("return_date", params.returnDate);
    }
    url.searchParams.set("limit", "1");
    url.searchParams.set("show_to_affiliates", "false"); // We want raw latest
    url.searchParams.set("token", token);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      next: { revalidate: 3600 }, // Avoid hammering API
    });

    if (!res.ok) {
      console.error(`Travelpayouts API error: ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    
    // API returns { success: true, data: [ { value: 2500, trip_class: 0, ... } ] }
    if (data.success && data.data && data.data.length > 0) {
      const bestTicket = data.data[0];
      return {
        price: bestTicket.value,
        currency: params.currency || "TRY",
        airline: bestTicket.gate,
        departure_at: bestTicket.depart_date,
        return_at: bestTicket.return_date,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Failed to fetch price from Travelpayouts:", error);
    return null;
  }
}
