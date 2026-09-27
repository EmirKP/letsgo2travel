# Flight lookup activation — 27 September 2026

## Current state

The user confirmed they have no flight-data account. Lookup is implemented but disabled by default. No paid subscription was created. The new Cockpit supports manual entry and no longer requires a PNR. No claim of live coverage has been made.

The integration targets **AeroDataBox Direct**, not a RapidAPI subscription. Official contract: https://doc.aerodatabox.com/docs/openapi-direct-v1.json and https://aerodatabox.com/api-spec . Before purchase, the owner should verify plan coverage for future dates, commercial use and retention of flight data in user-created itineraries. This code does not promise coverage for every flight or date.

## Enable only after configuration and a real smoke test

1. Owner selects a provider plan and obtains its server API key. Do not paste secrets into chat or public VITE/NEXT_PUBLIC settings.
2. Apply `supabase/migrations/20260927090000_flight_lookup_quota.sql` to the authenticated application's database.
3. Set server-only `AERODATABOX_API_KEY`, `FLIGHT_LOOKUP_ENABLED=true` and `FLIGHT_LOOKUP_MONTHLY_LIMIT` (integer 1–10000). Choose the monthly cap below the purchased allowance, accounting for other consumers and billing-cycle differences. Application calendar-month counters do not replace the provider's hard spending cap.
4. Deploy the main API host used by `config.apiBaseUrl`. Do not route authenticated lookup through the public, stateless TestFlight assistant host.
5. GET `/api/cockpit/flight-lookup` must return `{available:true}`. It probes quota installation without consuming a use; it cannot verify provider credentials or paid plan coverage.
6. With an ordinary signed-in test user, POST a known future flight number and its departure-airport local date. Compare both airports, local dates/times and UTC with the ticket. Test multiple legs, no results, quota failure and provider outage. Only then describe automatic lookup as live.

## Data and billing boundaries

- Provider request: fixed HTTPS host, flight number/date only. No PNR, bearer token, name or user ID is sent to AeroDataBox.
- Auth is verified server-side; atomic service-only SQL quota allows 10 requests/user/UTC day, 20 globally/minute and the configured global calendar-month cap. Failed provider requests count because they may still be billable. No automatic retries.
- GET/POST responses are private/no-store. Provider results are not cached in storage. Only the leg explicitly selected and saved by the user becomes a normal Cockpit trip.
- Return only complete exact-number/exact-departure-date scheduled legs. Missing airports/time zones/times, inconsistent timestamps, cancelled or departed flights are discarded. No substitution of estimates, predicted times, gates or terminal data.
- User must choose the matching leg and a trip end date. PNR and airline edits are optional. There is no background provider polling, live gate tracking or flight-status claim in this release.
- Without credentials, migration, cap or a healthy connection, the UI retains manual entry. Provider diagnostics and secrets are never returned to the client.

## Verification

`node --test tests/flight-lookup.mjs tests/flight-lookup-db.mjs` checks normalization, API failure boundaries and real PostgreSQL-compatible quota semantics using PGlite. Fixture success is not a live-provider verification. Native Live Activity compilation is verified separately in Codemagic.
