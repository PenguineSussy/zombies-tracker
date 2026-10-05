# 0.3.0 validation

35 Node tests pass: session aggregation, observed resets, practice exclusion, category isolation, stream URL validation, authenticated settings, privacy, Twitch live/offline/stale responses and multistream deduplication. Component 0.2.1 passes 52 assertions with 10 local HTTP/SQLite events, including settings confirmation and inactive editor clones.

Live Twitch/YouTube broadcasts and the reported interactive LiveSplit rendering issue are not yet verified. See CHANGELOG.md and livesplit-addon/README.md.

# Validation report

Build: 0.1.0 local alpha. Development session: October 4, 2026 (America/Chicago).

## Automated verification

`node --test` on Node.js 24.19.0: **26 passed, 0 failed**.

Covered behavior:

- Timer parsing, millisecond precision and command syntax.
- Username uniqueness, runner-key authentication and rotation.
- Multiple runner isolation and category/timing separation.
- Recorded checkpoint time versus current elapsed timer.
- Resets, explicit session changes and idle heartbeats.
- Full-run PB eligibility, missing checkpoints and practice exclusion.
- Undo corrections, duplicate/out-of-order ingestion and closed attempts.
- Stale uploads, public/private visibility and WR benchmark versioning.
- Discord signature validation, authorization, allowed role mentions, retries, nonce deduplication, and cancellation after a reset.
- LiveSplit reconciliation and a real local TCP test server with fragmented protocol responses.
- therun.gg normalization, exact profile-variable matching, millisecond units and stable attempt identity.
- Chat cooldowns, duplicate messages, OAuth refresh/retry behavior.
- Local HTTP registration, authenticated ingestion, source exclusion, privacy and deletion.

## Manual/local checks

- Started the service and loaded the dashboard in the Codex browser.
- Ran the synthetic demo through the HTTP API.
- Confirmed the dashboard command returned session-best Bow **4:43** for DemoRunner.
- Confirmed the runner detail view displayed Bow **4:43** and Crackle **7:31**.
- Observed the demo become offline after updates stopped.
- Read therun.gg's official frontend schema and fetched its public live list and one per-player endpoint read-only. The per-player request returned HTTP 200 with username, timestamp, start identifier and split fields matching the adapter. No source data was uploaded or ingested as a real BO3 run.

## Not yet verified

- A real BO3 attempt with the user's actual LiveSplit version and split layout.
- Authenticated Twitch, Discord or YouTube send/receive flows with real bot accounts.
- OAuth provider consent configuration and callback flows using the user's application credentials.
- therun.gg end-to-end BO3 tracking using the user's registered source and category labels.
- Public deployment, HTTPS interaction callbacks, large-community load or provider quota capacity.

No real chat messages or role pings were sent. The packaged archive excludes local runtime data, runner credentials, `.env`, and companion state/configuration.

Compatibility fix: a read-only connection to the user's running LiveSplit successfully read NotRunning, index -1, and elapsed time 0 using configured RealTime when gettimingmethod was unavailable. A socket regression test verifies one-time fallback and intact subsequent split responses.

## 0.2.0 validation
31 Node tests passed. 47 addon assertions passed, including event delivery to local HTTP/SQLite and offline replay. Tests cover map/category restrictions, six-map completion including The Giant, cumulative RTA, and exact paused timer synchronization. See CHANGELOG.md for the DPAPI/manual integration boundary. No live run data was posted by these tests.
# 0.4.0 validation

40 Node tests pass, including ownership isolation, browser-bound OAuth state, callback replay rejection, runner-key rotation, YouTube broadcast ownership, token redaction/removal, authenticated HTTP routes and channel-specific cooldowns. Provider responses use fixtures; successful real-account onboarding and live replies are not yet claimed. LiveSplit addon 0.2.3 previously passed 58 integration assertions and the user confirmed the layout display now works.
