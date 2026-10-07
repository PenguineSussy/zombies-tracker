# Development

## Server

Node.js 24+; no external npm dependencies.

```sh
npm test
npm start
```

Optional synthetic data: `npm run demo`. Do not run the demo against production.

Core modules: `store.js` (runs/sessions), `domain.js` (validation), `chat.js` (chat delivery), `chat-connections.js` (channel OAuth), `pace.js` and `wr-checkpoints.js` (comparisons), `split-rules.js` (checkpoint names), `browser-sessions.js` (30-day login).

## LiveSplit addon

Build with the .NET Framework compiler and a local LiveSplit installation:

```powershell
.\livesplit-addon\build.ps1 -LiveSplitDir C:\LiveSplit
.\livesplit-addon\test.ps1 -LiveSplitDir C:\LiveSplit
node livesplit-addon/integration.mjs
```

Distribute only the DLL from `livesplit-addon/dist/`. Test binaries use test-only substitutions and must never be installed. LiveSplit dependency assemblies are not redistributed.

## Public packages

The bot package includes runnable source, tests and blank configuration. The addon package includes the production DLL, installation guide and buildable source. Private configuration, databases, keys, logs, test binaries and one-off maintenance files are excluded.
