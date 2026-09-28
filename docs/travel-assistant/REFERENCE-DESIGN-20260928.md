# User reference design — 28 September 2026

Implemented from the user's `ChatGPT Görseli 28 Eyl 2026 17_34_03.png` reference. This is a functioning responsive interface, not a flattened screenshot. The iPhone clock, battery, signal and home indicator belong to iOS and are not fabricated by the web UI.

## Delivered

- Santorini photo hero, airplane wordmark, real notification action and profile shortcut, destination search, five city chips, five illustrated action cards, coastal personal/trip banner, four destination cards and community entry.
- Five translated root tabs: Keşfet / Planlar / Topluluk / Araçlar / Profil. Existing route, exploration, cockpit and tool deep links remain supported. Planner drafts and scroll positions survive navigation.
- Home search results for Paris, Bali, Tokyo, New York and Rome. Other typed searches use the actual catalog and show an explicit empty state when no prepared route matches.
- Card hearts persist owner-scoped route records and reflect the actual saved state. An unrelated edited plan is not removed by a card toggle. New destinations have correct bundled artwork in search and saved screens.
- Shared white/blue/yellow theme across secondary screens, forms, cards, sheets, navigation and wordmark. Native status bar uses light content over Home and dark content over white secondary headers.
- The personal banner still opens the precise current trip; late responses from a previous account cannot appear after an account change. Flight provider retention and free-trial restrictions are unchanged.

The reference defines composition, palette and visual language. Photos are recreated from the reference, vectors are recreated in code, and responsive text/touch-target sizing differs where necessary. This is not a claim of pixel-identical source artwork. Decorative community portraits are illustrations, not actual member profiles. Red hearts and unread badges represent real state rather than the mockup's example state.

## Assets and generation

Built-in `image_gen` was used; no external CLI image-generation fallback. Sources remain in the Codex generated-images folder. The production copies are local WebP files under `mobile/src/assets/home-reference/`:

| Asset | File | Bytes |
|---|---|---:|
| Santorini hero | `santorini-hero.webp` | 267842 |
| Coastal traveler banner | `coastal-banner.webp` | 194498 |
| Cappadocia | `cappadocia.webp` | 116376 |
| Bali | `bali.webp` | 138606 |
| Decorative community portraits | `community-travelers.webp` | 19216 |

Final prompt set:

1. **Santorini hero (reference edit):** Extract/recreate only the top hero's Santorini sunset photograph. Large blue church dome left, white cliffside architecture along bottom, dark volcanic island near center, sunset and golden reflection right, bright azure sky. Landscape 4:3 realistic travel photography. Match composition and color. Remove all UI, logos, words, status bar, search controls and borders.
2. **Coastal banner (reference edit):** Recreate only the middle coastal traveler photograph, wide 3:1. A traveler with straw hat and navy backpack sits on a rock at center-right, facing an azure Mediterranean bay with rugged green mountains and a coastal town. Hazy blue sea/sky left provides room for live text. Preserve reference composition and colors; no words, buttons, handwriting, underline, border or logo.
3. **Cappadocia:** Photorealistic vertical 4:5 travel card, pointed fairy chimneys in foreground and hot-air balloons in a golden/pink/blue sunrise sky. Detailed natural warm landscape, no text, UI, watermark or border.
4. **Bali:** Photorealistic vertical 4:5 travel card of Kelingking Beach, Nusa Penida: green limestone headland curving to turquoise sea and white sand, high viewpoint, vibrant natural sunlight. No people, text, UI, watermark or border.
5. **Community portraits:** Three equal square panels in one 3:1 strip: adult woman with sunglasses/light jacket, adult woman with brown shoulder-length hair/white top, adult woman with dark hair/denim top. Warm candid outdoor travel photography; centered faces with room for circular CSS crops. Decorative fictional travelers, not real members. No words, border, logo or UI.

Hero has high fetch priority; lower images load lazily. Raster files are compressed once into bundled WebP assets; no third-party image requests are needed at runtime. Rome uses existing artwork.

## Verification

- Full release requirement suite passed, including flight quotas/retention, owner isolation, reminders, account lifecycle and community authorization.
- Final focused navigation/planning suite: 30/30; application suite: 139/139.
- Mobile TypeScript, ESLint and production mobile build passed.
- Browser checks at 360px and 425px phone sizes: no horizontal overflow, no error overlay; all Home controls at least 44px high. Turkish and English labels checked. Desktop centered layout inspected at 1280px.
- Browser flow: Bali chip → matching search result → Bali plan; Paris chip → matching three-day Paris plan result; Kapadokya heart → Planlar → correct saved route; temporary test save removed afterward.
- Tools, Profile, language toggle and return navigation inspected. Search persists on return; real notifications remain connected.
- Native iOS appearance still requires a physical-device check. No new signed TestFlight binary was produced in this design pass.

Preview: `http://127.0.0.1:5173/?audit=5#home`.
Proof images are in `C:/Users/emirk/Documents/Codex/2026-09-26/i/outputs/reference-design-20260928/`.
