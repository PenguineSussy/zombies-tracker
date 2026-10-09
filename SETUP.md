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

## Discord website setup

Use the existing Discord application. In its Developer Portal, enable server installation and public bot installation if other server owners should be able to invite it. Keep the existing interactions endpoint.

1. In OAuth2, add this exact redirect: `https://doctormonty.beer/api/discord/callback` (use your PUBLIC_ORIGIN for self-hosting).
2. Set `DISCORD_CLIENT_SECRET` on the tracker server. Keep `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, and `PUBLIC_ORIGIN` configured. Never put secrets in browser files or source control.
3. Restart/deploy the tracker. Existing slash command registrations do not change for this feature.
4. On Chatbot, use **Add bot to a server** and approve Discord's installation screen. The invite requests View Channel and Send Messages, not Administrator.
5. Sign in with a runner key, choose **Connect Discord**, and approve `identify` and `guilds`. Select a server you manage, an accessible text/announcement channel, and an optional role the bot can mention.
6. Choose a runner (or `*` for every public runner), map, category, checkpoint and alert condition, then save. Remove alerts from the same panel or with `/track-unalert`.

The server verifies Manage Server/Administrator ownership and current channel/role permissions. Discord management sessions last at most one hour, are held in server memory, and require reconnecting after expiry or server restart. No Discord user refresh token is stored. Disconnecting website management does not remove the bot or stop existing server alerts.

If website OAuth is not configured yet, the invite and existing `/track-alert`, `/track-alerts`, and `/track-unalert` commands still work. After adding the bot, refresh servers in the website panel. For missing channels, check bot and user channel permission overrides; for missing roles, make the desired role mentionable.
