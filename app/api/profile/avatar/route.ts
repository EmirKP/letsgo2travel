import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { decodeAvatar, ownedAvatarPath } from "@/lib/profile-photo";

export const runtime = "nodejs";
const BUCKET = "profile-avatars";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function account(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Photo service is not configured");
  const { data: { user }, error } = await db.auth.getUser(token);
  return !error && user ? { db, user } : null;
}

export async function GET(request: Request) {
  try {
    const auth = await account(request);
    if (!auth) return reply({ error: "Sign in required" }, 401);
    const path = auth.user.user_metadata?.l2t_avatar_path;
    if (!ownedAvatarPath(path, auth.user.id)) return reply({ url: null });
    const { data, error } = await auth.db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) return reply({ error: "Photo unavailable" }, 503);
    return reply({ url: data.signedUrl });
  } catch { return reply({ error: "Photo unavailable" }, 503); }
}

export async function POST(request: Request) {
  try {
    const auth = await account(request);
    if (!auth) return reply({ error: "Sign in required" }, 401);
    // Bound the stream too: Content-Length may be absent or untrusted.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Photo required" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 401_000) { await reader.cancel(); return reply({ error: "Photo too large" }, 413); }
      chunks.push(part.value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ error: "Invalid photo" }, 400); }
    const bytes = decodeAvatar((input as { photo?: unknown })?.photo);
    if (!bytes) return reply({ error: "A small JPEG photo is required" }, 400);
    const oldPath = auth.user.user_metadata?.l2t_avatar_path;
    const { data: bucket } = await auth.db.storage.getBucket(BUCKET);
    // Never put a private profile photo in an unexpectedly public bucket.
    if (bucket?.public) return reply({ error: "Photo storage privacy configuration required" }, 503);
    if (!bucket) {
      const { error } = await auth.db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 300_000, allowedMimeTypes: ["image/jpeg"] });
      // A simultaneous upload may have created it; verify before proceeding.
      if (error && !(await auth.db.storage.getBucket(BUCKET)).data) return reply({ error: "Photo storage unavailable" }, 503);
    }
    const path = `${auth.user.id}/${randomUUID()}.jpg`;
    const { error: uploadError } = await auth.db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (uploadError) return reply({ error: "Photo upload failed" }, 503);
    const { error: saveError } = await auth.db.auth.admin.updateUserById(auth.user.id, { user_metadata: { l2t_avatar_path: path } });
    if (saveError) {
      await auth.db.storage.from(BUCKET).remove([path]);
      return reply({ error: "Photo could not be saved" }, 503);
    }
    if (ownedAvatarPath(oldPath, auth.user.id)) await auth.db.storage.from(BUCKET).remove([oldPath]);
    return reply({ saved: true });
  } catch { return reply({ error: "Photo upload failed" }, 503); }
}
