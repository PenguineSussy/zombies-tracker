import {MAPS,profileKey,time} from './domain.js';
import {splitName} from './split-rules.js';

export const announcementDefaults=()=>({gold:false,pb:false,wr:false,communityWr:false});
const jobs=store=>store.list('metadata').filter(v=>v.kind==='chat-announcement');
const segment=(a,s)=>{const previous=a.splits.find(x=>x.index===s.index-1);return s.index===0?s.ms:previous?s.ms-previous.ms:null;};
const matching=(a,b)=>a.index===b.index&&a.name===b.name&&a.ms===b.ms;
const context=a=>`${MAPS.find(m=>m.id===a.profile.map)?.name??a.profile.map} / ${a.profile.category}`;

// Called before the new snapshot overwrites saved comparisons. Only a newly observed
// transition can announce; connecting to an existing run never replays old results.
export function queueAnnouncements(store,p,a,previous) {
  const now=store.clock();
  for(const j of jobs(store).filter(j=>j.player===p.id&&j.status==='pending')) {
    if(j.attempt!==a.id||!a.splits.some(s=>matching(s,j.split))||(j.type!=='gold'&&(a.phase!=='Ended'||!a.complete||a.elapsedMs!==j.ms))) {
      store.put('metadata',j.id,{...j,status:'cancelled'});
    }
  }
  if(!previous||!['Running','Paused'].includes(previous.phase)||a.practice||!p.public||a.suppressAlerts||now-a.observedAt>30000||now-previous.observedAt>30000)return;
  const channels=store.list('metadata').filter(c=>c.kind==='chat-connection'&&(c.player===p.id||c.announcements?.communityWr===true)&&c.connected&&c.enabled&&c.target&&['twitch','youtube'].includes(c.provider));
  if(!channels.some(c=>Object.values(c.announcements??{}).some(Boolean)))return;
  const saved=store.get('metadata',`saved-records:${p.id}:${profileKey(a.profile)}`);
  const history=store.attempts(p.id).filter(v=>v.id!==a.id&&!v.practice&&profileKey(v.profile)===profileKey(a.profile));
  const events=[];
  for(const s of a.splits) {
    if(previous.splits.some(v=>matching(v,s)))continue;
    const ms=segment(a,s);if(ms==null||ms<=0)continue;
    const prior=saved?.splits.find(v=>v.index===s.index&&v.name===s.name);
    const predecessor=a.splits.find(v=>v.index===s.index-1)?.name;
    const values=[];
    if(prior?.bestSegmentMs>0&&(s.index===0||saved.splits[s.index-1]?.name===predecessor))values.push(prior.bestSegmentMs);
    for(const h of history){const v=h.splits.find(v=>v.index===s.index&&(v.originalName??v.name)===s.name);if(!v)continue;const before=h.splits.find(x=>x.index===s.index-1);if(s.index>0&&(before?.originalName??before?.name)!==predecessor)continue;const value=segment(h,v);if(value>0)values.push(value);}
    const before=Math.min(...values);
    if(Number.isFinite(before)&&ms<before)events.push({type:'gold',split:s,ms,before,label:splitName(a.profile,s.displayName??s.name)});
  }
  const last=a.splits.at(-1);
  if(a.phase==='Ended'&&a.complete&&last&&last.ms===a.elapsedMs) {
    const before=Math.min(...[saved?.pbMs,...history.filter(v=>v.phase==='Ended'&&v.complete).map(v=>v.elapsedMs)].filter(v=>Number.isFinite(v)&&v>0));
    if(Number.isFinite(before)&&a.elapsedMs<before)events.push({type:'pb',split:last,ms:a.elapsedMs,before});
    const wr=store.get('metadata',`zwr:${profileKey(a.profile)}`);
    if(wr?.ms>0&&a.elapsedMs<wr.ms)events.push({type:'wr',split:last,ms:a.elapsedMs,before:wr.ms});
  }
  for(const c of channels)for(const event of events) {
    if(c.player===p.id?c.announcements?.[event.type]!==true:event.type!=='wr'||c.announcements?.communityWr!==true)continue;
    const id=`chat-announcement:${c.provider}:${c.target}:${a.id}:${event.type}:${event.split.index}`;
    if(store.get('metadata',id))continue;
    store.put('metadata',id,{...event,id,kind:'chat-announcement',provider:c.provider,target:c.target,channelId:c.channelId,player:p.id,recipient:c.player,attempt:a.id,profile:a.profile,runner:p.name,status:'pending',dueAt:now+15000,createdAt:now});
  }
}

export function announcementText(j,limit=450) {
  const label=j.type==='gold'?`${j.label} segment`:j.type==='pb'?'PB':'listed WR';
  const result=`@${j.runner} ${j.type==='gold'?'GOLD':j.type==='pb'?'NEW PB':'WR TIME BEATEN'}! ${label}: ${time(j.ms)} RTA (previous ${time(j.before)}, improved by ${time(j.before-j.ms)}). ${context(j)}`;
  return result.length<=limit?result:result.slice(0,limit-1)+'…';
}

export async function deliverAnnouncements(store,provider,send) {
  const now=store.clock();
  // One message per pass/provider. Persistent claim avoids duplicate posts after
  // restart or an ambiguous network response; failed sends require no blind retry.
  for(const j of jobs(store).filter(j=>j.provider===provider&&j.status==='pending'&&j.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt)) {
    const p=store.get('players',j.player),a=store.get('attempts',j.attempt),c=store.get('metadata',`chat-connection:${provider}:${j.recipient}`);
    const valid=p?.public&&p.activeAttempt===j.attempt&&now-p.lastSeen<=30000&&a&&!a.closed&&!a.practice&&!a.suppressAlerts&&a.splits.some(s=>matching(s,j.split))&&(j.type!=='gold'||segment(a,j.split)===j.ms)&&c?.connected&&c.enabled&&c.target===j.target&&c.channelId===j.channelId&&(j.recipient===j.player?c.announcements?.[j.type]===true:j.type==='wr'&&c.announcements?.communityWr===true)&&now-j.createdAt<=120000&&(j.type==='gold'||(a.phase==='Ended'&&a.complete&&a.elapsedMs===j.ms));
    if(!valid){store.put('metadata',j.id,{...j,status:'cancelled'});continue;}
    if(j.type==='wr'){const wr=store.get('metadata',`zwr:${profileKey(j.profile)}`);if(!wr||wr.ms<=j.ms){store.put('metadata',j.id,{...j,status:'cancelled'});continue;}j.before=wr.ms;}
    const throttleKey=`chat-announcement-last:${provider}:${j.target}`;
    if(now-(store.get('metadata',throttleKey)?.at??0)<Math.max(15000,(c.cooldownSeconds??15)*1000))continue;
    store.put('metadata',throttleKey,{at:now});
    store.put('metadata',j.id,{...j,status:'sending'});
    try {await send(j.target,announcementText(j,provider==='youtube'?200:450));store.put('metadata',j.id,{...j,status:'sent',sentAt:now});}
    catch {store.put('metadata',j.id,{...j,status:'failed'});}
    break;
  }
}

export function startAnnouncements(store,provider,send,ready=()=>true) {
  let busy=false,stopped=false;
  const timer=setInterval(async()=>{if(busy||stopped||!ready())return;busy=true;try{await deliverAnnouncements(store,provider,async(...args)=>{if(stopped)throw new Error('Connector stopped');await send(...args);});}finally{busy=false;}},5000);
  timer.unref?.();return()=>{stopped=true;clearInterval(timer);};
}
