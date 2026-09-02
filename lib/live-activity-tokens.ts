// Live Activity token kayıt/çıkış iş mantığı (route'tan ayrık; birim
// testli). Kurallar:
// - Token değeri hiçbir yanıt/log/hata mesajına yazılmaz.
// - activity_update tokenı yalnız kullanıcının KENDİ kokpit kaydına
//   bağlanabilir (trips.user_id doğrulanır).
// - push_to_start kaydı için installationId ZORUNLUDUR ve geçerli UUID
//   olmalıdır (eksik/geçersiz → 400; sessiz rotasyonsuz yol YOKTUR) ve
//   kayıt YALNIZ register_live_activity_push_to_start RPC'siyle yapılır:
//   rotasyon + hesaplar-arası tekil sahiplik + advisory-lock serileştirme
//   TEK transaksiyondadır. RPC henüz üretimde yoksa (gerçek PostgREST
//   kodu PGRST202 "Could not find the function ... in the schema cache";
//   doğrudan PG eşdeğeri 42883) GÜVENLİKSİZ bir fallback'e DÜŞÜLMEZ —
//   503 döner; mobil token'ı ACK ETMEZ ve migration uygulanınca yeniden
//   dener (v6).
// - activity_update: trip sahipliği doğrulanır; per-user upsert güvenlidir
//   (hesaplar-arası risk yok — token aktiviteye özeldir).
// - Çıkış: deactivate_live_activity_installation kullanıcının BU
//   kurulumdaki push_to_start VE activity_update tokenlarını kapatır;
//   diğer cihazlara dokunmaz. Çıkışta RPC yoksa user_id+installation_id
//   filtreli tek UPDATE fallback'i GÜVENLİDİR ve korunur.

type SupabaseLike = any;

export type TokenRouteResult = {
  status: number;
  body: Record<string, unknown>;
};

const TOKEN_TYPES = new Set(["push_to_start", "activity_update"]);
const MAX_TOKENS_PER_USER_PER_TYPE = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// PostgREST: şema önbelleğinde fonksiyon yok. Doğrudan PG: undefined_function.
const RPC_MISSING_CODES = new Set(["PGRST202", "42883"]);

function cleanToken(value: unknown) {
  const token = String(value || "").trim();
  if (token.length < 16 || token.length > 512) return null;
  if (!/^[A-Fa-f0-9]+$/.test(token)) return null;
  return token.toLowerCase();
}

