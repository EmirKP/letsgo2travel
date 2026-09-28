import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMUNITY_PRIVATE_HEADERS, COMMUNITY_UUID } from "./safety";

export const COMMUNITY_PHOTO_BUCKET = "community-post-photos";
export const MAX_COMMUNITY_PHOTO_BYTES = 300_000;
export const MAX_COMMUNITY_POST_REQUEST_BYTES = 430_000;

export function ownedCommunityPhotoPath(path: unknown, userId: string, topicId: string): path is string {
  return COMMUNITY_UUID.test(userId) && COMMUNITY_UUID.test(topicId)
    && path === `${userId}/${topicId}.jpg`;
}

export function communityPhotoUrl(topicId: unknown, hasPhoto: unknown, admin = false) {
  if (hasPhoto !== true || typeof topicId !== "string" || !COMMUNITY_UUID.test(topicId)) return null;
  return admin ? `/api/admin/forum/topics/${topicId}/photo` : `/api/country-community/questions/${topicId}/photo`;
}

export function decodeCommunityPhoto(value: unknown): Buffer | null {
  const prefix = "data:image/jpeg;base64,";
  const maxEncodedLength = 4 * Math.ceil(MAX_COMMUNITY_PHOTO_BYTES / 3);
  if (typeof value !== "string" || value.length > prefix.length + maxEncodedLength
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value.slice(prefix.length), "base64");
  return bytes.length >= 4 && bytes.length <= MAX_COMMUNITY_PHOTO_BYTES
    && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    && bytes.at(-2) === 255 && bytes.at(-1) === 217 ? bytes : null;
}

/** Decode, rotate and re-encode: drop EXIF/location metadata and embedded payloads. */
export async function prepareCommunityPhoto(value: unknown): Promise<Buffer | null> {
  const bytes = decodeCommunityPhoto(value);
  if (!bytes) return null;
  try {
    // Re-encoding a detailed, already-compressed client photo can grow it.
    // Bound both attempts and dimensions while always stripping the original metadata.
    for (const [edge, quality] of [[1600, 76], [1600, 60], [1280, 60], [1024, 55], [768, 50]]) {
      const photo = await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" })
        .rotate().resize(edge, edge, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality, progressive: true }).toBuffer();
      if (photo.length <= MAX_COMMUNITY_PHOTO_BYTES) return photo;
    }
    return null;
  } catch { return null; }
}

export function missingCommunityPhotoTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

type Topic = { id: string; author_id: string | null };
export async function communityPhotoTopics(supabase: SupabaseClient, topics: Topic[]) {
  const found = new Set<string>();
  if (!topics.length) return found;
  const { data, error } = await supabase.from("forum_topic_photos")
    .select("topic_id,user_id,storage_path").in("topic_id", topics.map((topic) => topic.id));
  // A server rollout before the additive migration still supports text-only posts.
  if (missingCommunityPhotoTable(error)) return found;
  if (error) throw new Error("community_photos_unavailable");
  const owners = new Map(topics.map((topic) => [topic.id, topic.author_id]));
  for (const row of data || []) {
    if (row.user_id === owners.get(row.topic_id) && ownedCommunityPhotoPath(row.storage_path, row.user_id, row.topic_id)) found.add(row.topic_id);
  }
  return found;
}

export async function communityPhotoStorageReady(supabase: SupabaseClient) {
  const { data, error } = await supabase.storage.getBucket(COMMUNITY_PHOTO_BUCKET);
  return !error && data?.public === false;
}

/** Call only after checking canonical topic publication, author and viewer blocks. */
export async function communityPhotoResponse(supabase: SupabaseClient, topic: Topic) {
  const unavailable = () => Response.json({ error: "Fotoğraf bulunamadı." }, { status: 404, headers: COMMUNITY_PRIVATE_HEADERS });
  if (!topic.author_id) return unavailable();
  const { data, error } = await supabase.from("forum_topic_photos")
    .select("user_id,storage_path").eq("topic_id", topic.id).maybeSingle();
  if (missingCommunityPhotoTable(error)) return unavailable();
  if (error) throw new Error("community_photo_unavailable");
  if (!data || data.user_id !== topic.author_id || !ownedCommunityPhotoPath(data.storage_path, data.user_id, topic.id)) return unavailable();
  if (!await communityPhotoStorageReady(supabase)) throw new Error("community_photo_storage_unavailable");
  const { data: photo, error: downloadError } = await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).download(data.storage_path);
  if (downloadError || !photo) return unavailable();
  return new Response(photo, { headers: {
    ...COMMUNITY_PRIVATE_HEADERS,
    "Content-Type": "image/jpeg",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}

/** Remove private objects before metadata/topic deletion so failed cleanup is retryable. */
export async function removeCommunityTopicPhotos(supabase: SupabaseClient, topicIds: string[]) {
  const { data, error } = await supabase.from("forum_topic_photos")
    .select("topic_id,user_id,storage_path").in("topic_id", topicIds);
  if (missingCommunityPhotoTable(error)) return;
  if (error) throw new Error("community_photo_cleanup_unavailable");
  const paths = (data || []).filter((row) => ownedCommunityPhotoPath(row.storage_path, row.user_id, row.topic_id)).map((row) => row.storage_path);
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove(paths);
    if (removeError) throw new Error("community_photo_cleanup_failed");
  }
}

/** Include unfinished upload objects, which do not necessarily have metadata rows. */
export async function removeCommunityAccountPhotos(supabase: SupabaseClient, userId: string) {
  if (!COMMUNITY_UUID.test(userId)) throw new Error("community_photo_owner_invalid");
  const { data: linkedPhotos, error: lookupError } = await supabase.from("forum_topic_photos").select("topic_id").eq("user_id", userId);
  if (missingCommunityPhotoTable(lookupError)) return;
  if (lookupError) throw new Error("community_photo_cleanup_unavailable");
  const { data: bucket, error: bucketError } = await supabase.storage.getBucket(COMMUNITY_PHOTO_BUCKET);
  if (bucketError) {
    if ((bucketError.status === 404 || bucketError.statusCode === "404" || bucketError.statusCode === "NoSuchBucket") && !linkedPhotos?.length) return;
    throw new Error("community_photo_cleanup_unavailable");
  }
  if (!bucket) throw new Error("community_photo_cleanup_unavailable");
  // Remove one page at a time without an offset because deletions shift the list.
  while (true) {
    const { data, error } = await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).list(userId, { limit: 100 });
    if (error) throw new Error("community_photo_cleanup_unavailable");
    if (!data?.length) break;
    const paths = data.map((item) => `${userId}/${item.name}`);
    if (paths.some((path) => !ownedCommunityPhotoPath(path, userId, path.slice(userId.length + 1, -4)))) throw new Error("community_photo_cleanup_invalid_path");
    const { error: removeError } = await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove(paths);
    if (removeError) throw new Error("community_photo_cleanup_failed");
  }
  const { error } = await supabase.from("forum_topic_photos").delete().eq("user_id", userId);
  if (error && !missingCommunityPhotoTable(error)) throw new Error("community_photo_cleanup_failed");
}
