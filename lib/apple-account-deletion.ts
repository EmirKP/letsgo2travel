import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  APPLE_ISSUER, appleClientSecret, appleDeletionConfig, appleDeletionRandom, appleIdentitySignedInAt,
  appleSubject, decryptAppleRefreshToken, encryptAppleRefreshToken, requiresAppleRevocation, sha256,
  verifyAppleDeletionIdToken, type AppleDeletionConfig, type AppleJwk,
} from "./apple-account-deletion-crypto";

export type AppleDeletionState = "not_required" | "configuration_missing" | "authorization_required" | "ready" | "revoked" | "unavailable";
export type AppleDeletionStatus = { required: boolean; status: AppleDeletionState; message: string };
export type AppleRevocationResult = { ok: true } | { ok: false; status: number; code: string; message: string };

type Grant = {
  id: string; user_id: string; client_id: string; subject_hash: string;
  encrypted_refresh_token: string | null; authorized_at: string; revoked_at: string | null;
};
type Authorization = { user_id: string; nonce: string; state_hash: string };

const GRANT_COLUMNS = "id,user_id,client_id,subject_hash,encrypted_refresh_token,authorized_at,revoked_at";
const FAILURE = "Apple bağlantısı kontrol edilemedi. Hesabınız silinmedi; daha sonra tekrar deneyebilirsiniz.";

function grantContext(grant: Pick<Grant, "user_id" | "client_id" | "subject_hash">): string {
  return `apple-deletion:v1:${grant.user_id}:${grant.client_id}:${grant.subject_hash}`;
}

async function readGrant(supabase: SupabaseClient, user: User) {
  return await supabase.from("apple_account_deletion_grants").select(GRANT_COLUMNS).eq("user_id", user.id).maybeSingle();
}

function statusFromGrant(user: User, config: AppleDeletionConfig, grant: Grant | null): AppleDeletionStatus {
  const subject = appleSubject(user);
  if (subject && grant && grant.client_id === config.clientId && grant.subject_hash === sha256(subject)) {
    if (grant.revoked_at && appleIdentitySignedInAt(user) <= Date.parse(grant.revoked_at)) {
      return { required: true, status: "revoked", message: "Apple bağlantısının iptali tamamlandı." };
    }
    // A later Apple login may follow revocation in Apple's settings. A previous
    // invalid token also gets HTTP 200 from revoke, so it must not stand in for the new consent.
    if (!grant.revoked_at && grant.encrypted_refresh_token && appleIdentitySignedInAt(user) <= Date.parse(grant.authorized_at)) {
      return { required: true, status: "ready", message: "Hesap silinirken Apple bağlantısı da iptal edilecek." };
    }
  }
  return { required: true, status: "authorization_required", message: "Hesap silme için bağlı Apple hesabınızla doğrulama yapın. Apple bağlantısı hesabınız silinirken iptal edilecek." };
}

export async function getAppleDeletionStatus(supabase: SupabaseClient, user: User): Promise<AppleDeletionStatus> {
  if (!requiresAppleRevocation(user)) return { required: false, status: "not_required", message: "Apple bağlantısı bulunmuyor." };
  const config = appleDeletionConfig();
  if (!config) return { required: true, status: "configuration_missing", message: "Apple hesap silme bağlantısı henüz hazır değil. Talebiniz alınabilir; işlem tamamlandığında size bilgi verilecek." };
  try {
    const { data, error } = await readGrant(supabase, user);
    if (error || !appleSubject(user)) return { required: true, status: "unavailable", message: FAILURE };
    return statusFromGrant(user, config, data as Grant | null);
  } catch { return { required: true, status: "unavailable", message: FAILURE }; }
}

