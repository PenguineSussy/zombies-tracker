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

Make the configured bot a moderator in each participating channel. Google test-user restrictions and API quotas may limit YouTube connections. Discord source remains available but setup is deferred.

## Updating

Stop the server, replace application files, preserve your local `.env` and `data/`, then restart. Run `npm test` to check the source. See [HOSTING.md](HOSTING.md) for a public HTTPS deployment.
