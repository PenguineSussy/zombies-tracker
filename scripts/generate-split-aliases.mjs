import {writeFileSync} from 'node:fs';
import {SPLIT_RULES} from '../src/split-rules.js';
import {BO2_SPLITS,bo2Splits} from '../src/bo2-splits.js';
const combined={...SPLIT_RULES};
for(const map of Object.keys(BO2_SPLITS)){const groups=map==='bo2-tranzit'?['Bank Richtofen','Bank Maxis'].map(category=>bo2Splits({map,category})): [bo2Splits({map})];combined[map]=groups.flat();}
const entries=[];
for(const [map,rules] of Object.entries(combined))for(const alias of new Set(rules.flatMap(r=>r.aliases))){const hits=rules.filter(r=>r.aliases.includes(alias));if(new Set(hits.map(r=>r.name)).size===1)entries.push(`{${JSON.stringify(map+'|'+alias)},${JSON.stringify(hits[0].name)}}`);}
writeFileSync('livesplit-addon/SplitAliases.cs','// Generated from src/split-rules.js; regenerate with node scripts/generate-split-aliases.mjs.\nusing System.Collections.Generic;\nnamespace LiveSplit.ZombiesTracker { public static class SplitAliases {\npublic static string[] Canonical(string map) { return System.Linq.Enumerable.ToArray(System.Linq.Enumerable.Distinct(System.Linq.Enumerable.Select(System.Linq.Enumerable.Where(Names, p=>p.Key.StartsWith(map+"|")),p=>p.Value))); }\nstatic readonly Dictionary<string,string> Names = new Dictionary<string,string> {\n'+entries.join(',\n')+'\n};\npublic static string Known(string map,string name) { string value; return Names.TryGetValue(map+"|"+Detector.Normalize(name),out value)?value:null; }\n} }\n');