export async function startAppleDeletionAuthorization(supabase: SupabaseClient, user: User, sessionId: string) {
  const config = appleDeletionConfig();
  if (!config) return { ok: false as const, status: 503, code: "apple_configuration_missing", message: "Apple hesap silme bağlantısı henüz hazır değil." };
  if (!requiresAppleRevocation(user) || !appleSubject(user)) return { ok: false as const, status: 409, code: "apple_identity_missing", message: "Bu hesapta doğrulanabilir bir Apple bağlantısı bulunamadı." };
  const current = await getAppleDeletionStatus(supabase, user);
  if (current.status === "ready" || current.status === "revoked") return { ok: false as const, status: 409, code: "apple_already_authorized", message: "Apple doğrulaması zaten tamamlanmış. Hesap silme talebinize devam edebilirsiniz." };
  const state = appleDeletionRandom(), nonce = appleDeletionRandom();
  const { data, error } = await supabase.rpc("begin_apple_deletion_authorization", {
    p_user_id: user.id, p_session_id: sessionId, p_state_hash: sha256(state), p_nonce: nonce,
    p_identity_signed_in_at: appleIdentitySignedInAt(user) ? new Date(appleIdentitySignedInAt(user)).toISOString() : null,
  });
  if (error) return { ok: false as const, status: 503, code: "apple_authorization_unavailable", message: "Apple doğrulaması başlatılamadı; lütfen tekrar deneyin." };
  if (!data) return { ok: false as const, status: 429, code: "apple_authorization_wait", message: "Son doğrulama isteğinden sonra bir dakika bekleyip tekrar deneyin. Oturumunuz kapandıysa tekrar giriş yapın." };
  const authorizationUrl = new URL(`${APPLE_ISSUER}/auth/authorize`);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
    response_mode: "form_post", state, nonce,
  }).toString();
  return { ok: true as const, authorizationUrl: authorizationUrl.toString() };
}

async function appleResponse(path: "/auth/token" | "/auth/revoke", values: Record<string, string>, config: AppleDeletionConfig): Promise<Response> {
  return await fetch(`${APPLE_ISSUER}${path}`, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: appleClientSecret(config), ...values }),
  });
}

async function readAppleJson(response: Response): Promise<Record<string, unknown>> {
  if (Number(response.headers.get("content-length")) > 65_536) throw new Error("apple_response_too_large");
  const text = await response.text();
  if (text.length > 65_536) throw new Error("apple_response_too_large");
  return JSON.parse(text) as Record<string, unknown>;
}

