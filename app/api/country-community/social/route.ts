import { createHash } from "node:crypto";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { communityViewer } from "@/lib/community/viewer";
import { COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
import { prepareCommunityPhoto } from "@/lib/community/photos";
import { moderateUserText } from "@/lib/community/moderation";
import { validCommunityProfileKey } from "@/lib/community/profiles";
import { SOCIAL_PHOTO_BUCKET } from "@/lib/community/social-contract";
import { hydrateSocialData, parseSocialAction, parseSocialCreate, readSocialJson, socialError, socialRecord, socialStorageReady, socialUuid } from "@/lib/community/social";

export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => Response.json({ data }, { status, headers: COMMUNITY_PRIVATE_HEADERS });

export async function GET(request: Request) {
  try {
    const viewer = await communityViewer(request); if (!viewer.ok) return viewer.response;
    const db = getSupabaseAdmin(); if (!db) return socialError();
    const params = new URL(request.url).searchParams;
    const input: Record<string, unknown> = { offset: 0 };
    const offset = params.get("offset");
    if (offset !== null && (!/^\d{1,5}$/.test(offset) || Number(offset) > 10000)) return socialError({ code: "22023" });
    input.offset = Number(offset || 0);
    const section = params.get("section");
    if (section !== null && !["collections", "notifications"].includes(section)) return socialError({ code: "22023" });
    if (section) input.section = section;
    const feed = params.get("feed");
    if (feed !== null && !["discover", "following"].includes(feed)) return socialError({ code: "22023" });
    if (feed) input.feed = feed;
    for (const key of ["postId", "collectionId"]) { const value = params.get(key); if (value !== null) { if (!socialUuid(value)) return socialError({ code: "22023" }); input[key] = value; } }
    const author = params.get("authorRef");
    if (author !== null) { if (!validCommunityProfileKey(author)) return socialError({ code: "22023" }); input.authorRef = author; }
    if (!viewer.userId && (section || feed === "following" || input.collectionId)) return Response.json({ error: "Oturum gerekli." }, { status: 401, headers: COMMUNITY_PRIVATE_HEADERS });
    const { data, error } = await db.rpc("read_travel_social", { p_viewer: viewer.userId, p_input: input });
    if (error) return socialError(error);
    if (data === null) return socialError({ code: "P0002" });
    return reply(await hydrateSocialData(db, data));
  } catch { return socialError(); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request); if (!auth.ok) return auth.response;
    const { supabase: db, user } = auth;
    const input = await readSocialJson(request); if (!input) return socialError({ code: "22023" });
    const action = input.action;
    if (action === "create") {
      const parsed = parseSocialCreate(input); if (!parsed) return socialError({ code: "22023" });
      const photo = await prepareCommunityPhoto(input.photo); if (!photo) return Response.json({ error: "Fotoğraf 300 KB altında geçerli bir JPEG olmalı." }, { status: 400, headers: COMMUNITY_PRIVATE_HEADERS });
      const photoHash = createHash("sha256").update(photo).digest("hex");
      const values = { ...parsed, photoHash };
      // Retried requests return the same post. Never overwrite existing media.
      const existing = await db.from("travel_social_posts").select("id").eq("id", parsed.requestId).maybeSingle();
      if (existing.error) return socialError(existing.error);
      if (existing.data) {
        const { data, error } = await db.rpc("write_travel_social", { p_viewer: user.id, p_action: "create", p_input: values });
        return error ? socialError(error) : reply(await hydrateSocialData(db, data));
      }
      if (!await socialStorageReady(db)) return socialError();
      const storagePath = `${user.id}/${parsed.requestId}.jpg`;
      const upload = await db.storage.from(SOCIAL_PHOTO_BUCKET).upload(storagePath, photo, { contentType: "image/jpeg", upsert: false });
      if (upload.error) return socialError(upload.error.statusCode === "409" || upload.error.statusCode === "Duplicate" ? { code: "23505" } : undefined);
      const { data, error } = await db.rpc("write_travel_social", { p_viewer: user.id, p_action: "create", p_input: values });
      if (error) {
        // Verify a concurrent request did not commit the same object before cleanup.
        const committed = await db.from("travel_social_posts").select("id,user_id").eq("id", parsed.requestId).maybeSingle();
        if (!committed.error && (!committed.data || committed.data.user_id !== user.id)) await db.storage.from(SOCIAL_PHOTO_BUCKET).remove([storagePath]);
        return socialError(error);
      }
      return reply(await hydrateSocialData(db, data), 201);
    }
    const parsed = parseSocialAction(input); if (!parsed || typeof action !== "string") return socialError({ code: "22023" });
    if (action === "comment") parsed.status = moderateUserText(String(parsed.body)).action === "visible" ? "published" : "pending";
    const { data, error } = await db.rpc("write_travel_social", { p_viewer: user.id, p_action: action, p_input: parsed });
    if (error) return socialError(error);
    return reply(await hydrateSocialData(db, socialRecord(data)));
  } catch { return socialError(); }
}
