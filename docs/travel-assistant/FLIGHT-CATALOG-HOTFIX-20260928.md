# Flight lookup follow-up — 28 September 2026

Build 52 feedback showed `incomplete` for PC438 on 4 November and `past-departure` for PC651 on 27 September. The PC651 screenshot was taken after the displayed scheduled departure; its separate Flightradar image showed an airborne flight. The current feature fills future scheduled journeys and does not provide live flight tracking. Rejecting that past scheduled departure is intentional, but the old instruction to check the ticket date was misleading.

The bundled airport catalog contains Chisinau's former KIV code but lacks RMO. The normalizer requires a known airport, so even a complete, otherwise valid SAW–RMO fixture is rejected as incomplete. Replacing only RMO with the legacy KIV code makes that fixture pass. This reproduces a catalog defect, not the exact provider response for the user's selected date.

Sources checked:

- [TAROM's code-change notice](https://www.tarom.ro/stiri/informare-pasageri-aeroport-chisinau-schimbare-cod-iata-din-kiv-in-rmo/) confirms KIV changed to RMO on 18 January 2024.
- [Chisinau Airport's specifications](https://airport.md/files/Specifications-Travel-Retail-EN.pdf) identify RMO / LUKK.
- [Flightradar24 PC438 history](https://www.flightradar24.com/data/flights/pc438) lists SAW–RMO. This does not confirm the schedule or completeness of the provider's 4 November response.

The focused correction adds the current airport code and its Europe/Chisinau time zone while preserving historical KIV lookup. The catalog generators must retain the correction. No unknown-airport fallback, estimated timestamps, relaxed date validation, new live tracking or trial-saving permission is introduced. Mobile messages explain the future-flight scope and preview-only trial without implying that a real flight does not exist.

## Verification and delivery

The focused flight suite passed 24/24 tests, including current/legacy code lookup, summer/winter normalization and rejection of inconsistent offsets. The mobile UI suite passed 17/17, including Turkish/English messages, manual entry and a result whose scheduled departure passes while displayed. Mobile TypeScript and affected-file lint passed. The full release requirement runner and Next.js production build passed.

The generated airport catalog changed by exactly one added RMO entry; all 7,072 existing rows were preserved. The time-zone output changed only by adding KIV and RMO mappings. The normalizer's validation rules are unchanged.

Browser access was restored, but RapidAPI's key-management control returned HTTP 403 and did not reveal the existing credential. No provider request was made during this follow-up; the exact PC438 / 4 November response remains unverified. The already-installed server credential was not changed. Deployment and new TestFlight delivery are pending at this source checkpoint. No paid plan was requested or enabled.