let cachedKeys: { expires: number; keys: AppleJwk[] } | null = null;
async function appleKeys(): Promise<AppleJwk[]> {
  if (cachedKeys && cachedKeys.expires > Date.now()) return cachedKeys.keys;
  const response = await fetch(`${APPLE_ISSUER}/auth/keys`, { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new Error("apple_keys_unavailable");
  const body = await readAppleJson(response);
  if (!Array.isArray(body.keys) || body.keys.length > 20) throw new Error("apple_keys_invalid");
  cachedKeys = { expires: Date.now() + 3_600_000, keys: body.keys as AppleJwk[] };
  return cachedKeys.keys;
}

/** State is consumed atomically before exchanging the one-use authorization code. */
export async function finishAppleDeletionAuthorization(supabase: SupabaseClient, state: string, code: string) {
  const config = appleDeletionConfig();
  if (!config) return { ok: false, message: "Apple hesap silme bağlantısı henüz hazır değil." };
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) return { ok: false, message: "Geçersiz veya süresi dolmuş doğrulama. Uygulamadan tekrar başlatın." };
  try {
    const { data, error } = await supabase.rpc("claim_apple_deletion_authorization", { p_state_hash: sha256(state) });
    const transaction = data as Authorization | null;
    if (error || !transaction?.user_id || !transaction.nonce) return { ok: false, message: "Bu doğrulamanın süresi dolmuş veya daha önce kullanılmış. Uygulamadan tekrar başlatın." };
    const account = await supabase.auth.admin.getUserById(transaction.user_id);
    const user = account.data.user;
    const subject = user && appleSubject(user);
    if (account.error || !user || !subject) return { ok: false, message: "Apple bağlantısı doğrulanamadı. Uygulamadan tekrar giriş yapın." };
    const response = await appleResponse("/auth/token", { code, grant_type: "authorization_code", redirect_uri: config.redirectUri }, config);
    if (!response.ok) return { ok: false, message: "Apple doğrulaması tamamlanamadı. Uygulamadan yeniden deneyin." };
    const tokens = await readAppleJson(response);
    if (typeof tokens.refresh_token !== "string" || !tokens.refresh_token || tokens.refresh_token.length > 16_384 || typeof tokens.id_token !== "string") {
      return { ok: false, message: "Apple hesap silme yetkisi alınamadı. Lütfen yeniden doğrulayın." };
    }
    let keys = await appleKeys();
    // One refresh permits Apple's signing-key rotation; no untrusted jku/x5u URL is fetched.
    const tokenHeader = JSON.parse(Buffer.from(tokens.id_token.split(".")[0], "base64url").toString());
    if (!keys.some((key) => key.kid === tokenHeader.kid)) { cachedKeys = null; keys = await appleKeys(); }
    verifyAppleDeletionIdToken(tokens.id_token, keys, { clientId: config.clientId, subject, nonce: transaction.nonce });
    const subjectHash = sha256(subject);
    const encrypted = encryptAppleRefreshToken(tokens.refresh_token, config.encryptionKey, grantContext({ user_id: user.id, client_id: config.clientId, subject_hash: subjectHash }));
    const saved = await supabase.rpc("save_apple_deletion_grant", {
      p_state_hash: transaction.state_hash, p_user_id: user.id, p_client_id: config.clientId,
      p_subject_hash: subjectHash, p_encrypted_token: encrypted,
      p_identity_signed_in_at: appleIdentitySignedInAt(user) ? new Date(appleIdentitySignedInAt(user)).toISOString() : null,
    });
    if (saved.error || !saved.data) {
      // A concurrent deletion/session closure must not leave a freshly authorized grant behind.
      await appleResponse("/auth/revoke", { token: tokens.refresh_token, token_type_hint: "refresh_token" }, config).catch(() => null);
      return { ok: false, message: "Doğrulama kaydedilemedi veya hesap silme işlemi zaten tamamlanıyor. Uygulamadaki talep durumunu kontrol edin." };
    }
    return { ok: true, message: "Apple doğrulaması tamamlandı. Uygulamaya dönüp hesap silme talebinize devam edebilirsiniz." };
  } catch {
    // Never log Apple's tokens, authorization codes, state, or raw provider errors.
    return { ok: false, message: "Apple doğrulaması tamamlanamadı. Bağlı Apple hesabını seçtiğinizden emin olup uygulamadan yeniden deneyin." };
  }
}

/** Must run before deleting files, app data, or the Supabase account. Safe to retry. */
export async function revokeAppleBeforeDeletion(supabase: SupabaseClient, user: User): Promise<AppleRevocationResult> {
  if (!requiresAppleRevocation(user)) return { ok: true };
  const config = appleDeletionConfig();
  if (!config) return { ok: false, status: 503, code: "apple_configuration_missing", message: "Apple iptal yapılandırması eksik; hesap silinmedi." };
  try {
    const { data, error } = await readGrant(supabase, user);
    if (error) return { ok: false, status: 503, code: "apple_storage_unavailable", message: FAILURE };
    const grant = data as Grant | null;
    const status = statusFromGrant(user, config, grant);
    if (status.status === "revoked") return { ok: true };
    if (status.status !== "ready" || !grant?.encrypted_refresh_token) return { ok: false, status: 409, code: "apple_authorization_required", message: "Kullanıcının hesap silme için Apple bağlantısını doğrulaması gerekiyor; hesap silinmedi." };
    const refreshToken = decryptAppleRefreshToken(grant.encrypted_refresh_token, config.encryptionKey, grantContext(grant));
    const response = await appleResponse("/auth/revoke", { token: refreshToken, token_type_hint: "refresh_token" }, config);
    if (response.status !== 200) {
      // Apple documents 200 for success (including already-revoked tokens). Other statuses must not permit deletion.
      return { ok: false, status: 503, code: "apple_revocation_failed", message: "Apple bağlantısı iptal edilemedi; hesap silinmedi. İşlem yeniden denenebilir." };
    }
    const saved = await supabase.from("apple_account_deletion_grants")
      .update({ revoked_at: new Date().toISOString(), encrypted_refresh_token: null })
      .eq("user_id", user.id).eq("id", grant.id).is("revoked_at", null).select("id").maybeSingle();
    if (saved.error || !saved.data) return { ok: false, status: 503, code: "apple_receipt_unavailable", message: "Apple iptal sonuç kaydı doğrulanamadı; hesap silinmedi. İşlemi yeniden deneyin." };
    return { ok: true };
  } catch { return { ok: false, status: 503, code: "apple_revocation_unavailable", message: FAILURE }; }
}
