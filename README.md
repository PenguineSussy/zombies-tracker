See [0.3 changes](CHANGELOG.md) and [LiveSplit compatibility update](livesplit-addon/README.md). The addon settings fixes are tested, but interactive layout rendering still needs verification. The optional therun.gg connection remains available.

# Dr Monty Bot — Solo Easter Egg alpha 0.3

A working first build of a shared BO3 Zombies run tracker. LiveSplit or optional therun.gg supplies checkpoints; Twitch, Discord, and YouTube Live expose the same recorded stats. No OBS integration and no spreadsheet dependency.

## Try it

Requires **Node.js 24 or newer**. There are no npm packages to install.

1. Open a terminal in this folder and run `npm start`, or double-click `Start-Tracker.cmd` on Windows.
2. Open **http://127.0.0.1:3000**.
3. In another terminal run `npm run demo` for clearly labeled synthetic data.
4. Ask `!best @DemoRunner bow session` in the dashboard. It returns **4:43**.
5. For a real runner, use **Runner setup**. Save the private runner key, select a profile, then choose Direct LiveSplit or therun.gg.

Detailed platform authorization and LiveSplit instructions: **[SETUP.md](SETUP.md)**.

## Implemented

- Self-service tracker username registration with revocable bearer keys; public/private visibility; account/history deletion and JSON export.
- Ten enabled official BO3 Zombies maps. Nacht der Untoten, Verrückt, Shi No Numa, and Kino der Toten are disabled for new runs; their existing history remains readable. New runs are Solo Easter Egg RTA only. Categories are No Gums, Classic Gums, Mega Gums and Any%. Legacy history remains separate.
- Direct LiveSplit TCP reader, split-name aliases, local persistent upload queue, resets, undo/skips, paused state and stale-connection detection.
- Optional therun.gg public live-feed reader with exact game/category/variable matching; no therun.gg upload key needed.
- Session and all-time **recorded cumulative checkpoint** bests; full-attempt PBs when complete data is available; practice exclusion.
- Twitch EventSub chat-command connector and optional YouTube Live polling connector, OAuth setup helper and token refresh.
- Signed Discord slash commands, server-manager controlled role alerts, delivery retries and deduplication.
- Administrator-entered WR checkpoint benchmarks with source, holder and date; benchmark frozen at attempt start.
- Responsive dashboard, synthetic demo, and automated tests.

## Current limits — read before public launch

This is an alpha for local/pilot use, with a hosted community pilot. No real platform bot credentials are included. Chat adapters have automated tests around shared command/auth/delivery logic but still need real-account end-to-end testing. No messages were posted during development.

- Tracker usernames and therun.gg mappings are **self-declared**, not verified platform identities. One-click public Twitch/Google onboarding, identity ownership verification, account recovery, moderation and abuse prevention beyond basic limits remain launch work. For a pilot, the operator provisions the allowed chat channels.
- All-time records begin when this service observes a checkpoint. It does not import historical `.lss` files or therun.gg lifetime history. Session boundaries belong to this tracker, not therun.gg's session calculations.
- The legacy TCP companion polls LiveSplit. A reset/split sequence occurring entirely between polls or while LiveSplit is disconnected may be missed. The reader marks observed gaps as partial and never fabricates intermediate checkpoint times. The new native addon captures timer events instead; see livesplit-addon/README.md for its recovery limits.
- The server must support `getattemptcount` and the split/time commands. Older servers without `gettimingmethod` are supported in compatibility mode: the companion uses the configured profile timing and warns that LiveSplit must match it. Keep the configured timing method and timer method aligned. The legacy companion requires Real Time selected in LiveSplit. The native addon reads Real Time directly.
- therun.gg's public live endpoint is an upstream dependency, not a guaranteed stable third-party contract. It is polled at roughly 15-second intervals. Missing/old updates mean **unknown freshness**, not proof that a runner stopped playing. Pause state is not exposed by the consumed schema. Attempts entirely between polls can be missed. Existing historical best-comparison fields are not interpreted as newly achieved checkpoints.
- WR benchmarks are manually maintained. None are bundled as real records; no automatic WR verification or record scraping is implemented. A checkpoint lead is not a finish prediction.
- Scope is the 14 official maps. Custom-map registration, global leaderboards, PB-pace subscriptions, segment-duration commands and editable Discord run-status messages are not in this version.
- SQLite and a single process keep pilot hosting simple. Public scale needs operational review, persistent backups, TLS, better registration abuse controls, normalized/indexed history queries, privacy/legal pages and load tests. A process restart should preserve data, not delete `data/`.
- YouTube needs live chat, OAuth and available Google API quota. Broadcast chat IDs change; the operator updates them. The current connector uses documented polling rather than streaming.

## Commands

```text
!current @Player1
!splits @Player1
!best @Player1 bow session
!best @Player1 bow alltime
!best @Player1 "lightning bow" alltime
!pace @Player1
!pb @Player1
!session @Player1
!help
```

An optional leading bot mention is accepted: `@BotName !current @Player1`.
Use the **registered tracker username**, which may differ from a Twitch/Discord/YouTube display name.
Text commands select the runner's latest profile and always name it in the response. Historical cross-category queries currently use exported history or the internal query API, not a chat category selector.

Discord provides `/current`, `/splits`, `/best`, `/pace`, `/pb`, `/session`, plus `/track-alert`, `/track-alerts`, `/track-unalert` for members with Manage Server or Administrator.

## Session semantics

A first active attempt opens a session. A LiveSplit reset ends that attempt while retaining its checkpoints. The next attempt remains in the same session. An explicit New session changes the session for subsequent attempts; reset or finish first. End session keeps earlier records and a subsequent new attempt opens another session. A new attempt after more than two hours without updates opens a new session automatically.

Undo updates the current attempt's checkpoints and recalculates records. An already sent notification cannot be unsent retroactively; undo cancels pending deliveries and re-splitting does not ping the same subscription/checkpoint again in that attempt. An entirely new attempt can alert again. Alerts queued for a run that has reset are cancelled before delivery.

## Development

```text
npm test
npm start
npm run demo
```

`src/store.js` owns records/sessions; `companion/` reads LiveSplit; `src/therun.js` normalizes the alternate source; `src/chat.js` contains Twitch/YouTube; `src/discord.js` handles Discord; `public/` is the dashboard. The service uses Node's built-in HTTP, crypto, fetch, WebSocket and SQLite APIs.

Data and OAuth refresh credentials are stored locally in `data/`; `.env`, runner configs, and data files are excluded by `.gitignore`. Protect the host account and backups. Do not share a configured project archive with those files included.

## Source references

- [LiveSplit server commands](https://github.com/LiveSplit/LiveSplit#the-livesplit-server)
- [therun.gg LiveSplit component](https://github.com/therungg/LiveSplit.TheRun)
- [therun.gg live endpoint source](https://github.com/therungg/therun-frontend/blob/main/app/api/live/%5Busername%5D/route.ts)
- [therun.gg live schema](https://github.com/therungg/therun-frontend/blob/main/app/%28new-layout%29/live/live.types.ts)
- [Twitch chat authorization](https://dev.twitch.tv/docs/chat/authenticating/)
- [Twitch EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
- [Discord interactions](https://docs.discord.com/developers/interactions/overview)
- [YouTube live chat list](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list)
- [YouTube live chat insert](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/insert)

Independent community software, not affiliated with Activision, Treyarch, LiveSplit, therun.gg, Twitch, Discord or YouTube.


