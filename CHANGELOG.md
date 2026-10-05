# 0.3.0 — Dr Monty Bot community dashboard

* New branding and an original Widow's Wine-inspired spider/web emblem, requested copy and runner setup labels. Public operator forms and legacy companion references removed; admin APIs remain protected.
* Session statistics group maps/categories, current run, observed resets, duration, fastest complete finish, average cumulative checkpoint times and fastest checkpoints with sample counts. Practice and missing splits are excluded from time statistics; unobserved endings are not invented as resets. Short chat replies link to full runner statistics.
* Two selectable stream slots with one slot per runner and no chat. Runners add Twitch channel/YouTube broadcast links on the website. The bot verifies Twitch live status with Get Streams every minute; results expire after two minutes. Missing credentials/errors mean unknown. YouTube live status is runner-reported and expires after 12 hours. Stream links do not require LiveSplit.
* Versioned frontend assets and map-specific category fallback prevent blank lists when assets/catalogs overlap during deployment.
* Addon 0.2.1: unchanged settings preserve uploader and attempt; editor clones stay inactive; settings serialization errors cannot escape into the layout editor. The user's visual rendering issue still requires normal LiveSplit verification.

Validation: 35 Node tests, 52 addon assertions and 10 local HTTP/SQLite events. Twitch checks tested with API fixtures. No real chat messages or public test runs sent.

# 0.2.0 — Solo Easter Egg tracker

* New native LiveSplit component, with map/category detection from run metadata and split labels, explicit overrides, event capture and persistent retry queue.
* Only Solo Easter Egg RTA profiles can be submitted. Categories: No Gums, Classic Gums, Mega Gums, Any%.
* Removed objective, player count, rules, route and timing selectors from the dashboard. Map/category remain for manual mappings, the old companion and benchmarks.
* Runner setup includes an addon download and instructions. Direct-source control is shared by the native addon and legacy companion; use only one uploader at a time.
* Old history is preserved as Legacy rather than guessed into a new category. Existing companion configs/therun mappings must be regenerated with a category. No old stats are automatically reassigned.
* LiveSplit addon DLL requires installation and a valid key from the hosted tracker; the localhost key is a different account. See livesplit-addon/README.md.

* Map-specific categories: Zetsubou excludes No Gums; Ascension and Shangri-La are Any% only. The website filters choices and the server/addon reject unsupported combinations.
* Super Easter Egg uses one continuous six-map file, including The Giant and ending on Revelations. Map-prefixed checkpoints identify the current stage. Elapsed and checkpoint values come from LiveSplit Real Time; there is no independent tracker clock.

Validation: 31 Node tests, 47 addon assertions including actual LiveSplit TimerModel events and 11 accepted local HTTP/SQLite uploads. Offline replay/503 retention, exact paused RTA, map restrictions and six-map completion tested. DPAPI is used in the production DLL; interactive Windows DPAPI/layout persistence remains a manual check because the development sandbox cannot access the normal user's encryption profile. Test binaries are excluded from distribution.
