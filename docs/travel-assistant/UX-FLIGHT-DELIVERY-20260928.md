# Simpler travel flows with the existing brand palette

The user asked for fewer confusing steps, ongoing flight support and coordinated cockpit/Live Activity behavior. They explicitly rejected a palette change during review. Home, Saved, personal cards and cockpit keep the established navy, blue, yellow and white colours.

## App changes

- Home presents the next trip/preparation step, two supporting actions and a short inspiration section. Saved opens into counted categories rather than multiple empty lists. Community, shared plans and travel tools remain reachable.
- Explore and Plan retain drafts across tab visits using React Activity. Hidden effects disconnect; flight/provider screens unmount. New route choices start at the top, while normal returns restore position. Account changes reset the protected screen tree.
- Short navigation/sheet animations respect reduced motion. Touch targets are enlarged. Optional account/import/release modules load on demand; a failed overlay can be closed without losing the app's draft tree.
- Personal hotel/address/reservation cards remain local to this device, separated by account or guest. Editing, deletion and undo are supported; confirmed account deletion clears that account's cards. They never contain a copied provider response.
- Ticket import uses an iOS system photo/file picker, PDFKit and on-device Vision OCR, with a text-paste fallback. Raw text is transient and fields require confirmation. Multiple ambiguous flights/dates stay unselected. Native recognition is bounded to 20 MB, six PDF pages and 24,000 characters; mixed text/image PDFs may still require manual correction.
- Ongoing manually entered flights can be added when arrival is still ahead. Provider v3 distinguishes scheduled, estimated and actual fields and uses source timestamps for freshness. Commercial save/native/background paths remain gated; the current free trial remains a preview.

## Native lifecycle

Provider cards require validated v3 progress and at least 13 hours until provider retention expiry at both JS and native admission. This includes one hour of margin over Apple's documented maximum visible lifecycle of eight active hours plus four lock-screen hours. It does not claim deletion of forensic OS storage. Near-expiry content cannot start/update a provider activity; manual ticket reminders remain separate. Unknown revised-time kinds cannot replace a scheduled time.

[Apple Live Activity constraints](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)

## Local verification

Browser checks verified the restored navy card/yellow action, no horizontal overflow at the inspected viewport, Plan duration surviving a tab round trip, direct destination planning and personal-card save/reopen/delete/undo. The temporary test card was removed. Authenticated provider-to-device and physical iOS OCR/Island behavior were not exercised locally.

The mobile production build used the existing public Supabase client configuration obtained from published public assets, without logging values or changing build guards. Its entry JavaScript was 313,793 bytes versus the prior local artifact's 369,379 bytes (about 15% smaller). This is an entry-file size comparison, not a measured launch-speed improvement or full transfer-size comparison. Next.js production build and mobile lint passed.

The full release runner passed after obsolete layout expectations were updated to verify the new navigation paths; the application suite passed 139/139. Flight, retention, background queue, privacy, account deletion and community checks remain included. Operational gates and activation requirements are described in `FLIGHT-V3-OPERATIONS-20260928.md`.
