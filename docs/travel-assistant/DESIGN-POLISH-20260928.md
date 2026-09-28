# Mobile design continuation — 28 September 2026

The user's September 28 reference and original traveller logo remain the visual baseline. This pass extends the photographic blue, white and yellow design across the main app journeys. It does not replace the Home composition or alter the original logo asset.

## What changed

- **Plans:** photo banner with a clear new-route action, separate flight/trip management entry, four saved-item collections with actual counts and explicit empty states, and quieter preparation tools. Existing account/device storage, sync, deletion and undo behavior remain intact.
- **Tools:** one directory instead of competing top tabs; four primary tool cards, search, a visible emergency shortcut and labelled secondary helpers. Opening a tool focuses its working area. Section changes from a user action move focus to the destination heading, without resetting scroll on language/country changes or Activity reactivation.
- **Profile:** photo cover, white identity card, blue explorer card with real counters and three native disclosure groups for notifications, privacy and app preferences. All account, notification, safety and data-rights actions remain available.
- **Community:** photographic welcome, blue section controls and yellow question action; readable question cards with safety controls retained. Country labels use localized names while API/filter codes remain unchanged.
- **Route planning:** clear introduction, three essential starting fields and optional preferences showing the current traveller/budget selection. Ready routes use larger photo cards. Keyboard focus follows planner-section changes.
- **Discovery:** consistent photograph, search, cards and action controls; selected favourites retain a white background for contrast.

## Verification

- Application suite: 139/139; navigation, planning and tool suites: 36/36; account-deletion UI suite: 11/11.
- Mobile TypeScript, full ESLint and production mobile build passed.
- Phone browser checks at 360px and 390px: route/preferences, saved collections and empty-state action, tool search, translation/phrase navigation, profile disclosures and community. Turkish/English labels inspected. No horizontal overflow on the inspected screens.
- The selected provider, flight trial restrictions, native permissions and storage boundaries are unchanged. No new package or external image service was added.

Preview: `http://127.0.0.1:5173/?audit=6#home`.
Screenshots and build output: `C:/Users/emirk/Documents/Codex/2026-09-26/i/outputs/design-polish-20260928/`.

This is a local design/build verification. No Vercel deployment or new signed TestFlight binary was produced in this pass; native iOS presentation still needs device validation.
