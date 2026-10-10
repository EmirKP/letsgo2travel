import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMUNITY_PRIVATE_HEADERS, COMMUNITY_UUID } from "./safety";
import { signedCommunityAvatars } from "./profiles";
import { SOCIAL_PHOTO_BUCKET } from "./social-contract";

type RecordValue = Record<string, unknown>;
export const socialRecord = (input: unknown): RecordValue => input !== null && typeof input === "object" && !Array.isArray(input) ? input as RecordValue : {};
export const socialUuid = (input: unknown): input is string => typeof input === "string" && COMMUNITY_UUID.test(input);
const plainText = (input: unknown, max: number, required = false): input is string => typeof input === "string"
  && [...input.trim()].length <= max && (!required || input.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input);

export async function readSocialJson(request: Request, maximum = 430_000) {
  if (Number(request.headers.get("content-length") || 0) > maximum) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maximum) { await reader.cancel(); return null; }
    chunks.push(chunk.value);
  }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); return Object.keys(socialRecord(parsed)).length ? socialRecord(parsed) : null; }
  catch { return null; }
}

export function parseSocialCreate(input: RecordValue) {
  if (!socialUuid(input.requestId) || !plainText(input.caption, 2200) || !["public", "followers"].includes(String(input.visibility))) return null;
  let place: RecordValue | null = null;
  if (input.place !== undefined && input.place !== null) {
    const value = socialRecord(input.place);
    if (!plainText(value.name, 120, true)) return null;
    place = { name: value.name.trim() };
    if (value.countryCode !== undefined) {
      if (typeof value.countryCode !== "string" || !/^[A-Z]{2}$/.test(value.countryCode)) return null;
      place.countryCode = value.countryCode;
    }
    if (value.lat !== undefined || value.lng !== undefined) {
      if (typeof value.lat !== "number" || !Number.isFinite(value.lat) || Math.abs(value.lat) > 90
        || typeof value.lng !== "number" || !Number.isFinite(value.lng) || Math.abs(value.lng) > 180) return null;
      place.lat = value.lat; place.lng = value.lng;
    }
  }
  return { requestId: input.requestId.toLowerCase(), caption: input.caption.trim(), visibility: input.visibility, place };
}

export function parseSocialAction(input: RecordValue) {
  const action = input.action;
  if (action === "collection-create") return plainText(input.name, 60, true) ? { name: input.name.trim() } : null;
  if (action === "notifications-read") return input.id === undefined ? {} : socialUuid(input.id) ? { id: input.id } : null;
  if (!socialUuid(input.postId)) return null;
  const base: RecordValue = { postId: input.postId };
  if (action === "delete" || action === "restore") return base;
  if (action === "block") return input.commentId == null ? base : socialUuid(input.commentId) ? { ...base, commentId: input.commentId } : null;
  if (action === "like" || action === "save") {
    if (typeof input.active !== "boolean" || action === "save" && !socialUuid(input.collectionId)) return null;
    return { ...base, active: input.active, ...(action === "save" ? { collectionId: input.collectionId } : {}) };
  }
  if (action === "comment") {
    if (!plainText(input.body, 2000, true) || !socialUuid(input.requestId) || input.parentId != null && !socialUuid(input.parentId)) return null;
    return { ...base, body: input.body.trim(), requestId: input.requestId, parentId: input.parentId || null };
  }
  if (action === "report") {
    if (!["spam", "harassment", "inappropriate", "other"].includes(String(input.reason)) || input.commentId != null && !socialUuid(input.commentId)
      || input.details !== undefined && !plainText(input.details, 1000) || input.reason === "other" && (!plainText(input.details, 1000, true) || input.details.trim().length < 5)) return null;
    return { ...base, reason: input.reason, commentId: input.commentId || null, details: typeof input.details === "string" ? input.details.trim() : "" };
  }
  return null;
}

export function parseSocialPreferences(input: RecordValue) {
  const fields = ["comments", "replies", "follows", "price_alert_email", "price_alert_push"];
  const keys = Object.keys(input);
  return keys.length && keys.every(key => fields.includes(key) && typeof input[key] === "boolean") ? input : null;
}

