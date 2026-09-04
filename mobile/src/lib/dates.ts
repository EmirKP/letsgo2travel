// Saat dilimi guvenli tarih yardimcilari: toISOString UTC gunu dondugu
// icin gece saatlerinde tarihi bir gun geri kaydirir; bu yuzden yerel
// takvim gunu Intl ile uretilir.

export function localIsoDate(daysFromNow = 0, now: Date = new Date()): string {
  // Takvim gunu eklerken sabit 24 saat kullanmak yaz/kis saati gecislerinde
  // yanlis gune kayabilir. Cihazin yerel takviminde gunu ilerlet.
  const date = new Date(now);
  date.setDate(date.getDate() + daysFromNow);
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

export function localIsoDateTime(minutesFromNow = 0, now: Date = new Date()): string {
  const date = new Date(now.getTime() + minutesFromNow * 60 * 1000);
  const day = localIsoDate(0, date);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${day}T${time}`;
}

/** Takvim alanından gelen günü izin verilen aralığa anında sıkıştırır. */
export function clampLocalDate(value: string, min = localIsoDate(0), max?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < min) return min;
  if (max && value > max) return max;
  return value;
}

/** datetime-local alanından gelen değeri izin verilen aralığa anında sıkıştırır. */
export function clampLocalDateTime(value: string, min = localIsoDateTime(0), max?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value) || value < min) return min;
  if (max && value > max) return max;
  return value;
}

export function isValidDateRange(start: string, end: string, min = localIsoDate(0), max?: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(start)
    && /^\d{4}-\d{2}-\d{2}$/.test(end)
    && start >= min
    && end >= start
    && (!max || (start <= max && end <= max));
}
