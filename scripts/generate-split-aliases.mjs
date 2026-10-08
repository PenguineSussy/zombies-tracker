import {writeFileSync} from 'node:fs';
import {SPLIT_RULES} from '../src/split-rules.js';
const entries=[];
for(const [map,rules] of Object.entries(SPLIT_RULES))for(const alias of new Set(rules.flatMap(r=>r.aliases))){const hits=rules.filter(r=>r.aliases.includes(alias));if(hits.length===1)entries.push(`{${JSON.stringify(map+'|'+alias)},${JSON.stringify(hits[0].name)}}`);}
writeFileSync('livesplit-addon/SplitAliases.cs','// Generated from src/split-rules.js; regenerate with node scripts/generate-split-aliases.mjs.\nusing System.Collections.Generic;\nnamespace LiveSplit.ZombiesTracker { public static class SplitAliases {\nstatic readonly Dictionary<string,string> Names = new Dictionary<string,string> {\n'+entries.join(',\n')+'\n};\npublic static string Known(string map,string name) { string value; return Names.TryGetValue(map+"|"+Detector.Normalize(name),out value)?value:null; }\n} }\n');
