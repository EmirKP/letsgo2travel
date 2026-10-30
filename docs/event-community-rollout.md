# Event companions and group chats

The mobile event detail embeds `EventCompanionsPanel`; Community shows only chats returned for the signed-in account by `JoinedEventChats`. Saving an event does not RSVP. The explicit “Katılacağım” action joins the canonical event group and makes the existing public community profile visible among attendees. There are no direct messages.

## Rollout status — 25 October 2026

The coordinating release agent applied exactly `supabase/migrations/20261024213000_event_community.sql` to the existing Supabase project `mwlucroyjvtoxillvzga` on 24 October 2026, using the cached authenticated CLI with an atomic migration-ledger wrapper. Existing schema dependencies were checked first. No user messages, memberships, meetup data or test content were inserted. Verification confirmed all six new tables have RLS enabled, no anonymous reads or authenticated direct writes/RPC execution, service-role RPC execution enabled, and the migration ledger entry present. Evidence: `outputs/ux-polish-17/event-community-apply.log` and `outputs/ux-polish-17/event-community-verify.log`.

The new backend has been deployed only to a protected Vercel **Preview**, deployment `dpl_FkiTKDoNeMzYkruAZwyJxCnJGVYQ`: `https://letsgo2travel-irczr7fu5-emirkaanpolat34-9211s-projects.vercel.app`. Its state is READY, target is Preview (`null` in the deployment API), and deployment aliases are empty. No production promotion, custom-domain assignment, paid-plan change or environment-variable change was made. The mobile client remains in the local browser preview; the installed physical-phone build 81 is unchanged. Production backend/client rollout remains pending. If the server, migration or provider configuration is missing in another environment, the UI displays unavailable/retry states and does not create a local substitute chat. For another environment, apply this exact migration after the existing community safety/public-profile migrations; use `docs/event-community-preflight.sql` for read-only dependency and privilege checks first. Do not replay unrelated historical migrations.

An independent Vercel alias read after preview creation confirmed `www.letsgo2travel.com.tr` still points to the existing production deployment `dpl_BfdXx2pQ7YLYXz7b3K15e8YvSUZv`, not this preview. The project's SSO configuration also matches its pre-deployment state.

The coordinating release agent also applied the narrow forward migration `20261024214500_event_meetup_owner_recovery.sql` through the normal atomic migration-ledger wrapper, guarded by its exact SHA256 `BE254BEF34E5A96910F59D78B49A1482923BCB27074E69EF2585AD6D41EF2975`. Evidence: `outputs/ux-polish-17/event-owner-recovery-apply.log` (exit 0). It lets a member explicitly replace a pin whose creator account/public profile has been removed, without allowing a blocked viewer to take over an active creator's pin. It replaces the existing service-only action function and does not change the already-applied base migration. Both database migrations are applied; production rollout and physical-device verification remain pending.

Event metadata comes from the published `travel_events` row, Ticketmaster's event-ID endpoint or PredictHQ's event-ID search filter. The browser supplies an ID only. Existing provider environment variables are reused (`TICKETMASTER_API_KEY`, `PREDICTHQ_ACCESS_TOKEN`); server Supabase configuration and normal Bearer authentication are also required. No new paid service or AI call is added. Provider responses are cached for up to 15 minutes; a source recheck failure preserves existing member chat access while showing that the displayed event facts were last verified earlier. A fresh RSVP requires source verification. A change banner is generated only when a verified snapshot differs from the previous verified snapshot.

The event group stores memberships, mute choice, 1,000-character messages, client request IDs for safe retries, and one pinned public meeting place/time. Meetup joining is explicit. Only its creator can change/remove a meetup; changing time/place resets attendance. The time must be in the future within three days of the event. Group messages refresh every 20 seconds while the chat is visible, including when muted; mute does not prevent reading incoming messages in an open chat. This release does not send push notifications. Group membership and messages persist across devices, and earlier messages use cursor pagination. Existing two-way community blocks hide profiles, messages and meetups. The existing blocked-account sheet can undo an event-originated block.

Reports are stored in `event_community_reports`. Moderators/admins can retrieve pending reports through `GET /api/admin/event-community/reports?page=0` (30 per page) and resolve/dismiss through `PATCH` with `{id,status,hide}`. Hiding a reported message and resolving its report happens in one transaction. Meetup reports use the same endpoint; removing a reported meetup also removes its associated reports. This dedicated queue does not alter existing forum report semantics.

## Local verification

