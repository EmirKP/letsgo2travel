# Flight lookup follow-up — 28 September 2026

Build 52 feedback showed `incomplete` for PC438 on 4 November and `past-departure` for PC651 on 27 September. The PC651 screenshot was taken after the displayed scheduled departure; its separate Flightradar image showed an airborne flight. The current feature fills future scheduled journeys and does not provide live flight tracking. Rejecting that past scheduled departure is intentional, but the old instruction to check the ticket date was misleading.

The previous bundled airport catalog contained Chisinau's former KIV code but lacked RMO. The normalizer requires a known airport, so even a complete, otherwise valid SAW–RMO fixture was rejected as incomplete. Replacing only RMO with the legacy KIV code made that fixture pass. This reproduced a catalog defect, not the exact provider response for the user's selected date. The published correction now includes RMO.

Sources checked:

- [TAROM's code-change notice](https://www.tarom.ro/stiri/informare-pasageri-aeroport-chisinau-schimbare-cod-iata-din-kiv-in-rmo/) confirms KIV changed to RMO on 18 January 2024.
- [Chisinau Airport's specifications](https://airport.md/files/Specifications-Travel-Retail-EN.pdf) identify RMO / LUKK.
- [Flightradar24 PC438 history](https://www.flightradar24.com/data/flights/pc438) lists SAW–RMO. This does not confirm the schedule or completeness of the provider's 4 November response.

The focused correction adds the current airport code and its Europe/Chisinau time zone while preserving historical KIV lookup. The catalog generators must retain the correction. No unknown-airport fallback, estimated timestamps, relaxed date validation, new live tracking or trial-saving permission is introduced. Mobile messages explain the future-flight scope and preview-only trial without implying that a real flight does not exist.

## Verification and delivery

The focused flight suite passed 24/24 tests, including current/legacy code lookup, summer/winter normalization and rejection of inconsistent offsets. The mobile UI suite passed 17/17, including Turkish/English messages, manual entry and a result whose scheduled departure passes while displayed. Mobile TypeScript and affected-file lint passed. The full release requirement runner and Next.js production build passed.

The generated airport catalog changed by exactly one added RMO entry; all 7,072 existing rows were preserved. The time-zone output changed only by adding KIV and RMO mappings. The normalizer's validation rules are unchanged.

Browser access was restored, but RapidAPI's key-management control returned HTTP 403 and did not reveal the existing credential. No provider request was made during this follow-up; the exact PC438 / 4 November response remains unverified. The already-installed server credential was not changed. No paid plan was requested or enabled.

## Delivery

- Source commit: `4e349f1637f9a413169893f642a0607b7af75651`, pushed to `feature/travel-companion-polish-20260927`.
- Vercel production deployment: `dpl_67e5cRjL9Cpa7LiEMDwMg6dfhxDu`, READY and promoted to `www.letsgo2travel.com.tr`. All 2,506 source-archive files matched their Git blob hashes; no local credentials or QA build output were copied.
- At 22:29 UTC on 27 September / 01:29 Europe/Istanbul on 28 September, six direct public checks passed: health 200 with all checks/database OK; unauthenticated v2 and legacy lookup unavailable; trial save 503; unauthorized purge 401; `/api/airports?q=RMO` returned one RMO / Moldova / MD / Europe/Chisinau result. The public domain resolved to the exact deployment above.
- Codemagic build `6ab9978c58c1ee664f5cad38` used the exact source commit and `letsgo2travel-ios-testflight` workflow. It finished successfully from `2026-09-27T22:24:21.972Z` to `2026-09-27T22:28:42.345Z`. Release checks, real mobile configuration, native compilation and signing passed. The build-number log confirms **1.4.0 (53)**; publishing confirms **UPLOAD SUCCEEDED with no errors**.
- App Store Connect was verified after login: Build Uploads lists **53 / Complete**, created **28 September at 01:28 Europe/Istanbul**. The iOS build list shows **1.4.0 (53) / Ready to Submit**, uploaded **01:29 Europe/Istanbul**, with **LetsGo2Travel İç Test** and **3 invitations**. Build details confirm the same group as **Internal**, with **3 testers**. Apple build ID: `89d842ed-a9d2-4f05-9969-e0b46fded4e6`.
- Turkish **What to Test** notes were saved for the RMO correction, retrying the 4 November query, future-flight scope, trial preview restrictions and manual entry. The Save control was disabled after saving. Screenshot evidence: `testflight-53-ready.png` in the task's outputs. No App Review submission was made.
- Installation on a tester's device and a real authenticated provider-to-device flight query remain unverified. Apple processing and internal-group assignment do not establish either result.

Build 52's original parser was separately exercised against the new normalized RMO fixture in both summer and winter. It can display the corrected API response. **Build 53 is now processed and assigned to the internal TestFlight group**; testers need to install it to receive the new explanatory copy and bundled RMO/KIV time-zone mappings used by manual/native views. Installation has not been confirmed. The compatibility check is local, not a real provider/device test.
