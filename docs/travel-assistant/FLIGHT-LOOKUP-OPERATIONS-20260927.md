# Flight lookup activation — 27 September 2026

## Current state

The protocol-2 integration and retention controls are committed and pushed as `7cbe50dc671fb48c1bfc00e3f44c1c3c86fc52b1`. **The quota and retention migrations are installed in the application's live Supabase project; the updated Vercel deployment is READY and has been promoted; iOS 1.4.0 (52) is uploaded to TestFlight.** The owner selected a free private technical trial; RapidAPI Basic was activated at $0/month. No paid subscription was created or approved for commercial activation. Manual Cockpit entry remains available without a PNR.

The main Vercel project's production settings now select RapidAPI, `FLIGHT_LOOKUP_MODE=trial`, a monthly cap of **50 application requests**, `FLIGHT_LOOKUP_ENABLED=true`, and **one explicitly authorized application account** in the tester allowlist. Its identity was matched through the application account before configuration; the email and UUID are intentionally omitted here. The provider credential was transferred in memory to sensitive server storage, with no local secret file or value in logs, and temporary credential memory was cleared. Commercial mode remains inactive. These settings are included in the promoted deployment; a successful owner-authenticated live flight search has not yet been verified.

Vercel deployment `dpl_F76LYQV8dM5p3u1EGavDWXxgVHgV` reached **READY**, passed **five staged safety checks**, and was successfully promoted through the CLI. At **17:09 UTC / 20:09 Europe/Istanbul**, Vercel inspection resolved `www.letsgo2travel.com.tr` to that exact READY deployment and **all five direct public safety checks passed**. The earlier disabled deployment snapshot was not the promoted release.

The official Codemagic API triggered build `6ab94c8c5bc3b1a807726718` for the exact commit above. It finished successfully from **2026-09-27 17:04:19.194 UTC** to **17:07:59.479 UTC** (about 3 minutes 40 seconds), using the real public configuration in CI. App Store Connect confirms **1.4.0 (52)**, uploaded **27 September at 20:08 Europe/Istanbul**, with **Ready to Submit** status. The build details show the internal group **LetsGo2Travel İç Test**, with **3 testers**; Turkish test notes were saved for build 52. This build has **not been submitted to App Review**; upload and group assignment do not establish installation or testing on a device.

