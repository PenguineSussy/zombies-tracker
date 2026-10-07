# Dr Monty Bot


LiveSplit tracking and chat commands for **Call of Duty: Black Ops III Solo Easter Egg speedruns**.


## Downloads


- **[LiveSplit addon 0.2.8](https://github.com/PenguineSussy/zombies-tracker/releases/tag/livesplit-v0.2.8)** — for runners. Copy the DLL into LiveSplit.
- **[Bot 0.4.1](https://github.com/PenguineSussy/zombies-tracker/releases/tag/bot-v0.4.1)** — run your own tracker and chat service. Requires Node.js 24+ and your own platform credentials.


Both releases include source code. No runner keys, bot credentials, saved accounts, or production database are included.


## For runners


1. Open [Dr Monty Bot](https://doctormonty.beer) and register or sign in under **LiveSplit**.
2. Install the addon using its [installation guide](livesplit-addon/README.md).
3. Open **Chatbot**, connect your Twitch or YouTube channel, and make LittleMontyBot a moderator.


Browser sign-in lasts 30 days. Your runner key is needed to sign in again. Discord setup is currently deferred.


## Commands


In a connected chat, runner commands use that channel's linked runner. Add `@name` to check someone else; on the website, include it for runner commands.


| Command | Result |
| --- | --- |
| `!current` | Current run and checkpoint |
| `!session` | Session summary and resets |
| `!sessionpb` | Fastest completed run this session |
| `!pb map` | PB for the selected map |
| `!wr map` | Solo WR for the selected map |
| `!best split alltime` | Saved best split and best segment |
| `!best split session` | Session best split and segment |
| `!splits alltime` | Split bests; use `session` for session bests |
| `!pace` | PB pace plus available WR checkpoint comparisons |
| `!help` | Command list |


Replace `map` with a map name such as `DE`, and `split` with a checkpoint such as `Rocket`. Map PB/WR commands default to Mega Gums; append a category when needed. Chat cooldowns are adjustable from 5–300 seconds (default 15).


## What it tracks


- Live RTA, PB comparisons, best splits/segments, attempts and session resets.
- No Gums, Classic Gums, Mega Gums and Any%, with map-specific restrictions.
- Ten individual maps plus the six-map Super Easter Egg.
- Optional therun.gg input; Twitch and YouTube chat replies and opt-in announcements.
- WR finish records from ZWR and reviewed checkpoints for matching map/category records. Missing checkpoints stay unavailable; `~` marks whole-second estimates.


Stats are self-reported timer data. A faster time or checkpoint does not automatically verify an official WR.
Self-made rules document that help the bot with timing and commands: [LittleMontyBot Rules Document](https://docs.google.com/document/d/1arPynVeBmHWqB8ZAXyha9CtHKic2vv2ff9EL5_vCstw/edit?tab=t.0)