`node tests/event-community-db.mjs` exercises the real migration in local PGlite: authorization/grants, explicit opt-in, membership persistence, idempotent message retries, rate/length limits, meetup ownership/attendance, reports/blocks, verified change versioning, cursor ties and account deletion. `node --test tests/event-community-api.mjs` exercises handler auth binding, parser limits, exact Events API provider namespaces including Biletix/Ticketmaster IDs, source normalization, avatar privacy, unavailable creators, source outage behavior, status mapping, React Activity pause/resume of pending writes and stale joined-list responses. All provider responses are mocked. Neither suite sends messages to real accounts or calls a live provider. Local environment metadata has no Ticketmaster/PredictHQ key; no live provider resolution or signed-in device chat is claimed from these local checks.

Independent read-only checks on 24 October found the existing server Supabase configuration usable but no published curated `travel_events` rows, so a genuine live curated resolver case was unavailable. The existing main public Events API returned HTTP 200 with live provider coverage. Its real Biletix/Ticketmaster event `ticketmaster:Z2HyzZyMZkC9r6vee` (“Yaşar Ne Yaşar Ne Yaşamaz”, İstanbul, `2026-10-24T15:00:00.000Z`) and two other returned IDs passed the actual canonical-key parser unchanged. That public-list evidence confirms current production ID compatibility; it does not claim live execution of the new Ticketmaster detail resolver or authenticated group-chat flow. These checks inserted no user data and called no AI service.

On 25 October, the coordinating agent then verified the real “Zengin Mutfağı” event (İstanbul, Maximum UNIQ Hall, 25 October at 15:00 GMT+3) through the local signed-in browser and the new protected preview backend. Provider verification succeeded and the real panel displayed **0 participants**, the opt-in explanation and “Katılacağım”, without errors. No RSVP or chat message was submitted. Evidence: `outputs/ux-polish-17/event-real-provider-390.png`.

## Local startup recovery — 26 October 2026

The Community failure on 26 October was a local proxy failure: Vite was still
routing `/api/event-community` to port 3984, but the separately started relay had
stopped. The browser received HTTP 502 before the request reached the app's
authentication handler. The database list RPC remained available. Restarting
the relay restored application-generated 401 responses for an intentionally
invalid session; no memberships or messages were created to diagnose this.

`npm run dev:mobile` now starts the configured protected relay before opening
the mobile preview. In the ignored `.env.development.local`, retain the existing
API settings and set these non-secret local settings:

```dotenv
L2T_EVENT_COMMUNITY_DEV_API_URL=http://127.0.0.1:3984
L2T_EVENT_COMMUNITY_PREVIEW_URL=https://letsgo2travel-irczr7fu5-emirkaanpolat34-9211s-projects.vercel.app
L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES=true
```

The launcher obtains a fresh process-local development OIDC token through the
existing linked Vercel CLI. It checks `/__event-community-health`, which only
requests the remote app's unauthenticated auth guard and returns a small health
result. It does not read user data or forward a user session. An unrelated
listener, protection failure or missing relay configuration stops startup with
an explanation; it never falls back to a different deployment. A valid existing
relay is reused without taking ownership of its process. Startup owns and
cleans up only the relay it launched. No credentials are added to the client.

The joined-chat UI distinguishes an expired app session from connection errors.
A failed refresh preserves the previously loaded list with a clear warning;
an initial failure still displays an error rather than a fabricated empty list.
Retry and sign-in remain explicit user actions.

## Live RSVP and chat verification — 26 October 2026

At the user's explicit request, the actual mobile UI and protected Preview
backend were exercised with the live Ticketmaster/Biletix event **Çalıkuşu**, at
Taksim İstiklal Sahne, İstanbul, 27 October at 16:00 GMT+3
(`ticketmaster:Z2HyzZyMZk848Ovv6`). The live listing and server detail resolver
verified the same event. The group had no existing participants or messages.

Two clearly labelled temporary QA accounts signed in through the normal mobile
email/password form and completed their own public profiles with the normal
RLS-protected client function. No API responses, event facts or auth sessions
were mocked. All 13 final checks passed: live provider/group baseline, two real
sign-ins, rejection of messaging before RSVP, both RSVP writes, attendee
profiles, A-to-B and B-to-A delivery through the actual 20-second polling,
idempotent message retry, persistence after a full page reload and reopening
from Community, mute/unmute persistence, withdrawal with messaging permission
revocation, and removal from the joined-chat list.

Only two clearly marked QA messages were sent in the completed run. Both were
deleted by their exact IDs and owning QA account IDs **before** deleting those
accounts, because message ownership uses `ON DELETE SET NULL`. Post-cleanup
reads confirmed both QA accounts were gone, zero event memberships, zero event
messages, and a healthy preview connection. The verified public event snapshot
was retained. Earlier setup attempts also cleaned up their own QA accounts and
messages. No existing user account, message or membership was changed.

Evidence: `outputs/event-chat-live/report.json`, `post-cleanup.json`,
`02-live-two-way-chat.png` and `03-reopened-from-community.png`. The screenshots
were taken during the test, before the QA messages were cleaned up. These
checks exercised the browser preview, not the installed physical-phone build.

