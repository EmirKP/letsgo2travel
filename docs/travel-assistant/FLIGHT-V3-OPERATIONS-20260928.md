# Flight progress, refresh and native delivery — 28 September 2026

This is prepared source and local verification, not a production activation record. No paid subscription, provider request, database migration, environment change or cron schedule was made as part of this implementation. Production previously shipped build 53 with owner-only trial lookup; that remains the last verified live operating mode.

## Protocol and source accuracy

- `X-Flight-Lookup-Version: 3` enables upcoming and provider-reported in-progress flights. Version 2 keeps its original future scheduled-flight behavior.
- Scheduled `departureAt`/`arrivalAt` and airport-local dates/times remain unchanged. Optional `progress` supplies provider status, phase, revised time/kind, `sourceUpdatedAt`, `freshUntil` and freshness. `fetchedAt` is retrieval time, not proof of a newly observed status.
- Freshness is at most 15 minutes from a valid provider update timestamp. Missing, invalid or future source timestamps remain unknown. Clock passage never implies takeoff or landing.
- Revised UTC/local pairs undergo the same time-zone validation as scheduled pairs. Revised values beyond 48 hours of the schedule are omitted. Actual/estimated kinds follow the provider phase; a future value cannot be called actual. `revisedTime` may represent gate or runway movement, so it is not a precise wheels-up/down guarantee. See the [official AeroDataBox schema](https://doc.aerodatabox.com/docs/openapi-rapidapi-v1.json).
- Fresh in-progress selections may be saved only under commercial rights. Stale/unknown in-progress results remain read-only; trial always returns `maySave:false`, no receipt and no native entitlement. A fresh delayed departure can be selected before its revised departure. Selection receipts expire at the earliest of retrieval + 10 minutes, applicable departure/arrival boundary and source freshness boundary.
- Terminal matches are used for refreshing existing trips, not new selections. A fresh terminal result removes the private provider sidecar. PNR, personal checklist, user-owned query and trip status remain intact. Missing/ambiguous/stale terminal provider results do not erase an otherwise valid overlay.

## Commercial foreground refresh

`POST /api/cockpit/flight-trips/refresh`, owner bearer session, v3 header, body `{tripId, requestId: UUID}`.

Success returns `{protocol:3,trip,flight,expiresAt,cached,refreshAfterSeconds:300}`. Terminal success returns `flight:null`, `expiresAt:null`, `terminal:true`; the immediate response can also include `terminalStatus` and `sourceUpdatedAt`. A retry may return terminal without those transient details. Errors preserve the existing overlay until its original expiry; clients must never use a manual/direct-write fallback.

The server reserves the request before quota/provider work, blocks concurrent reservations and applies a five-minute per-trip cost guard even if a caller changes UUID. Request metadata expires after five days. A failed attempt also reserves the cost-guard window. Refresh uses the stored query/airport pair; ambiguous same-route legs require a new explicit lookup. Only a newly retrieved copy can receive a new five-day lifetime. Compare-and-set checks reject late responses and backwards provider source time. Retrying the original v3 save after a refresh returns the current overlay without restoring old contents or changing personal notes.

## Prepared background path — not scheduled or activated

`GET /api/cron/refresh-flight-data` requires header-only `Bearer CRON_SECRET`, commercial mode, explicit `FLIGHT_LOOKUP_NATIVE_DISPLAY_ALLOWED=true`, explicit `FLIGHT_LOOKUP_BACKGROUND_ENABLED=true`, APNs credentials and the new queue migration. Query-string secrets are rejected. `vercel.json` intentionally has no schedule for this endpoint.

The worker claims at most 10 trips, processes two at a time with a 45-second soft deadline, and uses the same provider quota/refresh core. It updates only registered existing activity tokens; it never pushes a start. Token claims recheck installation owner, epoch, monotonic login generation and active state. Trip and delivery leases expire; stale claim settlements cannot overwrite a newer claim. Private metadata stores generation/leases, not provider flight fields.

Fresh changed provider data can update a card. Significant fresh status/time changes may produce a generic alert with no flight details. Unknown/stale source does not produce a current-status update. Terminal, finished or expired sidecars produce an immediate end with an empty provider payload; the worker never reads expired provider details back into APNs. Monotonic generation timestamps ensure delayed updates sort before newer terminal ends. Delivery is at-least-once: a crash after APNs accepts but before settlement may repeat the same generation; collapse identity and timestamp reduce duplicate effects. An already in-flight APNs request cannot be recalled after logout, so native logout/expiry cleanup remains necessary.

Background execution, APNs delivery on a real device, scheduler frequency and provider behavior have **not** been verified live. Prepared code is not evidence of working background tracking. Existing legacy scheduled-reminder cron is separate.

## Activation checklist and budget

1. Confirm and pay for the selected commercial plan before enabling public lookup. The official [pricing page](https://aerodatabox.com/pricing/) currently lists RapidAPI entry pricing from **USD 8/month**, API.Market Pro **USD 7.50/month / 5,000 units**, and Direct Starter **USD 19/month / 40,000 units**, before tax. The present integration supports RapidAPI and Direct, not API.Market. Confirm the exact RapidAPI checkout quota, tier cost and overage setting; a plan label alone is insufficient. A consumer flight-display app is an end-use example, not B2B dataset sublicensing.
2. Preserve the five-day private-cache limit and early deletion after purpose completion. Standard terms allow up to seven days unless the plan grants otherwise; an OS display/cache remains a copy, so it must expire too. Free/trial contents require attribution and do not establish commercial rights. Native display is treated as part of the consumer app, not a separate data feed; this is an interpretation of [the provider's terms, sections 5.3–5.5](https://aerodatabox.com/terms/), not an explicit ActivityKit clause.
3. Apply `20260928120000_flight_lookup_refresh.sql` after the already installed quota/retention migrations; verify private RLS, service-only RPCs and fresh purge heartbeat. It does not modify migration history. v3 commercial readiness deliberately stays false until this migration is ready.
4. Before background activation, verify/apply the existing Live Activity session/token schema and `20260928130000_flight_native_refresh_queue.sql`. The queue migration depends on those token tables. Verify owner/session fences, leases and generation replay behavior on staging.
5. Verify the purge cron actually runs and monitor its heartbeat/retained rows. Five days leaves margin under the seven-day standard; expired provider data must not become an archive. The provider sidecar and mobile/OS overlays must not be copied into durable personal trip fields.
6. Size quota deliberately. The last live trial allowance was **50 requests/month**, while the DB also limits **10 requests/user/day and 20 globally/minute**. Those limits remain unchanged and are inadequate for continuous five-minute tracking: a single four-hour flight could need about 48 refresh calls before other lookups. Calls and billed API units are different. Background and foreground share quota; reserve a safety margin and disable marketplace overages if hard budgeting is intended. No quota increase is included here.
7. After plan/payment and budget review, test one owned managed trip on staging: upcoming → provider-departed → changed estimate → terminal; outage, quota denial, logout/account switch, expired cache and token rejection must also fail safely. Native entitlement requires v3 progress; old receipts cannot gain it.
8. Enable the background flag and a suitable recurring schedule only after those checks and explicit operational approval. Confirm the Vercel plan supports the chosen frequency and measure actual cost/latency. Rollback disables background/native flags and ends existing provider cards; trial mode remains allowlisted preview only.

## Local evidence

Behavior tests cover normalizer/protocol/receipts, refresh API, private retention and CAS/idempotency SQL, native queue/session/lease/generation SQL, bounded background worker/cron authorization, and mobile overlay/no-fallback behavior. Synthetic fixtures never call AeroDataBox, APNs or production Supabase.

New test entries: `tests/flight-refresh-api.mjs`, `tests/flight-refresh-db.mjs`, `tests/flight-refresh-cron.mjs`, `tests/flight-refresh-cron-db.mjs`. Existing flight lookup, retention API and managed mobile tests are also extended. Run these with the release suite before deployment; this document does not substitute for delivery evidence.
