# Dr Monty Bot — LiveSplit addon 1.1.0

Tracks Solo Easter Egg runs in BO2, BO3 and Infinite Warfare. BO2 and IW use LiveSplit Game Time (IGT) as the primary timer and shows Real Time (RTA) alongside it when available. BO3 keeps RTA primary with optional IGT.

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

## Automatic categories in 1.1.0

Automatic BO3 categories use Additional Info: Easter Egg follows Gobblegum Loadout (blank defaults to Mega Gums), while Any% ignores it. Map-only BO2 Victis runs default to Bank Richtofen. Category and alias dropdowns stay separated by game, preserving saved mappings. Explicit No Bank/Maxis choices and conflicting-category checks are retained. BO2 Origins and Mob of the Dead remain Standard; BO3 Ascension and Shangri-La remain Any%-only. Manual category overrides take priority.

## Automatic saved PB sync

Choose your splits folder in Zombies Tracker settings, click Apply, close settings with OK, and save the layout. While enabled, the addon scans saved `.lss` files and subfolders every minute. Save changes in LiveSplit before syncing. Folder sync pauses in Practice mode.

Use a folder containing only your own real runs; practice or someone else’s saved files cannot reliably be identified from `.lss` data. Supported solo map/category profiles are detected per file, independently of the loaded run. BO2 requires a saved IGT PB; BO3 requires RTA. Super EE uses your saved aliases. Missing, unsupported or ambiguous files are skipped, with details in the settings panel.

The fastest imported PB is kept per profile and appears through `!pb` on the site and chats. Imports never create sessions, change online status, or send announcements. They do not import split histories or segment records. Clear the folder setting to stop syncing; previously imported PBs remain.

Infinite Warfare supports Fate, FF, DC Fate and DC FF. Mephistopheles Super supports DC Fate/DC FF only. BO2 Victis Super supports Richtofen/Maxis without Bank variants. Map, category and alias selectors are separated by game; category-incompatible aliases stay saved while hidden.
