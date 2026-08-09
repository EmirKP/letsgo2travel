import { internalFlightSearchUrl } from "./affiliate";

type DealRecord = Record<string, unknown>;

function text(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number) {
  const cleaned = text(value, maxLength);
  return cleaned || null;
}

function iata(value: unknown) {
  const cleaned = text(value, 3).toUpperCase();
  return /^[A-Z0-9]{3}$/.test(cleaned) ? cleaned : "";
}

export function normalizeFlightDealMutation(body: unknown, existing?: DealRecord | null) {
  const input = body && typeof body === "object" ? body as DealRecord : {};
  const source = { ...(existing || {}), ...input };
  const originCode = iata(source.origin_code);
  const destinationCode = iata(source.destination_code);
  const price = Number(source.price);
  const slug = text(source.slug, 140).toLocaleLowerCase("tr-TR");
  const imageUrl = text(source.image_url, 1200);

  if (!text(source.title, 180) || !text(source.origin, 100) || !text(source.destination, 100)) {
    return { ok: false as const, error: "Başlık, kalkış ve varış alanları zorunludur." };
  }
  if (!originCode || !destinationCode) {
    return { ok: false as const, error: "Kalkış ve varış kodları üç karakterli IATA kodu olmalıdır." };
  }
  if (!Number.isFinite(price) || price <= 0 || price > 100_000_000) {
    return { ok: false as const, error: "Geçerli bir fiyat girin." };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false as const, error: "Bağlantı adı yalnızca küçük harf, sayı ve tire içermelidir." };
  }
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl, "https://www.letsgo2travel.com.tr");
      if (!imageUrl.startsWith("/") && parsed.protocol !== "https:") throw new Error("HTTPS gerekli");
    } catch {
      return { ok: false as const, error: "Görsel bağlantısı geçerli bir HTTPS adresi veya site içi yol olmalıdır." };
    }
  }

  const currency = /^[A-Z]{3}$/.test(text(source.currency, 3).toUpperCase())
    ? text(source.currency, 3).toUpperCase()
    : "TRY";

  return {
    ok: true as const,
    data: {
      title: text(source.title, 180),
      slug,
      origin: text(source.origin, 100),
      destination: text(source.destination, 100),
      origin_code: originCode,
      destination_code: destinationCode,
      price: Math.round(price),
      currency,
      airline: optionalText(source.airline, 120),
      travel_period: optionalText(source.travel_period, 120),
      trip_type: optionalText(source.trip_type, 50) || "Gidiş dönüş",
      visa_type: optionalText(source.visa_type, 60) || "bilgi_yok",
      region: optionalText(source.region, 80) || "Genel",
      image_url: imageUrl || null,
      affiliate_url: internalFlightSearchUrl({ origin: originCode, destination: destinationCode, currency }),
      active: source.active !== false,
    },
  };
}
