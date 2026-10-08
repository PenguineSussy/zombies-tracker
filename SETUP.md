# Run your own bot

Runners using doctormonty.beer only need the [LiveSplit addon](livesplit-addon/README.md). These instructions are for a separate tracker installation.

## Local server

1. Install Node.js 24 or newer.
2. Extract the bot ZIP. Optionally copy `.env.example` to `.env` and edit it locally.
3. Run `npm start` (or `Start-Tracker.cmd` on Windows).
4. Open http://127.0.0.1:3000 and register a runner.
5. Point the addon at this server and use the runner key from this installation.

No npm packages are required. Localhost works only on this computer. Data is created in `data/`; preserve it between updates. Never share `.env`, configured layouts, runner keys or database files.

## Twitch / YouTube

Each self-hosted installation needs its own developer application and bot account. Fill the blank provider settings in `.env.example`; do not use someone else's tokens.

Register these OAuth callbacks with the appropriate application:

- Bot authorization helper: `http://localhost:8787/callback`
- Twitch runner connection: `YOUR_PUBLIC_ORIGIN/api/chatbot/callback/twitch`
- YouTube runner connection: `YOUR_PUBLIC_ORIGIN/api/chatbot/callback/youtube`

Set `PUBLIC_ORIGIN` to your exact website origin. With the provider client ID and secret configured, run one helper at a time:

```sh
node --env-file-if-exists=.env scripts/oauth.js twitch
node --env-file-if-exists=.env scripts/oauth.js youtube
```

Keep the helper open while approving the bot account. It saves tokens locally without printing them. Restart the tracker afterwards. Runners can then connect their own channel in **Chatbot**, enable replies, and choose cooldowns/announcements.

Make the configured bot a moderator in each participating channel. Google test-user restrictions and API quotas may limit YouTube connections.

## Discord split alerts

The bot can post in a Discord channel, and ping a role, when a runner reaches a chosen split. It uses slash commands over HTTPS, so it needs a public `PUBLIC_ORIGIN`; it does not hold a gateway connection and will look offline in the member list.

1. Create an application in the Discord Developer Portal. Copy its Application ID and Public Key, then create a bot token under **Bot**.
2. Set `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY` and `DISCORD_BOT_TOKEN` in `.env` (or the host environment) and restart the tracker.
3. Run `npm run discord:register`. Set `DISCORD_TEST_GUILD` to a server ID first to register in that server only.
4. In the application's **General Information**, set the Interactions Endpoint URL to `YOUR_PUBLIC_ORIGIN/discord/interactions`. Discord checks the endpoint when you save, so the tracker must already be running.
5. Invite the bot with the `bot` and `applications.commands` scopes and the View Channel and Send Messages permissions:
   `https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot+applications.commands&permissions=3072`
6. Make the role mentionable, or also give the bot **Mention @everyone, @here, and All Roles**.

Members with Manage Server then run these in the channel that should receive the alerts:

| Command | Result |
| --- | --- |
| `/track-alert player split [role] [mode] [threshold] [map] [category]` | Alert when `player` reaches `split`. Use `*` as the player for every public runner (requires `map`). |
| `/track-alerts` | List this server's alerts and their IDs |
| `/track-unalert id` | Remove an alert |

`split` accepts the checkpoint names and aliases shown on the site (for example `Boss` for Boss Enter) or the runner's exact LiveSplit split name. `mode` defaults to every time the split is reached; `under` needs a `threshold` such as `7:35`, and `wr` pings only when ahead of the reviewed WR checkpoint. Without `map`/`category` the alert uses the runner's current map and category. Alerts fire once per split per attempt, only for public runners and live, non-practice runs, and are dropped if the runner resets or undoes the split before delivery.

## Updating

Stop the server, replace application files, preserve your local `.env` and `data/`, then restart. Run `npm test` to check the source. See [HOSTING.md](HOSTING.md) for a public HTTPS deployment.