function cleanUuid(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function errorCode(error: unknown): string {
  return (error as { code?: string })?.code || "unknown";
}

export type RegisterTokenInput = {
  tokenType?: unknown;
  token?: unknown;
  tripId?: unknown;
  installationId?: unknown;
};

export async function registerLiveActivityToken(
  supabase: SupabaseLike,
  userId: string,
  input: RegisterTokenInput,
): Promise<TokenRouteResult> {
  const tokenType = String(input?.tokenType || "").toLowerCase();
  const token = cleanToken(input?.token);
  const tripId = cleanUuid(input?.tripId);
  if (!TOKEN_TYPES.has(tokenType) || !token || (tokenType === "activity_update" && !tripId)) {
    return { status: 400, body: { error: "Geçersiz token kaydı isteği." } };
  }

  // push_to_start için kurulum kimliği ZORUNLU ve geçerli UUID olmalı:
  // kimliksiz/geçersiz kayıt sızıntı korumasını atlatırdı → 400.
  const installationId = cleanUuid(input?.installationId);
  if (tokenType === "push_to_start" && !installationId) {
    return { status: 400, body: { error: "Geçersiz kurulum kimliği (UUID olmalı)." } };
  }
  if (input?.installationId !== undefined && input?.installationId !== null && input?.installationId !== "" && !installationId) {
    return { status: 400, body: { error: "Geçersiz kurulum kimliği (UUID olmalı)." } };
  }

  // activity_update: trip SAHİPLİĞİ doğrulanır.
  if (tokenType === "activity_update" && tripId) {
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .eq("user_id", userId)
      .limit(1);
    if (tripError) return { status: 500, body: { error: "Kayıt doğrulanamadı." } };
    if (!trip?.length) return { status: 403, body: { error: "Bu kayda erişim iznin yok." } };
  }

  const now = new Date().toISOString();

  // push_to_start: kayıt YALNIZ RPC ile (rotasyon + tek-hesap + advisory
  // lock tek transaksiyonda). RPC yoksa güvenliksiz per-user upsert'e
  // DÜŞÜLMEZ — 503 döner; istemci token'ı ack etmez ve sonra yeniden dener.
  if (tokenType === "push_to_start") {
    const { error: rpcError } = await supabase.rpc("register_live_activity_push_to_start", {
      p_user_id: userId,
      p_installation_id: installationId,
      p_token: token,
    });
    if (!rpcError) return { status: 200, body: { success: true } };
    const rpcCode = errorCode(rpcError);
    if (rpcCode === "42P01" || RPC_MISSING_CODES.has(rpcCode) || rpcCode === "42703") {
      return { status: 503, body: { error: "Servis henüz hazır değil." } };
    }
    console.error("live_activity_token_rotasyon_hatasi", { code: rpcCode });
    return { status: 500, body: { error: "Token kaydedilemedi." } };
  }

  // Tür başına kullanıcı kotası: en eski etkin kayıt kapatılarak yer açılır.
  const { count } = await supabase
    .from("live_activity_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("token_type", tokenType)
    .eq("enabled", true);
  if ((count || 0) >= MAX_TOKENS_PER_USER_PER_TYPE) {
    const { data: oldest } = await supabase
      .from("live_activity_tokens")
      .select("id")
      .eq("user_id", userId)
      .eq("token_type", tokenType)
      .eq("enabled", true)
      .order("updated_at", { ascending: true })
      .limit(1);
    if (oldest?.[0]) {
      await supabase.from("live_activity_tokens").update({ enabled: false, updated_at: now }).eq("id", oldest[0].id);
    }
  }

  const { error } = await supabase
    .from("live_activity_tokens")
    .upsert(
      {
        user_id: userId,
        token_type: tokenType,
        trip_id: tokenType === "activity_update" ? tripId : null,
        ...(installationId ? { installation_id: installationId } : {}),
        token,
        enabled: true,
        updated_at: now,
      },
      { onConflict: "user_id,token_type,token" },
    );
  if (error) {
    const code = errorCode(error);
    if (code === "42P01") return { status: 503, body: { error: "Servis henüz hazır değil." } };
    console.error("live_activity_token_kayit_hatasi", { code });
    return { status: 500, body: { error: "Token kaydedilemedi." } };
  }

  return { status: 200, body: { success: true } };
}

/**
 * Çıkış temizliği: kullanıcının BU kurulumdaki (fiziksel cihaz) tüm
 * Live Activity tokenlarını kapatır. Bearer doğrulaması route'ta yapılır;
 * yalnız MEVCUT oturumun user_id'siyle çağrılır — başka hesabın veya
 * kullanıcının DİĞER cihazlarının (iPad) tokenlarına dokunulmaz.
 */
export async function deactivateLiveActivityInstallation(
  supabase: SupabaseLike,
  userId: string,
  installationIdInput: unknown,
): Promise<TokenRouteResult> {
  const installationId = cleanUuid(installationIdInput);
  if (!installationId) {
    return { status: 400, body: { error: "Geçersiz kurulum kimliği (UUID olmalı)." } };
  }

  const { error: rpcError } = await supabase.rpc("deactivate_live_activity_installation", {
    p_user_id: userId,
    p_installation_id: installationId,
  });
  if (!rpcError) return { status: 200, body: { success: true } };

  const rpcCode = errorCode(rpcError);
  if (rpcCode === "42P01") return { status: 503, body: { error: "Servis henüz hazır değil." } };
  if (!RPC_MISSING_CODES.has(rpcCode)) {
    console.error("live_activity_cikis_hatasi", { code: rpcCode });
    return { status: 500, body: { error: "Çıkış temizliği yapılamadı." } };
  }

  // RPC yoksa geriye dönük uyumlu yol: tek UPDATE — her iki token türü.
  const { error } = await supabase
    .from("live_activity_tokens")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("installation_id", installationId)
    .eq("enabled", true);
  if (error) {
    const code = errorCode(error);
    if (code === "42P01") return { status: 503, body: { error: "Servis henüz hazır değil." } };
    console.error("live_activity_cikis_hatasi", { code });
    return { status: 500, body: { error: "Çıkış temizliği yapılamadı." } };
  }
  return { status: 200, body: { success: true } };
}
