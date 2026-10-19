# Dr Monty Bot — LiveSplit addon 1.0.8

Tracks Solo Easter Egg runs in BO2 and BO3. BO2 uses LiveSplit Game Time (IGT) as the primary timer and shows Real Time (RTA) alongside it when available. BO3 keeps RTA primary with optional IGT.

## Install or update

Save your layout and close LiveSplit. Copy LiveSplit.ZombiesTracker.dll into Components, reopen LiveSplit, and add Other → Zombies Tracker once in Edit Layout. Enter https://doctormonty.beer and your private runner key, enable upload, Apply and save the layout. Existing split aliases are preserved. Update only after your run.

## Game and category detection

Use Black Ops II Zombies or Black Ops III Zombies as Game Name, or select the matching game in the component Game selector. Call of Duty and numeric/Roman-numeral variants are supported, including BOII Zombies. Identify the map in Additional Info, Category Name or the split-file name. Explicit game conflicts are rejected; BO2 Origins and BO3 Origins remain separate. Supported BO2 maps are TranZit, Die Rise, Buried, Mob of the Dead and Origins. Nuketown and co-op are excluded.

For TranZit, Die Rise and Buried, identify Bank/No Bank and Richtofen/Maxis (for example TranZit - No Bank Richtofen - Solo). Conflicting bank/side metadata is rejected. Mob and BO2 Origins use Standard. BO3 uses No Gums, Classic Gums, Mega Gums or Any%; Zetsubou/Super exclude No Gums, and Ascension/Shangri-La use Any%. Additional Info map, category and Easter Egg speedrun-type metadata is read.

BO2 requires initialized IGT. Missing Game Time pauses capture rather than substituting RTA. Split capture, records, undo and reset read LiveSplit directly; the addon never renames your segments or changes comparisons. No separate companion is required. Native T6 settings masks are not inspected: recognizable names or explicit per-map aliases identify custom splits.

## Split names and aliases

BO2 uses Fly 1–3 and End. Flight/Plane and legacy final names (such as Freedom or Headphones) remain aliases. Custom names can be mapped in the component Split aliases table. The editor automatically follows the map detected from your loaded LiveSplit splits, even with uploading disabled. Switching from DE Mega Gums to SOE Any% shows SOE's saved aliases, or a blank table if none exist; returning to DE restores its aliases. Aliases are shared across categories of the same map. Existing saved mappings are retained, and incomplete edits must be finished or deleted before the editor switches maps. Unrecognized runs show an empty, disabled table without deleting saved aliases. Categories are filtered to the selected or detected game/map.

Map the exact LiveSplit name to a tracker split, finish or reset, Apply and save the layout to retain edits after restarting LiveSplit. Saved aliases take priority over automatic hints. Super Easter Egg remains BO3-only and requires all six core maps with Revelations last; use map-prefixed aliases and Map - Complete markers.

## Tracking and updates

Bot results, statistics and live activity ignore runs/splits below 5.000 seconds of the primary timer. Resets count once the run reaches five seconds. Raw snapshots remain available internally for reconnect and undo integrity. LiveSplit uploads have priority; optional therun.gg fallback waits for a safe new-run/reset boundary. Never share your runner key or configured layouts. The key and persistent queue use Windows encryption.

Update notices use the official server and repository manifest. The distributable includes only the tracker component; LiveSplit supplies its own dependencies. Real T6 gameplay checks are scheduled after this release.