The server adapter now supports **Direct and RapidAPI** through their fixed HTTPS hosts. Choose the channel matching the subscription and key. An API.Market adapter is not implemented. Contracts: [Direct OpenAPI](https://doc.aerodatabox.com/docs/openapi-direct-v1.json), [RapidAPI OpenAPI](https://doc.aerodatabox.com/docs/openapi-rapidapi-v1.json). Coverage is not guaranteed for every flight or date.

## Free technical trial (private access, no commercial activation)

- AeroDataBox Direct signup does not itself include free query credits. The owner chose the RapidAPI Basic trial route and signed into its separate account. The Basic subscription was confirmed in the provider UI.
- RapidAPI's Basic plan page showed $0/month, 400 API units/month and 1,600 requests/month, both hard limits, on 27 September 2026. The single-day flight endpoint uses 2 units per normal request. The page separately lists a bandwidth overage charge above 10 GB; request hard limits must not be described as a blanket zero-charge guarantee. Verify the final checkout before subscribing.
- Use only the provider playground, a private local test, or the explicitly allowlisted authenticated trial, with a small bounded set of intentional requests and no automatic retries. The screenshot's PC2254 / 2026-09-27 query was used for the initial provider check. A flight whose scheduled departure is in the past may be returned successfully by the provider but rejected by the application's future-flight filter; report those outcomes separately. A past schedule alone does not prove that the flight has actually departed.
- Test returned JSON with the application's actual `flightLookupInput` and `normalizeFlightMatches` functions in memory. Do not save provider response bodies, create Cockpit trips, schedule reminders or start Live Activities during this trial. Display AeroDataBox attribution and its link with any flight data shown.
- Set `FLIGHT_LOOKUP_MODE=trial` and explicitly allowlist 1–20 authenticated tester UUIDs with `FLIGHT_LOOKUP_TRIAL_USER_IDS`. Unauthorized users cannot query. Trial results have `maySave:false` and no signed save receipt; the save endpoint rejects trial mode. This remains private technical evaluation, not a general production launch.
- RapidAPI uses `https://aerodatabox.p.rapidapi.com` with `X-RapidAPI-Key` and the fixed `X-RapidAPI-Host`. Direct uses `https://api.aerodatabox.com` with `X-Api-Key`. Set `AERODATABOX_API_CHANNEL` correctly; credentials are not interchangeable.
- Free/trial terms do not permit general commercial use; standard data retention is 7 days. This trial must remain restricted to its explicitly authorized test account rather than opening lookup to the general user population. Sources: https://rapidapi.com/aedbx-aedbx/api/aerodatabox/pricing , https://aerodatabox.com/pricing/ and https://aerodatabox.com/terms .

### Trial outcome

The screenshot query returned HTTP 200, but its scheduled departure was already in the past and the application's future-flight filter excluded it. The next-day query returned HTTP 204; this is not proof that the flight will not operate or that all future schedules are unavailable. An airport request failed in the browser playground; a private local request to the same provider returned future-flight candidates. A subsequent exact number/date request for one candidate returned HTTP 200 with one match accepted by the existing normalizer. That initial check tested only the provider response and normalization: no independent ticket comparison, production auth/quota, mobile UI, trip saving, notifications or Live Activities. Its credential was handled in memory and raw provider responses were not saved to files. Server credential configuration, local UI testing and live database installation were completed separately afterward, as recorded below; the credential was not added to mobile code.

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
2. Apply reviewed `supabase/migrations/20260927090000_flight_lookup_quota.sql`, then `supabase/migrations/20260927110000_flight_lookup_retention.sql`, to the correct application's database. **Completed for Supabase project `mwlucroyjvtoxillvzga`: both migrations and their exact source statements are recorded in migration history.** Retention assumes the existing Cockpit base/flight/arrival migrations. App deployment does not apply SQL migrations; do not rerun these installed migrations as if they were pending.
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

Local verification: the retention migration's **9/9 PGlite tests passed**, including access isolation, guarded fields, expiry, personal-data preservation, receipt replay, completion and stale-heartbeat recovery. Its test file passed lint. Local fixture tests and builds remain separate from live installation evidence.

Live database verification on `mwlucroyjvtoxillvzga`: **five checks passed**—quota execution is service-only; the provider table has RLS and no `anon`/`authenticated` SELECT access; both migration-history entries are present with exact source statements; retention readiness is true; and the initial purge succeeded with **zero rows removed**. This confirms installation and an initial cleanup invocation, not a scheduled Vercel cron run or an end-to-end authenticated provider lookup through the production release.

Public production verification at **17:09 UTC / 20:09 Europe/Istanbul** passed **5/5**: `/api/health` returned HTTP 200 with all checks true and database OK; unauthenticated protocol-2 lookup GET returned HTTP 200 with `available:false`; legacy GET returned HTTP 200 with `available:false`; trial save POST returned HTTP 503 `unavailable`; unauthenticated cleanup returned HTTP 401. These direct checks used no authentication bypass and made no provider requests. Vercel inspection confirmed the public domain points to `dpl_F76LYQV8dM5p3u1EGavDWXxgVHgV`, READY.

Delivery is verified through Vercel readiness, staged and public safety checks, successful promotion, the finished Codemagic build and the uploaded TestFlight package. A real owner-authenticated provider-to-production-to-device test and a scheduled cleanup run remain unverified. Commercial saving is still disabled by trial mode; no App Review submission was made.

Relevant suites: `tests/flight-lookup.mjs`, `tests/flight-lookup-db.mjs`, `tests/flight-retention-db.mjs`, `tests/flight-managed-mobile.mjs` and `tests/cockpit-flight-ui.mjs`. Full release and native-device results are recorded separately when completed.
