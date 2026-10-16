import {readFileSync} from 'node:fs';
import {profile} from './domain.js';
const evidence=JSON.parse(readFileSync(new URL('./bo2-wr-splits.json',import.meta.url),'utf8'));
// Never infer missing events or reuse another category's timings.
export const BO2_WR_SPLITS=evidence.records.filter(r=>r.verifiedSplits.length).map(r=>({profile:profile({map:r.map,category:r.category}),recordId:r.recordId,holder:r.holder,listedMs:r.listedFinishMs,splits:r.verifiedSplits.map(s=>({...s,observedMs:s.ms,ms:s.name==='End'?r.listedFinishMs:s.ms,precisionMs:s.name==='End'?1000:s.precisionMs,...(s.name==='End'?{rounding:'floor'}:{})}))}));
