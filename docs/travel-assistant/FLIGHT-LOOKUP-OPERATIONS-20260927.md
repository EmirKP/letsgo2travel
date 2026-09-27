# Flight lookup activation — 27 September 2026

## Current state

The updated protocol-2 integration and retention controls are implemented locally. **This integration has not been deployed and the retention migration has not been applied to the real database.** Production lookup remains disabled. The owner selected a free private technical trial; RapidAPI Basic was activated at $0/month. No paid subscription was created or approved for commercial activation. Manual Cockpit entry remains available without a PNR.

The main Vercel project's production settings have been prepared as sensitive variables: RapidAPI key/channel, trial mode, monthly cap of 50 application requests and `FLIGHT_LOOKUP_ENABLED=false`. No tester UUID or commercial receipt secret has been set. The key was transferred in memory through CLI stdin, with no local secret file or value in logs. These prepared settings require a new deployment and the remaining activation prerequisites; they do not enable the current production release.

The server adapter now supports **Direct and RapidAPI** through their fixed HTTPS hosts. Choose the channel matching the subscription and key. An API.Market adapter is not implemented. Contracts: [Direct OpenAPI](https://doc.aerodatabox.com/docs/openapi-direct-v1.json), [RapidAPI OpenAPI](https://doc.aerodatabox.com/docs/openapi-rapidapi-v1.json). Coverage is not guaranteed for every flight or date.

## Free technical trial (not production activation)

- AeroDataBox Direct signup does not itself include free query credits. The owner chose the RapidAPI Basic trial route and signed into its separate account. The Basic subscription was confirmed in the provider UI.
- RapidAPI's Basic plan page showed $0/month, 400 API units/month and 1,600 requests/month, both hard limits, on 27 September 2026. The single-day flight endpoint uses 2 units per normal request. The page separately lists a bandwidth overage charge above 10 GB; request hard limits must not be described as a blanket zero-charge guarantee. Verify the final checkout before subscribing.
- Use only the provider playground or a private local test, with a small bounded set of intentional requests and no automatic retries. Start with the screenshot's PC2254 / 2026-09-27 query. A flight whose scheduled departure is in the past may be returned successfully by the provider but rejected by the application's future-flight filter; report those outcomes separately. A past schedule alone does not prove that the flight has actually departed.
- Test returned JSON with the application's actual `flightLookupInput` and `normalizeFlightMatches` functions in memory. Do not save provider response bodies, create Cockpit trips, schedule reminders or start Live Activities during this trial. Display AeroDataBox attribution and its link with any flight data shown.
- Set `FLIGHT_LOOKUP_MODE=trial` and explicitly allowlist 1–20 authenticated tester UUIDs with `FLIGHT_LOOKUP_TRIAL_USER_IDS`. Unauthorized users cannot query. Trial results have `maySave:false` and no signed save receipt; the save endpoint rejects trial mode. This remains private technical evaluation, not a general production launch.
- RapidAPI uses `https://aerodatabox.p.rapidapi.com` with `X-RapidAPI-Key` and the fixed `X-RapidAPI-Host`. Direct uses `https://api.aerodatabox.com` with `X-Api-Key`. Set `AERODATABOX_API_CHANNEL` correctly; credentials are not interchangeable.
- Free/trial terms do not permit general commercial use; standard data retention is 7 days. This trial must not enable lookup for production users. Sources: https://rapidapi.com/aedbx-aedbx/api/aerodatabox/pricing , https://aerodatabox.com/pricing/ and https://aerodatabox.com/terms .

### Trial outcome

The screenshot query returned HTTP 200, but its scheduled departure was already in the past and the application's future-flight filter excluded it. The next-day query returned HTTP 204; this is not proof that the flight will not operate or that all future schedules are unavailable. An airport request failed in the browser playground; a private local request to the same provider returned future-flight candidates. A subsequent exact number/date request for one candidate returned HTTP 200 with one match accepted by the existing normalizer. Only the provider response and normalization were tested: no independent ticket comparison, production auth/quota, mobile UI, trip saving, notifications or Live Activities were verified. The test key was handled in memory and cleared, not installed in Vercel or mobile code. Raw provider responses were not saved to files.

## Implemented retention and saving contract

- Commercial mode issues an HMAC-signed selection bound to the authenticated owner, original query, normalized flight, unique receipt and original expiry. The save window is at most ten minutes and ends by scheduled departure. Provider contents expire five days after retrieval; saving or retrying cannot renew that time.
- POST `/api/cockpit/flight-trips` verifies the receipt and accepts only personal end date, PNR, checklist and language alongside it. Service-only `create_flight_lookup_trip` creates the base record and provider sidecar atomically. A valid same-owner retry returns the existing trip without replacing personal edits. Altered, foreign, expired or purged receipts cannot recreate contents.
- Managed `trips` rows retain personal fields, the original user-entered flight number/date and server-controlled source/receipt/expiry metadata. Provider country, code, city, airline, airport codes and departure/arrival timestamps stay NULL in this durable base. Client writes cannot remove provenance, change the original query, extend expiry or fill these fields.
- Provider contents live in `trip_flight_provider_data`, with RLS and no direct authenticated table access. The owner-only `read_cockpit_flight_details` RPC returns up to 100 requested IDs and only unexpired upcoming/active flights. The sidecar is bounded to 16 KiB per trip and 100 live entries per owner.
- Completion or cancellation deletes the sidecar immediately. Expiry purge preserves the personal trip, PNR, checklist and collaboration data. Receipt metadata stays as a replay sentinel. User selection or editing does not turn provider data into independent user data.
- Managed provider trips are excluded from native reminders and Live Activities; the durable base has no provider departure timestamp. Do not copy provider titles, airports, dates or signed receipts into device storage, notification payloads or exports. The receipt itself contains provider data and must remain transient.

`vercel.json` schedules `/api/cron/purge-flight-data` daily at **03:45 UTC**. Its bearer-authenticated handler calls `purge_expired_trip_flight_data`; deletion and the retention-health heartbeat update are atomic. `flight_lookup_retention_ready` becomes false after **26 hours** without a successful purge. Commercial availability, lookup and saving then fail closed; the SQL create RPC checks it too. Expired reads remain masked. The migration initializes the heartbeat once, so initial readiness does not prove a scheduled run worked.

Before commercial activation, verify a real successful purge and establish cron-failure monitoring with an assigned operator. Five-day expiry leaves a two-day buffer against the standard seven-day maximum, but closing new lookups does not physically remove old rows during a prolonged cron outage. Repair and rerun cleanup promptly within that buffer. Keep cleanup and monitoring active when lookup is disabled or the subscription ends, until sidecars are gone.

## Configuration and activation order

1. Keep `FLIGHT_LOOKUP_ENABLED=false` during preparation. Commercial mode requires the owner's explicit paid-plan approval, including commercial and retention terms. A mode flag does not prove billing or permission; do not relabel the free Basic subscription as commercial.
2. Apply reviewed `supabase/migrations/20260927090000_flight_lookup_quota.sql`, then `supabase/migrations/20260927110000_flight_lookup_retention.sql`, to the correct application's database. Retention assumes the existing Cockpit base/flight/arrival migrations. Repository inspection found SQL files and operation notes but no configured automatic migration runner; app deployment does not apply SQL migrations.
3. Configure only server-side settings below. Never expose secrets through `VITE_`, `NEXT_PUBLIC_`, chat, source or logs. Retain the existing Supabase admin configuration without copying its values into documentation.
4. Deploy the main API host used by `config.apiBaseUrl`, including cleanup scheduling. Do not use the public stateless TestFlight assistant host for authenticated lookup. Verify a real authenticated purge and monitoring before commercial activation.
5. All GET/POST lookup and save requests require the user bearer token and `X-Flight-Lookup-Version: 2`. GET returns `protocol:2`, availability and, when available, `mode`/`maySave`. It probes installation without consuming quota; it cannot verify provider credentials or plan rights. Legacy GET stays unavailable; an enabled POST without protocol 2 returns `426 update-required`.
6. Enable only the approved mode, then test with the authorized user: a known future flight against its ticket, multiple legs, past schedule, empty result, quota and provider outage. Trial must remain unsaveable. Commercial saving, safe retry, owner-only reload, expiry and preservation of personal notes require separate verification. Do not describe deployment, DB installation or native-device testing as complete until performed.

| Server setting | Configuration |
| --- | --- |
| `AERODATABOX_API_CHANNEL` | `rapidapi` or `direct`, matching the account |
| `AERODATABOX_API_KEY` | Corresponding credential from the secret manager |
| `FLIGHT_LOOKUP_MODE` | `trial`, or explicitly approved `commercial` |
| `FLIGHT_LOOKUP_TRIAL_USER_IDS` | Comma-separated 1–20 user UUIDs for private trial |
| `FLIGHT_LOOKUP_MONTHLY_LIMIT` | Integer 1–10000; small for trial, below plan allowance for commercial use |
| `FLIGHT_LOOKUP_RECEIPT_SECRET` | Strong random server secret, at least 32 characters, required in commercial mode |
| `CRON_SECRET` | Secret authenticating scheduled cleanup |
| `FLIGHT_LOOKUP_ENABLED` | Set `true` only after the chosen mode's prerequisites are satisfied |

## Data and billing boundaries

- Provider request: fixed HTTPS host, flight number/date only. No PNR, bearer token, name or user ID is sent to AeroDataBox.
- Auth is verified server-side; atomic service-only SQL quota allows 10 requests/user/UTC day, 20 globally/minute and the configured global calendar-month cap. Failed provider requests count because they may still be billable. No automatic retries. This cap counts requests rather than provider units; account for other consumers and provider billing-cycle differences.
- GET/POST responses are private/no-store. Raw responses are not cached. Only normalized commercial selections are retained in the protected, expiring sidecar; trial results and signed receipts must remain transient.
- Return only complete exact-number/exact-departure-date scheduled legs. Missing airports/time zones/times, inconsistent timestamps, cancelled or departed flights are discarded. No substitution of estimates, predicted times, gates or terminal data.
- User must choose the matching leg and a trip end date. PNR is optional. There is no background provider polling, live gate tracking or flight-status claim in this release.
- Without credentials, migration, cap or a healthy connection, the UI retains manual entry. Provider diagnostics and secrets are never returned to the client.

## Verification

The retention migration's **9/9 PGlite tests passed**, including access isolation, guarded fields, expiry, personal-data preservation, receipt replay, completion and stale-heartbeat recovery. Its test file passed lint. This is local PostgreSQL-compatible verification, not evidence of a real migration or scheduled run.

Relevant suites: `tests/flight-lookup.mjs`, `tests/flight-lookup-db.mjs`, `tests/flight-retention-db.mjs`, `tests/flight-managed-mobile.mjs` and `tests/cockpit-flight-ui.mjs`. Full release and native-device results are recorded separately when completed.
