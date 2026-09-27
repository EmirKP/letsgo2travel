# Flight lookup v2 — local verification, 27 September 2026

## Scope and current boundary

RapidAPI/Direct adaptation, private trial access, signed commercial selections, expiry-separated storage and mobile UI are implemented. No paid subscription was purchased. No production database migration, Vercel deployment or new TestFlight build was performed for this change. Production remains on the prior release with lookup disabled.

Activation needs the application's Supabase management login and the owner's application account email, from which the authorized private tester UUID can be resolved. Existing sensitive Supabase settings could not be retrieved through the Vercel CLI; they were not exposed or copied. The Supabase dashboard currently shows sign-in.

Five production variables were prepared successfully in Vercel: RapidAPI credential/channel, trial mode, a monthly cap of 50 application requests, and lookup explicitly disabled. The credential was read from the authorized provider page and transferred to the secret store through memory/stdin only. No deployment or provider request resulted from this preparation. Tester UUID and migration installation remain pending.

## Verification performed

- Root TypeScript, root ESLint, mobile ESLint and Next.js production compilation passed.
- The full release requirement runner passed after updating its old three-argument source assertion for Cockpit's explicit detail-read option. It still checks cancelled-trip recovery and managed-flight exclusion from native reminders.
- Provider/API tests exercise the real normalization, adapter, HMAC and handlers using isolated fixtures. PostgreSQL-compatible tests cover quota, RLS, receipt replay, expiry, personal-data preservation and cleanup heartbeat. They do not contact the provider or production database.
- The real mobile source compiled in the isolated whole-app QA bundle. A normal local native release build correctly refused to build without the real public Supabase configuration. The QA bundle is not a distributable or an iOS compilation result.
- Browser checks used actual Cockpit components and an explicitly labelled local fixture service: scheduled flight search, selection, end date and save; private trial preview with save disabled; manual mode clearing provider-derived airport/time fields; distinct past-scheduled-departure message; timed expiry removing flight details while retaining the personal trip and checklist. No browser error/warning was reported during these checks.
- The successful commercial-save browser scenario used synthetic data and a local mock save endpoint. Live service authentication, provider-to-production-to-device flow, actual SQL installation, scheduled cleanup and native-device behavior remain unverified.
- A final review caught provider details remaining in memory after marking a trip completed or cancelled. The state replacement and display guards now remove them immediately; targeted behavior tests and the browser completion scenario confirm that the personal checklist remains and old details do not reappear when reopening the trip.
- The final mobile pass also corrected the expiry timer to use the actual current clock and the saved arrival to use the verified provider airport time zone. The updated Cockpit UI and managed-data suites passed 20/20 tests; mobile TypeScript and affected-file lint passed.

## Operational limits

Trial mode permits only explicit test accounts and never issues a save receipt. General commercial activation requires a separately approved suitable provider plan. Provider details for managed trips are kept out of native notifications and Live Activities in this version. Manual flights keep their existing native behavior.

See [activation and retention operations](FLIGHT-LOOKUP-OPERATIONS-20260927.md) for exact prerequisites and cleanup outage handling.
