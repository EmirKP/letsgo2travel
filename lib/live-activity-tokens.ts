// Live Activity oturum/token iş mantığı. Tüm güvenlik-kritik yazımlar SQL
// RPC'lerinde tek transaksiyonda yapılır; PostgREST tablo zinciri veya
// migration-yok fallback'i kullanılmaz.

type SupabaseLike = any;

export type TokenRouteResult = {
  status: number;
  body: Record<string, unknown>;
};

const TOKEN_TYPES = new Set(["push_to_start", "activity_update"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RPC_MISSING_CODES = new Set(["PGRST202", "42883", "42P01", "42703"]);

function cleanToken(value: unknown) {
  const token = String(value || "").trim();
  if (token.length < 16 || token.length > 512 || !/^[A-Fa-f0-9]+$/.test(token)) return null;
  return token.toLowerCase();
}

function cleanUuid(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function cleanGeneration(value: unknown) {
  const raw = typeof value === "number" ? String(value) : String(value || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const generation = Number(raw);
  return Number.isSafeInteger(generation) && generation > 0 ? generation : null;
}

function errorCode(error: unknown): string {
  return (error as { code?: string })?.code || "unknown";
}

function rpcFailure(error: unknown, logName: string, fallbackMessage: string): TokenRouteResult {
  const code = errorCode(error);
  if (code === "LA001") {
    return { status: 409, body: { error: "Bu cihaz oturumu artık güncel değil." } };
  }
  if (code === "LA003") {
    return { status: 403, body: { error: "Bu kayda erişim iznin yok." } };
  }
  if (RPC_MISSING_CODES.has(code)) {
    return { status: 503, body: { error: "Servis henüz hazır değil." } };
  }
  console.error(logName, { code });
  return { status: 500, body: { error: fallbackMessage } };
}

export type SessionInput = {
  installationId?: unknown;
  sessionEpoch?: unknown;
  generation?: unknown;
};

/**
 * Her login'de token kaydından ÖNCE çağrılır. Kalıcı monoton generation,
 * başarılı logout'a ihtiyaç duymadan eski hesabın gecikmiş isteklerini
 * sunucu tarafında geçersiz kılar.
 */
export async function beginLiveActivitySession(
  supabase: SupabaseLike,
  userId: string,
  input: SessionInput,
): Promise<TokenRouteResult> {
  const installationId = cleanUuid(input?.installationId);
  const sessionEpoch = cleanUuid(input?.sessionEpoch);
  const generation = cleanGeneration(input?.generation);
  if (!installationId || !sessionEpoch || !generation) {
    return { status: 400, body: { error: "Geçersiz Live Activity oturumu." } };
  }

  const { error } = await supabase.rpc("begin_live_activity_session", {
    p_user_id: userId,
    p_installation_id: installationId,
    p_epoch: sessionEpoch,
    p_generation: generation,
  });
  if (error) return rpcFailure(error, "live_activity_session_baslatma_hatasi", "Oturum başlatılamadı.");
  return { status: 200, body: { success: true } };
}

export type RegisterTokenInput = SessionInput & {
  tokenType?: unknown;
  token?: unknown;
  tripId?: unknown;
};

export async function registerLiveActivityToken(
  supabase: SupabaseLike,
  userId: string,
  input: RegisterTokenInput,
): Promise<TokenRouteResult> {
  const tokenType = String(input?.tokenType || "").toLowerCase();
  const token = cleanToken(input?.token);
  const tripId = cleanUuid(input?.tripId);
  const installationId = cleanUuid(input?.installationId);
  const sessionEpoch = cleanUuid(input?.sessionEpoch);
  const generation = cleanGeneration(input?.generation);
  if (!TOKEN_TYPES.has(tokenType) || !token || !installationId || !sessionEpoch || !generation
      || (tokenType === "activity_update" && !tripId)) {
    return { status: 400, body: { error: "Geçersiz token kaydı isteği." } };
  }

  const rpcName = tokenType === "push_to_start"
    ? "register_live_activity_push_to_start"
    : "register_live_activity_update";
  const args: Record<string, unknown> = {
    p_user_id: userId,
    p_installation_id: installationId,
    p_token: token,
    p_epoch: sessionEpoch,
    p_generation: generation,
  };
  if (tokenType === "activity_update") args.p_trip_id = tripId;

  const { error } = await supabase.rpc(rpcName, args);
  if (error) return rpcFailure(error, "live_activity_token_kayit_hatasi", "Token kaydedilemedi.");
  return { status: 200, body: { success: true } };
}

/** Bu kullanıcının yalnız bu kurulumdaki tokenlarını kapatır. */
export async function deactivateLiveActivityInstallation(
  supabase: SupabaseLike,
  userId: string,
  installationIdInput: unknown,
  sessionEpochInput: unknown,
  generationInput: unknown,
): Promise<TokenRouteResult> {
  const installationId = cleanUuid(installationIdInput);
  const sessionEpoch = cleanUuid(sessionEpochInput);
  const generation = cleanGeneration(generationInput);
  if (!installationId || !sessionEpoch || !generation) {
    return { status: 400, body: { error: "Geçersiz çıkış oturumu." } };
  }

  const { error } = await supabase.rpc("deactivate_live_activity_installation", {
    p_user_id: userId,
    p_installation_id: installationId,
    p_epoch: sessionEpoch,
    p_generation: generation,
  });
  if (error) return rpcFailure(error, "live_activity_cikis_hatasi", "Çıkış temizliği yapılamadı.");
  return { status: 200, body: { success: true } };
}