export function socialError(error?: { code?: string } | null) {
  const status = error?.code === "P0002" ? 404 : error?.code === "42501" ? 403 : error?.code === "54000" ? 429
    : error?.code === "23505" ? 409 : ["22023", "22P02", "23514"].includes(error?.code || "") ? 400 : 503;
  const message = status === 404 ? "Gönderi bulunamadı veya artık erişilebilir değil." : status === 429 ? "Çok sık işlem yapıldı. Lütfen biraz sonra tekrar dene."
    : status === 403 ? "Bu işlem için izin gerekli." : status === 409 ? "İşlem daha önce farklı bilgilerle gönderilmiş. Yeniden dene."
      : status === 400 ? "Bilgiler geçersiz veya geri alma süresi dolmuş." : "Bu bölüm şu anda kullanılamıyor. Lütfen tekrar dene.";
  return Response.json({ error: message }, { status, headers: COMMUNITY_PRIVATE_HEADERS });
}

/** Strip private avatar paths, signing only avatars explicitly shared by RPC identity. */
export async function hydrateSocialData(db: SupabaseClient, input: unknown): Promise<unknown> {
  const identities: Array<{ userId: unknown; avatarPath: unknown }> = [];
  const gather = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(gather); return; }
    const row = socialRecord(value);
    if (row.userId && row.key) identities.push({ userId: row.userId, avatarPath: row.avatarPath });
    Object.values(row).forEach(item => { if (item && typeof item === "object") gather(item); });
  };
  gather(input);
  const urls = await signedCommunityAvatars(db, identities);
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    const row = socialRecord(value);
    const result = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "avatarPath").map(([key, item]) => [key, clean(item)]));
    if (typeof row.userId === "string" && row.key) result.avatarUrl = urls.get(row.userId) || null;
    return result;
  };
  return clean(input);
}

export async function socialStorageReady(db: SupabaseClient) {
  const { data, error } = await db.storage.getBucket(SOCIAL_PHOTO_BUCKET);
  return !error && data?.public === false;
}
export async function socialPhotoResponse(db: SupabaseClient, input: unknown, postId: string) {
  const row = socialRecord(input);
  if (!socialUuid(row.userId) || !socialUuid(postId) || row.storagePath !== `${row.userId}/${postId}.jpg`) return socialError({ code: "P0002" });
  if (!await socialStorageReady(db)) return socialError();
  const { data, error } = await db.storage.from(SOCIAL_PHOTO_BUCKET).download(row.storagePath as string);
  if (error || !data) return socialError({ code: "P0002" });
  return new Response(data, { headers: { ...COMMUNITY_PRIVATE_HEADERS, "Content-Type": "image/jpeg", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}

/** Account erasure must also clean private objects from failed, unfinished uploads. */
export async function removeSocialAccountPhotos(db: SupabaseClient, userId: string) {
  if (!socialUuid(userId)) throw new Error("invalid_social_owner");
  const { error: lookupError } = await db.from("travel_social_posts").select("id").eq("user_id", userId).limit(1);
  if (lookupError?.code === "42P01" || lookupError?.code === "PGRST205") return;
  if (lookupError) throw new Error("social_cleanup_unavailable");
  while (true) {
    const { data, error } = await db.storage.from(SOCIAL_PHOTO_BUCKET).list(userId, { limit: 100 });
    if (error) throw new Error("social_cleanup_unavailable");
    if (!data?.length) break;
    const paths = data.map(item => `${userId}/${item.name}`);
    if (data.some(item => !item.name.endsWith(".jpg") || !socialUuid(item.name.slice(0, -4)))) throw new Error("invalid_social_cleanup_path");
    const result = await db.storage.from(SOCIAL_PHOTO_BUCKET).remove(paths);
    if (result.error) throw new Error("social_cleanup_failed");
  }
  // All social rows cascade from auth.users, after storage succeeds.
}
