import {readFileSync} from 'node:fs';
import {profile,milliseconds} from './domain.js';
const evidence=JSON.parse(readFileSync(new URL('./iw-wr-splits.json',import.meta.url),'utf8'));
export const IW_WR_SPLITS=evidence.records.map(r=>({profile:profile({map:r.map,category:r.category}),recordId:r.recordId,holder:r.holder,listedMs:r.listedMs,splits:r.splits.map(s=>({name:s.name,ms:milliseconds(s.time),precisionMs:1000}))}));
