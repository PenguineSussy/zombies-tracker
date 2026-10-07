# Dr Monty Bot — LiveSplit addon 0.2.7

Tracks Black Ops III Solo Easter Egg runs in RTA. No separate companion or terminal is needed.

## Install or update

1. Save your splits and layout, then close LiveSplit.
2. Extract the ZIP and copy `LiveSplit.ZombiesTracker.dll` into LiveSplit's `Components` folder.
3. Reopen LiveSplit. Choose **Edit Layout → + → Other → Zombies Tracker**. Add it only once. When updating, keep your existing component.
4. On https://doctormonty.beer, open **LiveSplit**, register or sign in, and enable the LiveSplit addon source.
5. Open the component's settings. Enter the server URL and your private runner key, enable upload, and save your layout.
6. Check the detected map/category before starting. Use Practice for test runs.

Your key is encrypted for your Windows account. Do not share configured layouts or keys. Updates are installed manually while LiveSplit is closed.

## Map and category detection

Use clear split-file metadata, for example:

- Game: `Call of Duty: Black Ops III`
- Category: `Der Eisendrache - Mega Gums - Solo`

Detection reads map/category metadata, run labels, saved filename and recognizable split names. It does not inspect game memory. A recognized BO3 game name and supported map are required. Blank or other game names stop tracking, even with a map override. A map override must match the detected map; it cannot enable an unknown or disabled map. If detection is unclear, correct the Game Name and Category Name in Edit Splits. Category overrides remain available.

Categories: **No Gums, Classic Gums, Mega Gums, Any%**. Zetsubou No Shima and Super Easter Egg exclude No Gums. Ascension and Shangri-La allow only Any%. Multiplayer labels block uploads.

The addon uses your own split names; no aliases are required. Names must be unique, 1–80 characters and contain no `<`, `>` or `@`. Reset before changing run details.

## What it tracks

- Live timer, checkpoints, starts, finishes, pauses, undo and resets.
- Loaded split-file attempt count, separately from tracked session resets.
- RTA Personal Best and its checkpoint times, saved best cumulative splits and best segments.

Comparisons are read independently of the selected display comparison. The addon does not change your comparisons or split layout. Deleted history cannot be recovered. Saved PBs are runner-provided records, not verified leaderboard submissions.

## Super Easter Egg

Use one continuous timer with all six maps; Revelations must be last. Keep each map's splits together. Prefix checkpoints with their map and finish each map with a completion marker:

1. `SOE - Complete`
2. `The Giant - Complete`
3. `DE - Complete`
4. `ZNS - Complete`
5. `GK - Complete`
6. `Revelations - Complete`

Do not reset between maps. All times are cumulative LiveSplit RTA. The website can lag briefly behind LiveSplit while updates arrive.

## Connection help

Use only one upload source per runner. Events queue securely during brief outages and retry in order. Restarting LiveSplit does not preserve attempt continuity.

- **401/403:** check your runner key.
- **409:** check the selected website source and stop duplicate uploaders.
- **400:** check map/category, split names and your Windows clock.
- **Unsupported game/map:** tracking is paused. Use a supported BO3 split file and correct its game/map labels. The website will go offline after its connection timeout; previous history is retained.
- **No category:** use clear category metadata or select a category override.
- **Queue/storage error:** restore connectivity or disk access. Review pending uploads before discarding them; discarding permanently removes unsent events and is allowed only while reset.

## Source and building

All addon source is in `source/` in this download and `livesplit-addon/` in the repository. On Windows, with LiveSplit installed:

```powershell
.\build.ps1 -LiveSplitDir 'C:\livesplit'
```

The build uses the installed .NET Framework compiler and LiveSplit's own assemblies. The result is `dist/LiveSplit.ZombiesTracker.dll`. LiveSplit assemblies are not redistributed.

Run `test.ps1` for native tests. The HTTP integration test requires the full bot repository; see its `DEVELOPMENT.md`. Never install the test-only DLL from `test-bin`: the release DLL uses Windows DPAPI for key protection.
