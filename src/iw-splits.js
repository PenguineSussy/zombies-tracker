// Checkpoint names and order supplied by the site owner. Round 9 End is limited to non-DC Spaceland.
// No timing or position guesses: unknown names require an explicit alias.
export const IW_SPLITS = {
 "iw-mephistopheles-super":["Spaceland","Rave","Shaolin","Attack","Beast","Mephistopheles"],
  "iw-spaceland": [
    "PAP",
    "Seticom 1",
    "Seticom 2",
    "Seticom 3",
    "Round 9 End",
    "Boss Enter",
    "End"
  ],
  "iw-rave-in-the-redwoods": [
    "Boat 1",
    "Zipline",
    "Boat 2",
    "Boss Enter",
    "Boss Phase 1",
    "Boss Phase 2",
    "End"
  ],
  "iw-shaolin-shuffle": [
    "Symbols Start",
    "Morse Code",
    "Words",
    "Missing Reel",
    "Boss Enter",
    "End"
  ],
  "iw-attack-of-the-radioactive-thing": [
    "Death Reset",
    "PAP",
    "Bomb Complete",
    "Boss Enter",
    "End"
  ],
  "iw-beast-from-beyond": [
    "Red X Start",
    "Theater TP",
    "Bridge Complete",
    "Poster TP",
    "Boss Enter",
    "End"
  ]
};

export function iwSplits({map,category}={}) {
 return (IW_SPLITS[map]??[]).filter(name=>(name!=='Round 9 End'||map!=='iw-spaceland'||!['DC Fate','DC FF'].includes(category)) && (name!=='Death Reset'||map!=='iw-attack-of-the-radioactive-thing'||category==null||['DC Fate','DC FF'].includes(category)));
}
