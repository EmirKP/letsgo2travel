# Screenshot consistency fixes — 29 September 2026

Implemented after the user finished sending screenshots and explicitly said to begin. Based on the already delivered 1.4.0 (55); these changes have not been published or uploaded to TestFlight.

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

No Vercel deployment, Codemagic build, TestFlight upload or App Review submission was performed for this batch. Existing TestFlight 55 still contains the preceding design. The event backend fallback requires a server deployment; its failure/recovery behaviour is covered by mocked-provider regression tests, but the revised backend was not run with live provider keys locally. Real-device safe-area/status-bar appearance and iOS keyboard behaviour still require the next native test package.

Provider contract references: [PredictHQ event sorting](https://docs.predicthq.com/api/events/search-events), [Ticketmaster Discovery sorting and status](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/).
