import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { moderateUserText } from "@/lib/community/moderation";
import {
  createForumTopicSlug,
  forumCategoryFromCommunityCategory,
  forumCountrySlugFromCode,
  forumStatusFromModeration,
} from "@/lib/community/forum-sync";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { COMMUNITY_PHOTO_BUCKET, communityPhotoStorageReady, MAX_COMMUNITY_PHOTO_BYTES, MAX_COMMUNITY_POST_REQUEST_BYTES, prepareCommunityPhoto } from "@/lib/community/photos";
import { COMMUNITY_PRIVATE_HEADERS, COMMUNITY_UUID } from "@/lib/community/safety";

export const runtime = "nodejs";

const submissionError = (code?: string) => NextResponse.json({ error: code === "23505"
  ? "Bu gönderim farklı bilgilerle kullanılmış. Paylaşımını yeniden düzenleyip dene."
  : code === "P0002" ? "Bu paylaşım kaldırılmış. Aynı gönderim tekrar oluşturulamaz."
    : "Paylaşım kaydedilemedi. Taslağını değiştirmeden tekrar deneyebilirsin." }, {
  status: code === "23505" ? 409 : code === "P0002" ? 410 : 503, headers: COMMUNITY_PRIVATE_HEADERS,
});

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX_COMMUNITY_POST_REQUEST_BYTES) {
      return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    // Bound the actual stream too; Content-Length can be absent or misleading.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Gönderi gerekli." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytesRead += part.value.byteLength;
      if (bytesRead > MAX_COMMUNITY_POST_REQUEST_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
      }
      chunks.push(part.value);
    }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return NextResponse.json({ error: "Geçersiz gönderi." }, { status: 400 }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "Geçersiz gönderi." }, { status: 400 });
    const countryCode = String(payload.countryCode || "").trim().toUpperCase();
    const title = String(payload.title || "").replace(/\s+/g, " ").trim();
    const body = String(payload.body || "").trim();
    const category = String(payload.category || "general").trim().toLowerCase();
    if (payload.requestId !== undefined && (typeof payload.requestId !== "string" || !COMMUNITY_UUID.test(payload.requestId))) {
      return NextResponse.json({ error: "Geçersiz gönderim kimliği." }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(countryCode) || title.length < 5 || title.length > 160 || body.length < 10 || body.length > 4000) {
      return NextResponse.json({ error: "Ülke, başlık veya açıklama geçersiz." }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{1,60}$/.test(category)) {
      return NextResponse.json({ error: "Geçersiz kategori." }, { status: 400 });
    }

    const moderation = moderateUserText(title + " " + body);
    const hasPhoto = payload.photo !== undefined && payload.photo !== null;
    const photo = hasPhoto ? await prepareCommunityPhoto(payload.photo) : null;
    if (hasPhoto && !photo) return NextResponse.json({ error: "Fotoğraf en fazla 300 KB boyutunda geçerli bir JPEG olmalı." }, { status: 400 });
    // Text moderation does not inspect images. Photos enter the existing human
    // moderation queue before any public feed or photo endpoint can expose them.
    if (photo && moderation.action === "visible") moderation.action = "pending_review";
    const authorName = String(
      user.user_metadata?.full_name || user.user_metadata?.username || user.email?.split("@")[0] || "Gezgin",
    ).replace(/\s+/g, " ").trim().slice(0, 80);

    // New clients bind retries to one authenticated intent. Reserve the topic ID
    // before uploading, then commit the topic and photo metadata in one transaction.
    if (payload.requestId !== undefined) {
      const requestId = payload.requestId.toLowerCase();
      const photoHash = photo ? createHash("sha256").update(photo).digest("hex") : null;
      const payloadHash = createHash("sha256").update(JSON.stringify([countryCode, title, body, category, photoHash])).digest("hex");
      const { data: reserved, error: reserveError } = await supabase.rpc("reserve_community_question", {
        p_user: user.id, p_request: requestId, p_payload_hash: payloadHash, p_photo_hash: photoHash,
      });
      if (reserveError) return submissionError(reserveError.code);
      if (!reserved || !COMMUNITY_UUID.test(String(reserved.id)) || typeof reserved.committed !== "boolean") return submissionError();
      const id = String(reserved.id);
      const successful = (status: unknown) => typeof status === "string" && ["published", "pending", "hidden", "rejected", "closed"].includes(status)
        ? NextResponse.json({ data: { id, status }, moderation: { ...moderation,
          action: status === "published" ? "visible" : "pending_review" } }, { headers: COMMUNITY_PRIVATE_HEADERS }) : submissionError();
      if (reserved.committed) return successful(reserved.status);
      if (photo) {
        if (!await communityPhotoStorageReady(supabase)) return submissionError();
        const storage = supabase.storage.from(COMMUNITY_PHOTO_BUCKET);
        const path = `${user.id}/${id}.jpg`;
        const { error: uploadError } = await storage.upload(path, photo, { contentType: "image/jpeg", upsert: false });
        if (uploadError) {
          const previous = await storage.download(path);
          if (previous.error || !previous.data || previous.data.size > MAX_COMMUNITY_PHOTO_BYTES) return submissionError();
          const previousHash = createHash("sha256").update(Buffer.from(await previous.data.arrayBuffer())).digest("hex");
          if (previousHash !== photoHash) return submissionError("23505");
        }
      }
      const { data: committed, error: commitError } = await supabase.rpc("complete_community_question", {
        p_user: user.id, p_request: requestId, p_payload_hash: payloadHash,
        p_title: title, p_body: body, p_category: forumCategoryFromCommunityCategory(category),
        p_country_slug: forumCountrySlugFromCode(countryCode), p_author_name: authorName,
        p_status: forumStatusFromModeration(moderation.action), p_slug: createForumTopicSlug(title, id),
      });
      // A failed response may follow a successful commit. Never remove an object
      // here: the next retry verifies it; account erasure also removes orphans.
      if (commitError) return submissionError(commitError.code);
      if (!committed || committed.id !== id || typeof committed.status !== "string") return submissionError();
      return successful(committed.status);
    }

    // Installed clients without requestId keep their original creation contract.
    const id = randomUUID();
    const photoPath = photo ? `${user.id}/${id}.jpg` : null;
    if (photo && photoPath) {
      if (!await communityPhotoStorageReady(supabase)) return NextResponse.json({ error: "Fotoğraf yükleme şu anda kullanılamıyor." }, { status: 503 });
      const { error: uploadError } = await supabase.storage.from(COMMUNITY_PHOTO_BUCKET)
        .upload(photoPath, photo, { contentType: "image/jpeg", upsert: false });
      if (uploadError) return NextResponse.json({ error: "Fotoğraf yüklenemedi." }, { status: 503 });
    }
    const { error } = await supabase.from("forum_topics").insert({
      id,
      slug: createForumTopicSlug(title, id),
      title,
      content: body,
      category: forumCategoryFromCommunityCategory(category),
      country_slug: forumCountrySlugFromCode(countryCode),
      author_id: user.id,
      author_name: authorName,
      status: forumStatusFromModeration(moderation.action),
    });

    if (error) {
      if (photoPath) await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove([photoPath]);
      console.error("community_post_save_failed", { code: error.code || "unknown" });
      return NextResponse.json({ error: "Soru kaydedilemedi" }, { status: 500 });
    }

    if (photoPath) {
      const { error: photoError } = await supabase.from("forum_topic_photos").insert({ topic_id: id, user_id: user.id, storage_path: photoPath });
      if (photoError) {
        // The topic remains pending throughout this operation. On failure no
        // partial text/photo post becomes public; private orphan cleanup is also
        // covered by account deletion if either compensating action fails.
        await supabase.from("forum_topics").delete().eq("id", id).eq("author_id", user.id);
        await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove([photoPath]);
        return NextResponse.json({ error: "Fotoğraflı gönderi kaydedilemedi." }, { status: 503 });
      }
    }

    return NextResponse.json({ data: { id }, moderation }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
