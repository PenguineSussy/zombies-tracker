import {replyProfile,deltaDuration} from './reply-format.js';
import {profileKey,profileLabel,time} from './domain.js';
import {resolveSplits} from './split-rules.js';
import {wrSplitLookup} from './wr-checkpoints.js';

export function capturePacePB(store,player,snapshot,id){
 const saved=snapshot.records??store.get('metadata',`saved-records:${player.id}:${profileKey(snapshot.profile)}`);
 const best=store.attempts(player.id).filter(a=>a.id!==id&&!a.practice&&a.complete&&a.phase==='Ended'&&profileKey(a.profile)===profileKey(snapshot.profile)).sort((a,b)=>a.elapsedMs-b.elapsedMs)[0];
 if(saved?.pbMs>0&&(!best||saved.pbMs<=best.elapsedMs)){
  // A tracked copy of the exact PB may supply splits missing in older addons.
  if(best?.elapsedMs===saved.pbMs&&saved.splits.every(s=>s.pbSplitMs==null))return {pbMs:best.elapsedMs,splits:best.splits.map(s=>({...s,name:s.originalName??s.name,pbSplitMs:s.ms}))};
  return {pbMs:saved.pbMs,splits:saved.splits.map(s=>({...s,index:s.index,name:s.name,pbSplitMs:s.pbSplitMs??null}))};
 }
 return best?{pbMs:best.elapsedMs,splits:best.splits.map(s=>({...s,name:s.originalName??s.name,pbSplitMs:s.ms}))}:null;
}

export function paceAnswer(store,p){
 const a=p.activeAttempt&&store.get('attempts',p.activeAttempt);
 const state=p.status==='offline'?' (offline; last recorded)':a?.phase==='Ended'?' (finished)':a?.phase==='Paused'?' (paused)':'';
 if(!a||a.phase==='NotRunning')return `${p.name}: No active run to compare. Start a run in LiveSplit.`;
 const current=resolveSplits(a.profile,a.splits,{timing:false}),last=current.at(-1);
 if(!last)return `${p.name}${state}: No completed split yet. PB pace appears after a split.`;
 const pb=a.pacePb??(a.phase!=='Ended'?capturePacePB(store,p,a,a.id):null);
 const reference=pb?resolveSplits(a.profile,pb.splits,{timing:false}):[];
 // Compare an identical split prefix. Extra/skipped/reordered splits cannot
 // silently be treated as the same PB route or index.
 const compatible=Array.from({length:last.index+1},(_,index)=>index).every(index=>{
  const actual=current.find(s=>s.index===index),expected=reference.find(s=>s.index===index);
  return actual&&expected&&actual.name===expected.name;
 });
 const ref=compatible?reference.find(s=>s.index===last.index)?.pbSplitMs:null;
 const deltaText=(value,baseline)=>`${deltaDuration(Math.abs(value-baseline))} ${value<baseline?'ahead of':value>baseline?'behind':'level with'}`;
 let result=ref!=null?`${last.displayName??last.name}: ${time(last.ms)} | ${deltaText(last.ms,ref)} PB`:
  !pb?'PB pace unavailable: no saved PB yet.':!compatible?'PB pace unavailable: split layout does not match the PB.':'PB splits unavailable; update the LiveSplit addon and reconnect.';
 const benchmark=a.benchmark;
 const wrSplits=benchmark?resolveSplits(a.profile,Object.entries(benchmark.splits).map(([name,ms],index)=>({index,name,ms})),{timing:false}):[];
 const wrLookup=wrSplitLookup(store,a.profile,last.name),confirmed=wrLookup.split;
 const wrRef=confirmed?.ms??wrSplits.find(s=>s.name===last.name)?.ms;
 if(wrRef!=null){
  const precision=confirmed?.precisionMs??50;
  const actual=Math.round(last.ms/precision)*precision;
  result+=` · ${precision===1000?'Approximately ':''}${deltaText(actual,wrRef)} WR split`;
 }
 else {const wr=store.get('metadata',`zwr:${profileKey(a.profile)}`);result+=` WR Split unavailable: ${wrLookup.reason}.`;if(wr?.ms!=null)result+=` WR finish: ${time(wr.ms)}.`;}
 return `${p.name}${state} | ${result} | ${replyProfile(a.profile)}${a.practice?' · Practice':''}`;
}
