import {ENABLED_MAPS,categoriesForMap,profileKey,milliseconds} from './domain.js';
import {readFileSync} from 'node:fs';

export function zwrUrl(map) {
  return map==='super-easter-egg'?'https://zwr.gg/leaderboards/bo3/Super-ee-speedrun/bo3-super-ee/':`https://zwr.gg/leaderboards/bo3/ee-speedrun/${map}/`;
}
const categories={'Mega Gums':'all-gobblegum','Classic Gums':'classic-gobblegum','No Gums':'no-gobblegum','Any%':'any-gobblegum'};
const text=s=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();
// Exact board IDs keep co-op, reversed Super and other gum categories separate.
export function parseZwr(html,map,checkedAt=Date.now()) {
  const records=[];
  for(const category of categoriesForMap(map)) {
    const gum=map==='super-easter-egg'&&category==='Any%'?'any-gums':categories[category];
    const board=map==='super-easter-egg'?`bo3-bo3-super-ee-Super-ee-speedrun-${gum}-1-board`:`bo3-${map}-ee-speedrun-${gum}-1-board`;
    const start=html.indexOf(`data-json="${board}"`);
    if(start<0)continue;
    const rest=html.slice(start);const end=rest.slice(1).search(/<div class="Board\b|<div class="SubBoard\b/);
    const section=end<0?rest:rest.slice(0,end+1);
    const row=section.match(/<div class="Row TopRank"[^>]*>([\s\S]*?)(?=<div class="Row\b|$)/)?.[1];
    if(!row || !/<div class="Rank">\s*1\s*<\/div>/.test(row))continue;
    const holder=text(row.match(/<div class="Name">([\s\S]*?)<\/div>/)?.[1]??'');
    const clock=text(row.match(/<a\b[^>]*class="Achieved"[^>]*>([\s\S]*?)<\/a>/)?.[1]??'');
    if(!holder||holder.length>100||!/^\d+(?::\d{2}){1,2}(?:\.\d+)?$/.test(clock))continue;
    const ms=milliseconds(clock);if(ms<=0||ms>604800000)continue;
    const profile={map,category,players:1,timing:'RealTime'};
    records.push({id:`zwr:${profileKey(profile)}`,kind:'zwr',profile,ms,holder,source:zwrUrl(map),checkedAt});
  }
  return records;
}
export function startZwr(store,fetcher=fetch,log=console.log) {
  // Dated public-page snapshot also supports hosts blocked by ZWR's edge protection.
  // Never advance checkedAt unless an actual source fetch succeeds.
  const baseline=JSON.parse(readFileSync(new URL('./zwr-baseline.json',import.meta.url),'utf8'));
  for(const record of baseline)if(!store.get('metadata',record.id))store.put('metadata',record.id,record);
  let stopped=false,busy=false;const abort=new AbortController();
  async function refresh(){
    if(busy||stopped)return;busy=true;
    try{for(const {id:map}of ENABLED_MAPS){
      if(stopped)break;
      const cached=store.list('metadata').filter(r=>r.kind==='zwr'&&r.profile.map===map);
      if(cached.length===categoriesForMap(map).length&&cached.every(r=>store.clock()-r.checkedAt<21600000))continue;
      try{
        const r=await fetcher(zwrUrl(map),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        let html='';for await(const chunk of r.body){html+=Buffer.from(chunk).toString('utf8');if(html.length>8000000)throw new Error('Page too large');}
        const records=parseZwr(html,map,store.clock());
        if(!records.length)throw new Error('No matching Solo records found');
        if(!stopped)for(const record of records)store.put('metadata',record.id,record);
      }catch(e){if(!stopped)log(`ZWR ${map}: ${e.message}; retaining last checked cache.`);}
    }}finally{busy=false;}
  }
  void refresh();const timer=setInterval(refresh,21600000);timer.unref?.();
  return ()=>{stopped=true;clearInterval(timer);abort.abort();};
}
