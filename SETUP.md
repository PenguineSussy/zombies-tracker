# Setup guide

## 1. Start locally

Install Node.js 24+ from [nodejs.org](https://nodejs.org/). Open a terminal in this project folder:

```powershell
Copy-Item .env.example .env
npm start
```

Open http://127.0.0.1:3000. Leave the server running. To restart after changing `.env` or server source, press Ctrl+C, then run `npm start` again.

Register in Runner setup. Save the runner key privately: this alpha has no email/password recovery. It is separate from every Twitch, Discord, Google and therun.gg credential. A runner key lets its holder update/delete that runner's data.

The local URL works only on the machine running the server. Other runners need an HTTPS-hosted instance and their configuration must use that hosted URL, not their own localhost.

## 2A. Direct LiveSplit

1. Use the desktop version of LiveSplit, with a recent built-in command server. In LiveSplit's server controls, start the **TCP** server on port **16834**. The exact UI wording depends on the version. Do not select WebSocket mode for this companion.
2. Load the run's splits. Set Real Time or Game Time consistently with the dashboard profile. If using game time, ensure it is initialized by your timer/autosplitter.
3. Select map, objective, player count, ruleset and route in Runner setup. These fields separate statistics. Use a reviewed community naming convention for real comparisons.
4. Add split aliases if necessary, e.g. `{"Bow Done":"bow","Crackle":"crackle"}`. Names default to their normalized original when not mapped.
5. Choose Direct LiveSplit and download the configuration. Move it into this project's `companion` folder with the name **config.json**.
6. In a second terminal, run `npm run companion` or use `Start-Companion.cmd`. Keep it running alongside LiveSplit.
7. Start an attempt and split. Check the dashboard or `!current @YourTrackerName`.

The companion only connects locally to LiveSplit. Do not expose port 16834 to the internet. It sends authenticated updates outbound to the tracker. For a remote tracker, HTTPS is required.

The companion saves state and queued uploads to `companion/state.json`. Restarting it preserves attempt identifiers and unsent transitions. It retries service outages and coalesces heartbeat-only updates. A split/reset that occurs while the companion cannot read LiveSplit is not recoverable from its polling protocol. Gaps are labeled partial. Initial/reconnect snapshots don't send retroactive role pings.

Stop the companion before switching accounts/configurations. A private runner key is included in config.json; never upload that file to a public repository.

## 2B. Optional therun.gg source

1. Set up [the official therun.gg LiveSplit component](https://github.com/therungg/LiveSplit.TheRun). Keep your upload key inside that component.
2. In this dashboard choose **therun.gg**, and enter your public therun.gg username.
3. Copy the exact **game** and **category** labels used on therun.gg. Select the matching BO3 map/category locally. If category variables distinguish rules, enter them as exact JSON name/value pairs.
4. Save the connection. No therun.gg password or upload key is requested.
5. Start a matching run. The service reads `https://therun.gg/api/live/<username>` about every 15 seconds and records observed checkpoints.

Only one source is active per runner. Direct companion updates are rejected while therun.gg is selected. Switching source closes the previous observed attempt. It cannot silently mix game categories.

If the mapping does not match, Runner setup displays a source error. Stale/absent source data becomes “no recent therun.gg update,” not a claim that someone stopped playing. The source's timestamp is preserved; repeated polling cannot make old data look new. The live schema does not reliably identify pauses; the command reports the last reported timer.

This option does **not** import therun.gg session or lifetime bests. Tracker bests start with observed checkpoints. The linked public username is self-declared; source ownership verification is still required before a public identity system.

## 3. Discord

Requires a Discord application owned by you and a public HTTPS endpoint for interactions. The app is built and tested locally first; localhost cannot receive Discord's production interaction requests.

1. Create an application in [Discord's Developer Portal](https://discord.com/developers/applications). Get its application ID, public key and bot token.
2. Put them in local `.env` as `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`. Do not paste credentials into chat.
3. Install the application in your test server with the `bot` and `applications.commands` scopes. Give it View Channel and Send Messages in the chosen channel. A role must be mentionable or the bot must have permission to mention it. Administrator access is not needed for ordinary bot operation.
4. Optionally set `DISCORD_TEST_GUILD` to the test server ID. Run `npm run discord:register`. This replaces this application's slash-command definitions in that scope; use a dedicated application.
5. Host the service with HTTPS, or use a tunnel you control for testing. Configure the Interactions Endpoint URL as `https://YOUR-HOST/discord/interactions`. The server validates Ed25519 signatures and Discord's ping challenge.
6. Use `/current player:YourTrackerName` and `/best player:YourTrackerName split:bow scope:session`.
7. With Manage Server permission, use `/track-alert player:YourTrackerName split:crackle mode:wr role:YourRole` in the destination channel. The runner must already have a profile. The subscription captures that exact profile; create another if their category changes.

Alert modes: `wr` (strictly ahead of the configured checkpoint), `under` (at or under a threshold, such as 7:35), `milestone` (each completion). List/remove with `/track-alerts` and `/track-unalert`.

Ordinary replies disable all mentions. Only configured role alerts can ping. Retries use a stable Discord nonce. Dedupe is per subscription/checkpoint/attempt. For pilot-scale use keep subscriptions focused; community-wide cooldown configuration is future work.

## 4. Twitch

Use a dedicated bot account if you want a separate bot name. This alpha uses user-token EventSub WebSockets. It is an operator-managed integration, not yet a public install-on-any-channel OAuth flow.

1. Register an app in [Twitch's developer console](https://dev.twitch.tv/console/apps).
2. Set its OAuth redirect URI to **http://localhost:8787/callback**.
3. Save `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `.env`.
4. Stop the tracker during authorization, then run:

```text
node --env-file-if-exists=.env scripts/oauth.js twitch
```

5. Open the printed authorization link yourself and sign in as the **bot account**. Consent requests `user:read:chat` and `user:write:chat`. The helper saves tokens and bot user ID directly to `.env`, without printing them.
6. Set `TWITCH_CHANNEL_IDS` to comma-separated numeric broadcaster IDs for channels whose owners want the bot. IDs can be obtained with Twitch's Get Users endpoint using the application's authorized token; they are not channel login names.
7. Restart the tracker. Check the terminal for subscription success/errors. Ask `!current @YourTrackerName` in an enabled channel.

The adapter validates tokens at startup and hourly, refreshes them when possible, deduplicates chat events and reconnects EventSub sessions. A rejected subscription requires checking account permissions/configuration; a “configured” badge is not proof the connection is authorized. For a public cloud bot, implement broadcaster consent and the appropriate cloud-bot authorization model before opening self-service channel enrollment.

## 5. Optional YouTube Live

1. Create a Google Cloud project and enable the **YouTube Data API v3**.
2. Configure an OAuth consent screen and a Web application OAuth client. Add **http://localhost:8787/callback** as an authorized redirect URI. During testing, add the intended Google account as a test user if required.
3. Save `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in `.env`.
4. Stop the tracker and run:

```text
node --env-file-if-exists=.env scripts/oauth.js youtube
```

5. Open the link yourself and authorize the account that should post chat replies. The helper requests `youtube.force-ssl` and saves returned tokens locally.
6. Set `YOUTUBE_LIVE_CHAT_IDS` to the target broadcast's active live chat ID. Obtain it from `videos.list(part=liveStreamingDetails,id=VIDEO_ID)` → `activeLiveChatId`, or your authorized live-broadcast metadata. A video ID/channel ID is not a live chat ID.
7. Restart the tracker. Use the same `!current`/`!best` commands in that broadcast's live chat.

The bot skips historical chat on connection, follows the API's polling interval, backs off on errors, and stops that chat when it ends or quota is exhausted. Chat must be enabled and the posting account must be permitted to chat. API quota, Google consent verification/testing restrictions and token expiry can affect availability. A new broadcast may need a new chat ID.

## 6. WR checkpoints

Generate an admin key:

```text
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Save it as `ADMIN_KEY` in `.env` and restart. In Runner setup select the exact map/category. Under Chat & alerts, enter the admin key, record holder, verified date, source URL and checkpoint JSON in **milliseconds**. Example values in the form are illustrative, not asserted world records.

Only matching benchmark checkpoints can produce a pace comparison. The latest benchmark is copied onto new attempts, so subsequent edits cannot change an existing attempt's comparison.

## 7. Deployment boundary

All source code is here; no hosting, domain, bot account or paid service was created for you. Before public deployment:

- Choose and authorize a host/domain. Use HTTPS with a reverse proxy. Set `HOST=0.0.0.0` only inside the intended hosting environment; the development default binds loopback.
- Keep the database on persistent storage and back it up consistently with SQLite's WAL files, or while the service is stopped. Protect `.env`, OAuth cache and backups with host-level access controls.
- Add public account ownership verification, recovery, appropriate moderation/abuse protections, privacy/terms pages and provider-specific self-service OAuth. Configure proxy-aware rate limiting at the trusted proxy; the alpha intentionally does not trust arbitrary forwarded IP headers.
- Load-test and revise database queries for the expected community size. Run only one service instance against this pilot SQLite database.
- Perform real-account testing in your own test channels/server. The automated suite does not replace real LiveSplit and provider authorization testing.

## Troubleshooting

| Symptom | Check |
|---|---|
| LiveSplit command timeout | Recent built-in TCP server, matching port, no WebSocket mode |
| Tracker offline | Companion window open; server reachable; private key still valid |
| therun.gg source error | Exact game/category/variables; live feed exists; timing method matches |
| No best recorded | Profile differs, practice mode, no observed checkpoint, or new session |
| No WR comparison | Exact category and checkpoint benchmark required |
| Discord responds but role never pings | Mentionable role/permission, selected trigger, benchmark, active attempt |
| Twitch subscription fails | Correct bot user ID, client ID, scopes and channel authorization |
| YouTube stops | Broadcast ended, wrong live chat ID, consent/token restriction or quota |
| Need to reauthorize | Stop server, run OAuth helper again, restart; helper clears that provider's older cached tokens |

You do not need Excel. Exported history is JSON; spreadsheet/CSV import/export can be added later if useful.

## Older LiveSplit servers

If gettimingmethod is unavailable, the companion probes it once and uses the configured profile timing with a compatibility warning. Select the matching Real Time or Game Time method in LiveSplit. Close and reopen the companion after updating its files. Split and timer reads continue normally; automatic timing-method verification is unavailable in this mode.

