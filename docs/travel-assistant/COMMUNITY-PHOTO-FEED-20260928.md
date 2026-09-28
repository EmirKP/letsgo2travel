# Community photo feed — 28 September 2026

The community feed now places a large destination cover between the author row and the question caption. Existing records are text-only, so these bundled covers are visibly labelled as illustrative country/travel artwork. This change does not add user photo uploads or invent profile photos, reactions, or comments.

The comment count opens up to two real server-returned answers directly beneath the post. Server locks and block filtering remain in effect. Requests are on demand; closing, switching, feed reloads, account/token changes, blocking, and unmount invalidate pending previews. Errors offer retry or sign-in without dropping an invalid bearer. The full conversation and answer form remain available through the existing detail sheet.

The compose action is now in the document flow above the feed and cannot obscure posts.

Validation: 31 community UI/discovery/preferences checks passed, including five new preview/race/authentication tests. ESLint, mobile TypeScript, and production build passed. The live local preview showed two actual comments and one locked comment on the Germany question. At 375px, no horizontal overflow; relevant controls remain at least 44px high.

## New cover asset

- File: `mobile/src/assets/community-reference/germany-cover.webp`
- Size: 1000 × 750 pixels; 124,410 bytes.
- Created with the built-in `image_gen` tool; no reference image.
- Technical conversion: resized to 1000px width and encoded as WebP quality 84 using Sharp.
- This is generated editorial artwork, not a user-uploaded photograph.

### Exact generation prompt

Use case: photorealistic-natural
Asset type: illustrative Germany destination cover for a travel community feed, no interface elements
Primary request: a beautiful calm editorial travel photograph of the Brandenburg Gate in Berlin in warm late-afternoon light.
Scene: the real Brandenburg Gate and its open paved foreground, blue sky with a few soft high clouds, warm pale sandstone. Only a few small distant tourists for natural scale.
Style: contemporary travel photography, realistic architecture and stone texture, balanced natural colors, crisp but not oversharpened, authentic daylight rather than fantasy HDR.
Composition: landscape approximately 4:3, eye-level view from the east side, entire monument and quadriga comfortably inside frame, balanced central composition, sufficient sky above and a modest amount of plaza foreground.
Lighting: warm sunlight from one side, soft long shadows, peaceful inviting mood.
Constraints: no text, labels, logos, watermarks, typography, graphics, borders or collage; no large foreground people, no artificial neon colors, no distorted columns or duplicate architecture.
