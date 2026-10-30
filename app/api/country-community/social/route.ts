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
// Expired-upload cleanup waits twice this enforced invocation lifetime.
export const maxDuration = 60;
const reply = (data: unknown, status = 200) => Response.json({ data }, { status, headers: COMMUNITY_PRIVATE_HEADERS });
const searchText = (value: unknown): string => typeof value === "string" ? value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i") : "";

function matchesPostSearch(value: unknown, query: string) {
  const post = socialRecord(value);
  const author = socialRecord(post.author);
  const place = socialRecord(post.place);
  return searchText([post.caption, author.username, place.name, place.countryCode].filter(item => typeof item === "string").join(" ")).includes(query);
}

export async function GET(request: Request) {
  try {
    const viewer = await communityViewer(request); if (!viewer.ok) return viewer.response;
    const db = getSupabaseAdmin(); if (!db) return socialError();
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") || "").trim();
    if (query.length > 120 || /[\x00-\x1f\x7f]/.test(query)) return socialError({ code: "22023" });
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
    for (const key of ["postId", "collectionId", "commentId"]) { const value = params.get(key); if (value !== null) { if (!socialUuid(value)) return socialError({ code: "22023" }); input[key] = value; } }
    if (input.commentId && !input.postId) return socialError({ code: "22023" });
    if (input.collectionId) delete input.feed;
    const author = params.get("authorRef");
    if (author !== null) { if (!validCommunityProfileKey(author)) return socialError({ code: "22023" }); input.authorRef = author; }
    if (!viewer.userId && (section || feed === "following" || input.collectionId)) return Response.json({ error: "Oturum gerekli." }, { status: 401, headers: COMMUNITY_PRIVATE_HEADERS });
    if (query && (section || input.postId || input.commentId)) return socialError({ code: "22023" });
    if (query) {
      // Reuse the privacy-filtered RPC in bounded pages. The returned offset is
      // the original feed cursor, so matches never skip unseen public posts.
      const items: unknown[] = [];
      let nextOffset: number | null = Number(input.offset);
      for (let scanned = 0; scanned < 2 && nextOffset !== null; scanned++) {
        const pageOffset: number = nextOffset;
        const { data, error } = await db.rpc("read_travel_social", { p_viewer: viewer.userId, p_input: { ...input, offset: pageOffset } });
        if (error) return socialError(error);
        if (data === null) return socialError({ code: "P0002" });
        const page = socialRecord(await hydrateSocialData(db, data));
        if (!Array.isArray(page.items)) return socialError();
        items.push(...page.items.filter(item => matchesPostSearch(item, searchText(query))));
        nextOffset = typeof page.nextOffset === "number" && Number.isInteger(page.nextOffset) && page.nextOffset > pageOffset && page.nextOffset <= 10000 ? page.nextOffset : null;
      }
      return reply({ items, nextOffset, searchPartial: nextOffset !== null });
    }
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
      // Tombstones fence late commits before an expired object can be removed.
      // The DB waits120s (beyond maxDuration) and never returns committed media.
      const cleanup = await db.rpc("prepare_travel_social_upload_cleanup", { p_viewer: user.id });
      if (cleanup.error) return socialError(cleanup.error);
      const expiredIds = socialRecord(cleanup.data).requestIds;
      if (!Array.isArray(expiredIds) || expiredIds.length > 10 || !expiredIds.every(socialUuid)) return socialError();
      if (expiredIds.length) {
        const removed = await db.storage.from(SOCIAL_PHOTO_BUCKET).remove(expiredIds.map(id => `${user.id}/${id}.jpg`));
        if (removed.error) return socialError();
        const confirmed = await db.rpc("finish_travel_social_upload_cleanup", { p_viewer: user.id, p_request_ids: expiredIds });
        if (confirmed.error || socialRecord(confirmed.data).success !== true) return socialError(confirmed.error);
      }
      // Reserve before accepting any bytes. Failed writes also consume quota,
      // while the same immutable request remains resumable after a lost commit.
      const admission = await db.rpc("reserve_travel_social_upload", { p_viewer: user.id, p_input: values });
      if (admission.error) return socialError(admission.error);
      if (socialRecord(admission.data).admitted !== true) return socialError();
      const storagePath = `${user.id}/${parsed.requestId}.jpg`;
      const upload = await db.storage.from(SOCIAL_PHOTO_BUCKET).upload(storagePath, photo, { contentType: "image/jpeg", upsert: false });
      if (upload.error) {
        if (!["409", "Duplicate"].includes(String(upload.error.statusCode))) return socialError();
        // A previous request may have uploaded successfully before its DB call timed out.
        // Resume only when these exact immutable bytes belong to this request and owner.
        const previous = await db.storage.from(SOCIAL_PHOTO_BUCKET).download(storagePath);
        if (previous.error || !previous.data) return socialError();
        const previousHash = createHash("sha256").update(Buffer.from(await previous.data.arrayBuffer())).digest("hex");
        if (previousHash !== photoHash) return socialError({ code: "23505" });
      }
      const { data, error } = await db.rpc("write_travel_social", { p_viewer: user.id, p_action: "create", p_input: values });
      // Do not delete after an uncertain commit: a concurrent retry may be about to
      // reference this object. Retry verifies the hash; account erasure removes orphans.
      if (error) return socialError(error);
      return reply(await hydrateSocialData(db, data), 201);
    }
    const parsed = parseSocialAction(input); if (!parsed || typeof action !== "string") return socialError({ code: "22023" });
    if (action === "comment" || action === "comment-edit") parsed.status = moderateUserText(String(parsed.body)).action === "visible" ? "published" : "pending";
    const { data, error } = await db.rpc("write_travel_social", { p_viewer: user.id, p_action: action, p_input: parsed });
    if (error) return socialError(error);
    return reply(await hydrateSocialData(db, socialRecord(data)));
  } catch { return socialError(); }
}
