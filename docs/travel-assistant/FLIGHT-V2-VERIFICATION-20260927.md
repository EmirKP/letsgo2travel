# Flight lookup v2 — verification status, 27 September 2026

## Scope and current boundary

RapidAPI/Direct adaptation, private trial access, signed commercial selections, expiry-separated storage and mobile UI are implemented in pushed commit `7cbe50dc671fb48c1bfc00e3f44c1c3c86fc52b1`. No paid subscription was purchased. **The live quota and retention migrations are installed, the updated Vercel deployment is READY and promoted, and iOS 1.4.0 (52) is uploaded to TestFlight.** General commercial use and commercial saving remain disabled. No App Review submission was made.

The application's Supabase project `mwlucroyjvtoxillvzga` was accessed through its management session. The authorized tester was resolved from the matching application account, and exactly one account is allowlisted. Account email, UUID and credential values are omitted from this record. The earlier Vercel CLI secret-retrieval limitation did not prevent the completed dashboard-based database setup.

The main Vercel project's production configuration now contains the RapidAPI credential/channel, `FLIGHT_LOOKUP_MODE=trial`, a monthly cap of **50 application requests**, `FLIGHT_LOOKUP_ENABLED=true`, and the single-account tester allowlist. The provider credential was transferred through memory to sensitive server storage; it was not written into mobile code, local secret files or logs. Temporary credential memory was cleared. These settings are included in the promoted deployment; they do not by themselves prove a successful owner-authenticated provider lookup.

Vercel deployment `dpl_F76LYQV8dM5p3u1EGavDWXxgVHgV` reached **READY**, passed **five staged safety checks**, and was successfully promoted through the CLI. The earlier disabled deployment snapshot was not promoted. At **17:09 UTC / 20:09 Europe/Istanbul**, Vercel inspection confirmed `www.letsgo2travel.com.tr` resolves to that exact READY deployment, and direct public safety checks passed **5/5**.

## Verification performed

- Root TypeScript, root ESLint, mobile ESLint and Next.js production compilation passed.
- The full release requirement runner passed after updating its old three-argument source assertion for Cockpit's explicit detail-read option. It still checks cancelled-trip recovery and managed-flight exclusion from native reminders.
- Provider/API tests exercise the real normalization, adapter, HMAC and handlers using isolated fixtures. PostgreSQL-compatible tests cover quota, RLS, receipt replay, expiry, personal-data preservation and cleanup heartbeat. They do not contact the provider or production database.
- The real mobile source compiled in the isolated whole-app QA bundle. The earlier local native release attempt correctly refused to build without the real public Supabase configuration; the subsequent native CI build succeeded with the real public configuration, as recorded below. The QA bundle itself is not a distributable or an iOS compilation result.
- Browser checks used actual Cockpit components and an explicitly labelled local fixture service: scheduled flight search, selection, end date and save; private trial preview with save disabled; manual mode clearing provider-derived airport/time fields; distinct past-scheduled-departure message; timed expiry removing flight details while retaining the personal trip and checklist. No browser error/warning was reported during these checks.
- The successful commercial-save browser scenario used synthetic data and a local mock save endpoint. Live service authentication, provider-to-production-to-device flow, scheduled cleanup and native-device behavior remain unverified. Actual SQL installation was subsequently verified separately below; commercial saving remains disabled in the configured trial.
- A final review caught provider details remaining in memory after marking a trip completed or cancelled. The state replacement and display guards now remove them immediately; targeted behavior tests and the browser completion scenario confirm that the personal checklist remains and old details do not reappear when reopening the trip.
- The final mobile pass also corrected the expiry timer to use the actual current clock and the saved arrival to use the verified provider airport time zone. The updated Cockpit UI and managed-data suites passed 20/20 tests; mobile TypeScript and affected-file lint passed.

## Live database checks

Both `20260927090000_flight_lookup_quota.sql` and `20260927110000_flight_lookup_retention.sql` were applied to `mwlucroyjvtoxillvzga`. Their exact source statements are recorded in both migration-history entries. Five live checks passed:

1. Quota execution is restricted to the service role.
2. The private provider table has RLS enabled and no `anon` or `authenticated` SELECT privilege.
3. Both migration-history entries are present.
4. The retention-readiness check returns true.
5. The initial purge succeeds and removes zero rows.

These checks establish the live database state and an initial cleanup invocation. The separate delivery checks establish Vercel readiness and promotion. Neither establishes a scheduled Vercel cron run or a real owner-authenticated flight search through the public application and a native device. Do not reapply the installed migrations as a remaining setup step.

## Native CI and TestFlight delivery

The official Codemagic API successfully triggered build `6ab94c8c5bc3b1a807726718` for exact SHA `7cbe50dc671fb48c1bfc00e3f44c1c3c86fc52b1`. Its final status is **finished**, with start **2026-09-27T17:04:19.194Z** and finish **2026-09-27T17:07:59.479Z** (about 3 minutes 40 seconds). The native build succeeded using CI's real public configuration.

App Store Connect was checked in both the build list and details. It confirms version **1.4.0 (52)**, uploaded **27 September 2026 at 20:08 Europe/Istanbul**, with **Ready to Submit** status. The details show **LetsGo2Travel İç Test**, group type **Internal**, with **3 testers**. Turkish test notes were saved for build 52. No App Review submission was made. This confirms package delivery and internal-group assignment, not that a tester installed the build or completed a real provider lookup on a device.

## Public production safety checks

At **2026-09-27 17:09 UTC / 20:09 Europe/Istanbul**, direct requests to `www.letsgo2travel.com.tr` passed all five checks:

| Check | Verified response |
| --- | --- |
| `/api/health` | HTTP 200; all checks true; database OK |
| Unauthenticated protocol-2 lookup GET | HTTP 200; `available:false` |
| Legacy lookup GET | HTTP 200; `available:false` |
| Trial save POST | HTTP 503; `unavailable` |
| Unauthenticated cleanup | HTTP 401 |

Vercel inspection resolved the public domain to `dpl_F76LYQV8dM5p3u1EGavDWXxgVHgV`, READY. No authentication bypass or provider request was used. These checks confirm public release health and the expected access/save restrictions, not a successful allowlisted flight search.

## Operational limits

Trial mode permits only explicit test accounts and never issues a save receipt. General commercial activation requires a separately approved suitable provider plan. Provider details for managed trips are kept out of native notifications and Live Activities in this version. Manual flights keep their existing native behavior.

Still unverified: a real owner-authenticated provider-to-production-to-device flight test and an actual scheduled cleanup run. Local fixture success, live database installation, public safety checks and TestFlight delivery must not be reported as those end-to-end results.

See [activation and retention operations](FLIGHT-LOOKUP-OPERATIONS-20260927.md) for exact prerequisites and cleanup outage handling.
