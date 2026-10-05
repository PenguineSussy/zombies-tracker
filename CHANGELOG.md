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
