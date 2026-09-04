// Saat dilimi guvenli tarih yardimcilari: toISOString UTC gunu dondugu
// icin gece saatlerinde tarihi bir gun geri kaydirir; bu yuzden yerel
// takvim gunu Intl ile uretilir.

export function localIsoDate(daysFromNow = 0, now: Date = new Date()): string {
  const date = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function isPastLocalDate(value: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return value < localIsoDate(0, now);
}

/** Bugünün içinde seçilen bir saat artık geçmişte kaldı mı? */
export function isPastLocalDateTime(date: string, time: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return true;
  const today = localIsoDate(0, now);
  if (date < today) return true;
  if (date > today) return false;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return time < currentTime;
}
