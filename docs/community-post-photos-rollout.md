# Optional community post photos

Photos are optional. Existing text-only posts have no photo metadata and return
`photoUrl: null`; no destination art or placeholder photo is attached to them.

## Release order

1. Apply `supabase/migrations/20260928150000_community_post_photos.sql` to the
   intended Supabase environment through the normal reviewed migration process.
   This additive migration creates `forum_topic_photos`, ownership and pending
   review validation, and the private `community-post-photos` bucket. It restricts
   that bucket to service routes, permits only JPEG, and caps objects at 300,000
   bytes. It does not modify or backfill existing posts.
2. Deploy the server changes together, including the public and moderator photo
   endpoints, creation route, serializers, admin listing, admin photo preview and
   account/topic deletion cleanup. The existing Supabase service-role server
   configuration is sufficient; no new secret or external image service is used.
3. In a test environment, create one text-only post and one post with a selected
   photo. The text-only post retains current text moderation. The photo post must
   remain in the existing pending moderation queue until reviewed. Review the
   actual image in the web admin topic detail, then publish it. Confirm the feed
   and detail show that image and that hiding or deleting the topic denies the
   same photo URL immediately on the next request. Confirm an authenticated
   blocked viewer receives no photo. Confirm account deletion removes its stored
   photos before completing.
4. Release the mobile client with optional photo selection and authenticated
   image fetching. Selected-photo posts use the new `/api/country-community/photo-posts`
   endpoint; text-only posts keep `/api/country-community/questions`. An older
   server returns 404 for the new route, so the client retains its draft instead
   of silently creating a text-only post. Older mobile versions ignore `photoUrl`.

No deployment or remote migration is performed by the source-code change.
If server code reaches an environment before the migration, text-only reads and
writes still work. Photo uploads return an explicit unavailable error; the client
must retain the draft instead of claiming success. Rolling the mobile UI back is
safe; retain the additive table/bucket and cleanup-capable server so previously
uploaded photos remain subject to moderation and deletion.

## API contract

- `POST /api/country-community/photo-posts` uses the existing authenticated question
  JSON fields plus `photo`, a JPEG data URL. Its decoded limit is
  **300,000 bytes**, excluding the data URL prefix. Omit it (or send `null`) for a
  text-only post on `/api/country-community/questions`. Clients must use the new
  endpoint when a photo is selected to avoid older servers silently discarding
  an unknown photo field. Both routes share the same create handler. The entire
  request stream is capped at 430,000 bytes, including
  when `Content-Length` is absent. External image URLs, SVG and invalid JPEGs are
  rejected. The server decodes, rotates, limits dimensions and re-encodes the JPEG
  to strip metadata before storage.
- A photo adds a pending human review requirement to a previously visible text
  moderation result. Existing flagged text remains pending. The creation response
  uses the existing `moderation.action` value to communicate this.
- Feed and question detail expose only `photoUrl: null` or the canonical relative
  `/api/country-community/questions/<topic UUID>/photo` path. They never expose
  storage paths, signed object URLs or arbitrary remote image URLs.
- Fetch that URL with the same optional bearer authentication as the feed; render
  a temporary blob URL and revoke it when it is no longer used. The endpoint
  checks the canonical published topic, owner and viewer block state on each
  request, then returns `image/jpeg`, `Cache-Control: private, no-store` and
  `Vary: Authorization`. Anonymous viewing follows the existing public feed rule.
- Admin topic list entries expose the protected
  `/api/admin/forum/topics/<topic UUID>/photo` path. This endpoint revalidates the
  current moderator/admin role and can show pending photos for review. It uses
  existing admin cookie or bearer authentication.
- Canonical reply access, answer counts and paywall checks are unchanged.

## Local verification

Run `node --test tests/community/photos.mjs`,
`node tests/community/photos-db.mjs`, `node tests/community/safety-db.mjs`,
`npm run test:app`, and the server TypeScript check. The photo tests cover real
JPEG decoding, exact byte limits, metadata removal, optional text-only behavior,
authorship, moderation, blocked/unpublished content, failed-upload cleanup,
account cleanup, and database/storage access restrictions.