## Protected local preview access (manual diagnostic alternative)

Vercel SSO remains enabled. A direct unauthenticated request to the preview redirects to Vercel authentication. The local relay uses the documented same-project development OIDC header; no permanent bypass secret or weakened protection rule was created. The OIDC token exists only in the relay process, is never returned to the browser or saved in source/artifacts, and is short lived (normally about 12 hours). If it expires, stop only the relay process and rerun its launch command using the existing authenticated Vercel CLI. The remote preview also remains subject to the project's deployment-retention settings; it is not a production alias.

From the linked repository in PowerShell, launch the relay with the current protected preview origin:

```powershell
$env:L2T_EVENT_COMMUNITY_PREVIEW_URL='https://letsgo2travel-irczr7fu5-emirkaanpolat34-9211s-projects.vercel.app'
$env:L2T_EVENT_COMMUNITY_PROXY_PORT='3984'
$env:L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES='true'
npm exec --offline --no -- vercel env run --environment development --scope team_nrPGcjAHHiXJJwwEmfGr38qK -- node scripts/event-community-preview-relay.mjs
```

The relay listens only on `127.0.0.1:3984`. Only the exact `/api/event-community` development proxy uses it. Other account/assistant APIs keep their original hosts, and release builds omit this override. The normal mobile launcher now manages this dependency; the command above remains useful for isolated diagnosis. After an OIDC token expires in a long running session, restart the owned mobile launcher to obtain a fresh token.

The relay defaults to GET-only. The explicit `L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES=true` launch option enables authenticated POST for RSVP, meetup or chat actions in the UI. It forwards the user's normal Bearer session to the existing server validation, caps request bodies at 10,000 bytes and cannot proxy other paths or arbitrary upstream hosts. The earlier provider check used only reads; the separately authorized 26 October live test above also exercised RSVP and messaging. An unauthenticated POST was rejected locally with 401 before reaching the upstream. `tests/event-preview-relay.mjs` verifies these boundaries using mocked responses and nonfunctional credentials only.

Provider contracts: [Ticketmaster Discovery event details](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) and [PredictHQ event search](https://docs.predicthq.com/api/events/search-events).

## Live regression verification — 30 October 2026

Local Maps configuration had also redirected `/api/events` to a local Next
process without event-provider keys. Events now keep the configured public
API unless the independent, loopback-only `L2T_EVENTS_DEV_API_URL` is explicitly
set. Maps and account routes retain their existing targets. Release builds
omit the development setting. A JSON Vercel deployment-protection 401 now maps
to a connection 503, while a real app 401 still requests app sign-in. Chat
network/5xx errors offer localized recovery without raw infrastructure text
or loss of an unsent draft.

The actual future event **Haydaaa! Mehmet Mayda Stand Up Gecesi**, Efsahne
Beyoğlu, İstanbul, 30 October 2026 at 19:00 GMT+3 was used:
`ticketmaster:Z1HyzZyMZk99a3SN`,
<https://www.biletix.com/performance/5MM77/027/TURKIYE/tr>.
The provider listing and protected chat server verified the same event.
Before testing, its group had no participants. The existing signed-in app user
joined through the visible UI, sent a clearly labelled test message, refreshed
the page, and reopened the persisted conversation from Community.

A temporary clearly labelled QA peer signed in with normal password auth and
completed only its own profile through authenticated RLS. Its join and message
used the real chat API; the visible app received that message through normal
polling and sent a reply, which the peer read back. The app also opened the
peer profile and reopened both messages after another full-page refresh.
The 11 live peer checks include nonmember 403, source-verified RSVP, duplicate
request idempotency, reply delivery, persisted mute/unmute, and loss of chat
read/send permission after leaving. No response or session was mocked.

The first QA setup attempt requested an unnecessary profile UPSERT grant and
was rejected. That attempt's account was removed; the completed run used the
same own-profile PATCH/insert behavior as the app without changing grants.
After evidence capture, the QA peer and its message were removed. The current
app user's test RSVP was withdrawn through the UI, and only the two exact
test messages from that user were removed. Cleanup verified no remaining test
memberships/messages; the verified public event snapshot was retained.

Validation: 72 API/UI/config/relay/launcher regression tests, 9 isolated database
checks, mobile app/config TypeScript, scoped ESLint, and an isolated Vite build
passed. Evidence lives in `outputs/events-live-20261030/`: `peer-report.json`,
`cleanup-report.json`, `02-real-two-way-chat.png`, and
`03-reopened-two-way-chat.png`. Regression log:
`outputs/usability-current/live-events-relay-final-tests.log`.
These checks used the local browser app, the existing protected Preview chat
server, and the public live event provider. Production was not promoted and
no TestFlight build was uploaded in this run.
