# Zombies Tracker for LiveSplit 0.2

Windows desktop LiveSplit component for https://doctormonty.beer. Tracks Solo Black Ops 3 Easter Egg speedruns in RTA, in No Gums, Classic Gums, Mega Gums, or Any%. No TCP server, PowerShell window, Node installation, or separate companion is needed to use this DLL.

## Install

1. Finish/reset your timer, save your splits/layout, and close LiveSplit.
2. Extract the addon ZIP. Copy `LiveSplit.ZombiesTracker.dll` into your LiveSplit `Components` folder. On this computer that is `C:\Program Files (x86)\Livesplit\Components`. Windows may request administrator permission for that folder.
3. Reopen LiveSplit. Right-click > Edit Layout > + > Other > Zombies Tracker. Add it only once. It is a background component with no visual timer area.
4. Double-click Zombies Tracker to open its settings (or select it in Layout Settings).
5. On https://doctormonty.beer, open Runner setup and register/sign in. A runner key from the old localhost installation is not valid here. Click **Enable LiveSplit addon source**.
6. Stop the old companion. In addon settings enter the server URL and your private runner key. Leave map/category on Automatic detection, or use the overrides when needed. Enable upload, click Apply, and save your LiveSplit layout.
7. Check the detection/status messages, start a test run, and look for your runner on the website. Mark practice tests as Practice to exclude them from records and alerts.

Your key is encrypted using Windows DPAPI in the saved layout and can only be decrypted by the same Windows account. Do not share configured layouts or runner keys. Automatic component updates are not enabled; replace the DLL manually while LiveSplit is closed.

## Automatic detection

Example Edit Splits fields:

* Game Name: `Call of Duty: Black Ops III`
* Category Name: `Der Eisendrache - No Gums - Solo`
* Filename (optional): `Der Eisendrache - No Gums.lss`

The addon checks game/category text, the split file's basename, and map/category metadata variables first. Full map names in segment names are a fallback. It also recognizes these conservative milestone pairs when no map is otherwise identified: Lightning/Storm Bow + Wisps (DE), KT4 + Masamune (ZNS), Dragon Egg + Valkyrie (GK), Apothicon Sword + Shadowman (SOE). Generic Bow, Power, Boss, or Crackle alone is not enough. Short map abbreviations are accepted only in run labels, not arbitrary segment names. This reads the split file; it does not inspect game memory or verify what the player is actually playing.

All ten enabled maps support detection from their names. Nacht, Verruckt, Shi No Numa and Kino remain disabled. Unknown/conflicting maps or gum categories pause uploads and show a settings message. Map and gum category overrides are available. Identified multiplayer labels (2P–4P, co-op, duo, etc.) block uploads even with a map override. Unlabeled player count is treated as Solo because this tracker is Solo-only; actual game player count cannot be verified from unlabeled splits.

Gum categories are detected from the category/file title and gum/category variables. Include `No Gums`, `Classic Gums`, `Mega Gums`, or `Any%`. The addon always reads `RealTime` from LiveSplit, irrespective of the display's selected timing method. RTA here means LiveSplit Real Time (which follows LiveSplit's pause behavior), not a game-memory-derived clock. Never pause the timer if your category disallows it.

Split names must be unique and 1–80 characters without `<`, `>` or `@`. Aliases map local names to shared milestone names. Changing run details during a run stops uploads until reset. Save the split file so its filename can participate in detection.

## Offline behavior and troubleshooting

Starts, splits, skips, undo, pauses/resumes, finishes and resets are captured through LiveSplit events. A heartbeat runs every five seconds while uploading. Network requests happen in the background. Pending events are saved in an encrypted, bounded queue under `%LOCALAPPDATA%\ZombiesTracker\LiveSplit`; they are retried in order. Recovered events suppress notifications. An ordinary brief network outage retains the attempt ID. Restarting LiveSplit creates a new observed attempt after draining queued events; no attempt continuity across a process restart is promised.

Only run one uploader per runner: the addon, the old companion, or therun.gg. Duplicate addon instances for the same server/key are blocked. A separate old companion cannot be detected automatically.

* HTTP 401/403: check the runner key and whether it was rotated. Reset/finish, correct settings and Apply.
* HTTP 409: ensure the website source is Direct LiveSplit and stop other uploaders. Closed-attempt queue conflicts require reviewing/discarding the old pending queue and resetting LiveSplit. Nothing is silently deleted.
* HTTP 400: verify category, names, timer values and your Windows clock. Correct the issue before retrying. An invalid queued event may require explicitly discarding the queue.
* Queue full/storage error: stop tracking and restore connectivity/disk access. Capacity is 10,000 events; new events cannot be recorded beyond it. A Windows/account change may make DPAPI data unreadable.
* Discard pending uploads permanently removes unsent updates, with an explicit confirmation. It is only allowed while the timer is reset.
* No map/category: rename your category as shown above, or select an override. Check settings before running. The addon cannot infer an unlabeled gum loadout.

## Build and validation

Source is included. Run `build.ps1 -LiveSplitDir 'path to LiveSplit'` from a terminal only if rebuilding. The installed .NET Framework C# compiler is used, with references to LiveSplit.Core, UpdateManager and SpeedrunComSharp from your LiveSplit installation. No LiveSplit assemblies are redistributed in this archive.

Built against the local LiveSplit installation. Automated tests use the actual LiveSplit TimerModel and a local tracker HTTP/SQLite fixture. The test-only binary substitutes the DPAPI codec because the development sandbox cannot access the interactive Windows user's DPAPI profile. **The shipped `dist` DLL uses real DPAPI and fails closed if encryption is unavailable.** Interactive layout installation and DPAPI persistence still need a check in your normal LiveSplit session. Do not install a DLL from `test-bin`.

Source API reference: https://github.com/LiveSplit/LiveSplit/tree/master/src/LiveSplit.Core
