// Tarih yardımcıları: saat dilimi kaynaklı "bir gün geri kayma" hatasını
// önlemek için tarih dizeleri HER ZAMAN hedef saat diliminde üretilir
// (toISOString UTC'ye çevirdiği için gece saatlerinde günü kaydırır).

export const DEFAULT_TRAVEL_TIME_ZONE = "Europe/Istanbul";

/** Geçerli bir IANA saat dilimi adı mı? (Intl ile fiilen doğrulanır) */
export function isValidTimeZone(value: string): boolean {
  if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * İstemciden gelen saat dilimini temizler. API'de sabit Europe/Istanbul
 * YOKTUR: istemci kendi IANA saat dilimini gönderir; yalnız değer yoksa
 * veya geçersizse varsayılana düşülür (istek reddedilmez).
 */
export function sanitizeTimeZone(value: unknown, fallback: string = DEFAULT_TRAVEL_TIME_ZONE): string {
  const timeZone = typeof value === "string" ? value.trim() : "";
  return timeZone && isValidTimeZone(timeZone) ? timeZone : fallback;
}

/** Verilen saat diliminde bugünün YYYY-MM-DD karşılığı. */
export function todayIsoInTimeZone(timeZone: string = DEFAULT_TRAVEL_TIME_ZONE, now: Date = new Date()): string {
  // en-CA yereli YYYY-MM-DD üretir.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Bugünden n gün sonrasının YYYY-MM-DD karşılığı (hedef saat diliminde). */
export function isoDateAfterDays(days: number, timeZone: string = DEFAULT_TRAVEL_TIME_ZONE, now: Date = new Date()): string {
  return todayIsoInTimeZone(timeZone, new Date(now.getTime() + days * 24 * 60 * 60 * 1000));
}

export function isIsoDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Tarih, hedef saat diliminde bugünden ÖNCE mi? (geçersiz format = true) */
export function isPastTravelDate(value: string, timeZone: string = DEFAULT_TRAVEL_TIME_ZONE, now: Date = new Date()): boolean {
  if (!isIsoDateString(value)) return true;
  return value < todayIsoInTimeZone(timeZone, now);
}
