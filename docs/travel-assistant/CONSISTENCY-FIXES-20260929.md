# Screenshot consistency fixes — 29 September 2026

Implemented after the user finished sending screenshots and explicitly said to begin. Based on the previously delivered 1.4.0 (55). After the user's explicit request to send the update, this batch was published to production and delivered as TestFlight 1.4.0 (56).

## Changes

- One shared application header on all screens: original logo, notification and menu buttons, 76px content height plus native safe area. Uses the Home sky blue (`#0877b8`) consistently, with white native status text. Language selection is available in the menu as explicit Türkçe / English buttons. Nested screens keep Back. Notification badges and their accessible labels both respect the notification preference.
- Removed the separate Home and Community header controls. Community search stays available above its hero content. Preserved Home photography, shortcuts, yellow actions and flame. Restored responsive Home spacing for narrow and middle widths so the search does not overlap the heading.
- Community inspiration cards have equal image top positions and aspect ratios, with aligned country footers despite different title lengths. Real community posts and optional photos are unchanged.
- Profile uses a shorter photo cover, an in-flow identity row, compact account action and a smaller blue explorer card. Original blue/yellow/white colours, real account data and actual counts remain.
- Tools, including Money Centre, Around Me, Offline Map and Photo Guide, use blue icons on pale blue tiles. Emergency and other meaningful status colours remain.
- Money Centre now has a currency board, quick EUR/USD/GBP-to-TRY selection, dated reference comparison, green up/red down/neutral arrows, and a clearer converter. Movement comes from the actual quote comparison; there are no invented buy/sell rates or live-market claims. Small rates use more decimal places so a real change remains visible. Daily-reference/source disclosures and stale/offline protections remain.
- Event country/city/date controls are all 52px high, with one column below 360px. The CountryPicker search has one focus ring and one continuous field background.
- Featured concerts now fall back from an unavailable/empty PredictHQ feed to genuine Ticketmaster concerts. Current production evidence showed ordinary Ticketmaster results working while PredictHQ failed and the old featured path never tried Ticketmaster. Added worldwide recovery, retry UI, honest coverage information and no-cache responses for provider outages. Official Ticketmaster `canceled` status is handled, and cancelled/postponed/rescheduled events are excluded from highlights. The heading is “Öne çıkan konserler”; no unsupported fame or impact score is inferred.
- Passport map and legend share the supplied reference palette: visa-free `#28B156`, arrival `#0170FC`, eVisa `#FECC13`, required `#F7403B`, unknown `#B8B5B4`, ocean `#004C83`. Identity-card entry adds distinct cyan `#21CCE1`; borders are white. No visa data or passport counts changed. The separate visited-country map retains its original palette.

## Verification

- Mobile ESLint and TypeScript/Vite production build passed.
- App regression suite: 139/139 passed.
- Navigation, community UI, featured events and Money Centre focused suites: 53/53 passed. New event/money tests are wired into release readiness.
- Browser checks at 320, 390, 430, 550 and 768px. Verified shared header, TR/EN menu switching, equal event fields, CountryPicker search, matching map/legend colours, zoom/reset, inspiration image/footer alignment, and compact profile. Home copy/search separation verified at 430 and 550px.
- Real reference quotes verified positive and inverse negative movement, amount conversion and currency swapping. No browser console errors observed.
- `git diff --check` passed. Unrelated `docs/claude-handoff` files were left untouched.

## Publication and remaining device validation

- Release source: `f0fafa65cebb9d1c41c597631e711054fd64e3ab` on `feature/travel-companion-polish-20260927`, including implementation commit `a300269`. GitHub's branch and the Codemagic build listing both confirmed this source.
- Full `npm run test:release` passed with exit 0: 320 Node test cases, app 139/139, alerts 39/39 and all remaining country, integrity, travel-readiness, account, community, support and privacy checks. The first run identified one stale assertion for the old language-toggle position; it now verifies the accessible shared-menu language controls while preserving persistence and cockpit language checks.
- Clean release archive: all 2,582 committed files matched their Git blob hashes. Local environment files and unrelated handoff documents were excluded. No database migration or flight-provider configuration was changed.
- Vercel deployment `dpl_HBxmcn2dJn9sKKTtcpLNUzRjwi1L` reached READY, was checked before promotion and then promoted to production. Inspection of `www.letsgo2travel.com.tr` resolved to this deployment.
- Protected and public health checks passed (all configured checks true, database OK). Public featured-concert query returned 6 genuine scheduled Ticketmaster concerts with `fallbackUsed: true`, `coverageStatus: live`. PredictHQ remained unavailable; the new alternative provider recovered the list. Community feed returned HTTP 200. No error-level runtime logs were returned for this deployment in the inspected 30-minute window.
- Codemagic build `6abadce4083ff0a9a53a37de`, workflow `letsgo2travel-ios-testflight`, completed all stages successfully, including release checks, native compilation, signing and publishing. Build listing confirmed source `f0fafa6` and IPA build 56.
- Apple processed **1.4.0 (56)**, uploaded 29 September 2026 at 00:37 Istanbul. Apple build ID: `841e46af-a333-4b45-ac05-d0b41ad08749`. Confirmed **LetsGo2Travel İç Test**, **Internal**, **3 testers** assigned. Turkish What to Test notes saved successfully.
- No App Review submission was made. Internal test availability does not establish installation or physical-device behavior; iPhone safe-area/status-bar appearance and keyboard interaction still need real-device testing with build 56.

Operational evidence is saved in the task's `outputs/ux-20260928` directory: `consistency-release-tests.log`, `consistency-vercel-deploy.log`, `consistency-public-checks.json`, `consistency-vercel-runtime.log` and `testflight-56-verification.txt`.

Provider contract references: [PredictHQ event sorting](https://docs.predicthq.com/api/events/search-events), [Ticketmaster Discovery sorting and status](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/).
