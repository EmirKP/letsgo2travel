# Cockpit and data-integrity fixes — 1 October 2026

Implementation and verification record for the follow-up app audit. The database migration below was applied successfully through Supabase SQL. **A new production deployment and TestFlight build are not confirmed by this document.** Release identifiers must be added after publication succeeds.

## Changes

- Cockpit trips can be edited without losing their checklist. Failed checklist writes retain the typed draft; failed edits retain the form. Concurrent edits produce a conflict and allow loading the latest trip while preserving fields the user changed. Provider-managed flight identity/timetable remains protected. Trip deletion uses an explicit confirmation, and trip history is paginated instead of silently stopping at 100 records. Ticket-text suggestions now recognize Albanian labels and months.
- A chosen saved route and a customized city-budget estimate can be attached to the same owned trip as independent snapshots. The user selects the trip and dates; alternative destinations are not silently imported. Source, estimate model, people/days/currency and dated exchange-rate information are retained. Later changes to trip dates show a mismatch warning instead of rewriting the saved itinerary. Stale attachments return a conflict and reload the parent trip before retry.
- Saved-route identity and synchronization distinguish a new explicit save from a stale pending deletion. Home favourites and saved plans use the same identity rules. Web saved-plan details have a working owned-record destination; mobile route and budget actions hand off to Cockpit.
- Account mutations no longer overwrite rotated tokens or revive a logged-out/replaced session. Profile and Explore remote reads are authoritative, so another device's deletion is not restored from stale local cache; genuine pending guest imports remain queued. Kosovo aliases deduplicate consistently. Verification load failures have an error/retry state and localized country labels.
- Community country/search filters run before pagination; more posts and replies beyond the first 100 can be loaded. Locked previews remain restricted. Admin reports expose the actual reported content, distinguish unavailable context from missing content, and retain existing authorization for hide-and-resolve actions.
- Travel-tool failure handling and caching were tightened; unsupported offline translation is reported honestly. This does not establish that an unavailable external map or flight provider is operational.

## Database operation

Applied: `supabase/migrations/20261001090000_cockpit_journey_details.sql` — Supabase SQL returned **Success**.

The additive `trip_journey_details` table stores personal route/budget snapshots with owner RLS, bounded payload sizes and trip/account deletion cascades. It does not archive provider flight data. Updates use a revision check; a database trigger locks the owned parent trip and validates current dates and itinerary length when attaching a route. Budget-only updates preserve an existing route snapshot. Migration reapplication was tested without destroying records.

SHA-256 of the tested/applied script: `72355BD601E4291A0AA1B2AC9D2D554F14E6AF975ED7972B2F6BF3F2E8E7DC71`.

For an application rollback, retain this additive table and users' snapshots; dropping it would delete personal data.

## Verification

- Full `npm run test:release` passed. Root Next.js and mobile/public production builds, both lint checks, and both dependency audits passed; the audits reported zero vulnerabilities.
- Focused auth/profile/admin/community/navigation suites: **68/68** passed. Cockpit journey API/PGlite tests: **7/7**, including cross-owner denial, cascades, stale parent dates, route-duration bounds, conflict handling and migration reapplication. The release runner includes the new regression suites.
- Authenticated browser checks confirmed creating a QA trip, adding a checklist item, editing city/end date/PNR while keeping the checklist, and attaching a four-day Rome route plus a five-day, three-person EUR Belgrade budget to the same trip. Different destination/duration snapshots are retained as the user's explicit choices, not presented as a recalculated combined itinerary.
- Full page reload restored both attached snapshots, the edited trip and its checklist. Removing the source route left the Cockpit copy intact. The temporary saved route and QA trip were then deleted through the UI; an empty Cockpit was verified. These browser and automated checks do not establish physical iPhone behavior, native background delivery or uninterrupted third-party availability.

## Remaining limits and publication

- The external map-provider issue remains unresolved; the related unavailable/degraded states must not be described as a repaired live map service.
- Flight lookup remains subject to the existing free-trial/provider restrictions. This batch does not activate commercial flight-data rights, increase quota or prove continuous native flight tracking.
- Albanian app UI and ticket-text parsing are supported, but **Albanian offline translation is unavailable on iOS** in the current integration. It must not be offered as an installable iOS language pack.
- Production deployment/source: **pending release-owner confirmation**.
- Codemagic / TestFlight version and build: **pending successful publication and Apple processing**. No new build availability or physical-device test is claimed here.
