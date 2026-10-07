import {runnerArchived} from './runner-visibility.js';
import {profileKey,MAPS} from './domain.js';
const entries=store=>store.list('metadata').filter(v=>v.kind==='runner-activity');
const same=(a,b)=>a.index===b.index&&a.name===b.name&&a.ms===b.ms;
export function recordActivity(store,p,a,previous,old){
 const now=store.clock();
 // Undo retracts the affected checkpoints and any finish/PB result.
 for(const e of entries(store))if(e.attempt===a.id&&((e.split&&!a.splits.some(s=>same(s,e.split)))||(['pb','finish'].includes(e.type)&&(a.phase!=='Ended'||!a.complete))))store.db.prepare('DELETE FROM metadata WHERE id=?').run(e.id);
 if(!p.public||a.practice||a.suppressAlerts||now-a.observedAt>30000)return;
 const add=(type,attempt,extra={})=>{
  const id=`activity:${attempt.id}:${type}:${extra.split?.index??''}`;
  if(store.get('metadata',id))return;
  store.put('metadata',id,{id,kind:'runner-activity',player:p.id,attempt:attempt.id,profile:attempt.profile,type,at:now,...extra});
 };
 if(old&&old.id!==a.id&&old.resetObserved&&!old.practice&&now-old.observedAt<=30000&&a.phase==='NotRunning'&&a.resetEvent!==false)add('reset',old,{ms:old.elapsedMs});
 if(previous&&['Running','Paused'].includes(previous.phase)&&now-previous.observedAt<=30000){
  const finished=a.phase==='Ended'&&a.complete&&a.splits.at(-1)?.ms===a.elapsedMs;
  for(const split of a.splits)if(!previous.splits.some(s=>same(s,split))&&!(finished&&split===a.splits.at(-1)))add('split',a,{split,ms:split.ms});
  if(finished){
   const saved=store.get('metadata',`saved-records:${p.id}:${profileKey(a.profile)}`)?.pbMs;
   const times=store.attempts(p.id).filter(h=>h.id!==a.id&&!h.practice&&h.phase==='Ended'&&h.complete&&profileKey(h.profile)===profileKey(a.profile)).map(h=>h.elapsedMs);
   const best=Math.min(...[saved,...times].filter(v=>Number.isFinite(v)&&v>0));
   add(Number.isFinite(best)&&a.elapsedMs<best?'pb':'finish',a,{ms:a.elapsedMs,split:a.splits.at(-1)});
  }
 }
 const sorted=entries(store).sort((a,b)=>b.at-a.at);
 for(const [i,e]of sorted.entries())if(i>=100||now-e.at>86400000)store.db.prepare('DELETE FROM metadata WHERE id=?').run(e.id);
}
export function publicActivity(store){
 return entries(store).filter(e=>store.clock()-e.at<=3600000&&store.get('players',e.player)?.public&&!runnerArchived(store.get('players',e.player),store.clock())).sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id)).slice(0,20).map(e=>({id:e.id,runner:store.get('players',e.player).name,player:e.player,type:e.type,at:e.at,ms:e.ms,split:e.split?.displayName??e.split?.name,map:MAPS.find(m=>m.id===e.profile.map)?.name??e.profile.map,category:e.profile.category}));
}
