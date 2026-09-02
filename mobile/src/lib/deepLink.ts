// Derin bağlantı ayrıştırma (saf; birim testli).
// Desteklenen biçimler:
//   letsgo2travel://cockpit?tripId=<uuid>
//   https://www.letsgo2travel.com.tr/...?tripId=<uuid>
//   #cockpit?tripId=<uuid> (hash yönlendirmeleri)
const TRIP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** URL'den güvenli Kokpit kayıt kimliği çıkarır; yoksa/bozuksa null. */
export function tripIdFromUrl(value: string): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value, "https://app.local");
    const candidate = parsed.searchParams.get("tripId")
      // Hash yönlendirmesi (#cockpit?tripId=...) searchParams'a düşmez.
      || new URLSearchParams(parsed.hash.split("?")[1] || "").get("tripId")
      || "";
    const normalized = candidate.trim();
    return TRIP_ID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
  } catch {
    return null;
  }
}
