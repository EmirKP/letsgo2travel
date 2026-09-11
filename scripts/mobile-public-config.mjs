// Only public, explicitly selected settings may enter a native/web client.
// This classifies keys; Supabase still verifies their signature and validity.
function fail(field, reason) {
  // Never include a setting's value: build logs may be public.
  throw new Error(`Mobil yapılandırma: ${field} ${reason}`);
}

function first(env, ...names) {
  return names.map((name) => String(env[name] || "").trim()).find(Boolean) || "";
}

function origin(value, field, production) {
  let url;
  try { url = new URL(value); } catch { fail(field, "geçerli bir URL olmalı."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !production && loopback)) {
    fail(field, "HTTPS kullanmalı; HTTP yalnız yerel geliştirme sunucusunda kullanılabilir.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    fail(field, "yalnız sunucu adresini içermeli; parola, yol, sorgu veya fragment içermemeli.");
  }
  return url.origin;
}

function isPublicSupabaseKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  // In particular, sb_secret_ and service_role must never be shipped.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const [header, payload] = key.split(".").slice(0, 2).map((part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")));
    return header?.alg === "HS256" && payload?.role === "anon";
  } catch { return false; }
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ production?: boolean }} options
 */
export function resolveMobilePublicConfig(env, { production = true } = {}) {
  const apiBaseUrl = origin(first(env, "VITE_API_BASE_URL") || "https://www.letsgo2travel.com.tr", "VITE_API_BASE_URL", production);
  const rawSupabaseUrl = first(env, "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = first(env, "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (production && (!rawSupabaseUrl || !supabaseAnonKey)) {
    fail("Supabase", "yayın derlemesinde genel URL ve anon/publishable anahtar gerektirir.");
  }
  const supabaseUrl = rawSupabaseUrl ? origin(rawSupabaseUrl, "SUPABASE_URL", production) : "";
  if (supabaseAnonKey && !isPublicSupabaseKey(supabaseAnonKey)) {
    fail("SUPABASE_ANON_KEY", "yalnız anon JWT veya sb_publishable_ anahtarı olabilir; gizli/yönetici anahtarı veya oturum tokenı kullanılamaz.");
  }
  const supportEmail = first(env, "VITE_SUPPORT_EMAIL", "NEXT_PUBLIC_SUPPORT_EMAIL", "SUPPORT_EMAIL") || "hello@letsgo2travel.com.tr";
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail)) {
    fail("SUPPORT_EMAIL", "geçerli bir e-posta adresi olmalı.");
  }
  const appleAuth = first(env, "VITE_APPLE_AUTH_ENABLED").toLowerCase();
  if (appleAuth && appleAuth !== "true" && appleAuth !== "false") {
    fail("VITE_APPLE_AUTH_ENABLED", "true veya false olmalı.");
  }
  return { apiBaseUrl, supabaseUrl, supabaseAnonKey, supportEmail, appleAuthEnabled: appleAuth !== "false" };
}
