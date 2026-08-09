import type { CheckoutHostRule } from "./types";

export type CheckoutUrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function matchesRule(hostname: string, rule: CheckoutHostRule) {
  const allowed = normalizeHostname(rule.hostname);
  if (!allowed) return false;
  if (hostname === allowed) return true;
  return Boolean(rule.allowSubdomains && hostname.endsWith(`.${allowed}`));
}

export function validateCheckoutUrl(
  value: unknown,
  rules: readonly CheckoutHostRule[],
): CheckoutUrlValidationResult {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, reason: "Satın alma bağlantısı eksik." };
  }
  const raw = value.trim();
  if (raw.length > 2048) return { ok: false, reason: "Satın alma bağlantısı çok uzun." };

  try {
    const parsed = new URL(raw);
    const hostname = normalizeHostname(parsed.hostname);
    if (parsed.protocol !== "https:") {
      return { ok: false, reason: "Satın alma bağlantısı HTTPS olmalıdır." };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, reason: "Satın alma bağlantısı kullanıcı bilgisi içeremez." };
    }
    if (parsed.port && parsed.port !== "443") {
      return { ok: false, reason: "Satın alma bağlantısı izin verilmeyen port içeriyor." };
    }
    if (!rules.some((rule) => matchesRule(hostname, rule))) {
      return { ok: false, reason: "Satın alma alan adı bu kaynak için izinli değil." };
    }
    parsed.hash = "";
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, reason: "Satın alma bağlantısı geçersiz." };
  }
}

