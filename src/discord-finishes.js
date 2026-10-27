import {eligibleTime} from './minimum-run.js';
import {profileKey,profileLabel} from './domain.js';
import {runTime} from './reply-format.js';

export function queueDiscordFinish(store,p,a,previous){
 const now=store.clock();
 if(a.phase!=='Ended'||!a.complete||a.practice||!p.public||a.suppressAlerts||!eligibleTime(a.elapsedMs)||now-a.observedAt>30000)return;
 const key=profileKey(a.profile);
 const saved=store.get('metadata',`saved-records:${p.id}:${key}`);
 const imported=store.get('metadata',`folder-pb:${p.id}:${key}`);
 const priorTimes=[saved?.pbMs,imported?.pbMs,...store.attempts(p.id).filter(v=>v.id!==a.id&&v.phase==='Ended'&&v.complete&&!v.practice&&profileKey(v.profile)===key).map(v=>v.elapsedMs)].filter(eligibleTime);
 const liveFinish=previous&&['Running','Paused'].includes(previous.phase);
 const pb=!!liveFinish&&priorTimes.length>0&&a.elapsedMs<Math.min(...priorTimes);
 const wrTime=store.get('metadata',`zwr:${key}`)?.ms;
 const wr=!!liveFinish&&eligibleTime(wrTime)&&a.elapsedMs<wrTime;
 const record=pb||wr;
 const channels=new Map();
 for(const sub of store.list('subscriptions')){
  if(!sub.enabled||(sub.player!=='*'&&sub.player!==p.id)||(!record&&profileKey(sub.profile)!==key))continue;
  if(!channels.has(sub.channel))channels.set(sub.channel,[]);
  channels.get(sub.channel).push(sub.id);
 }
 for(const [channel,subscriptions] of channels){
  const id=`${a.id}:finish:channel:${channel}`;
  if(store.get('outbox',id))continue;
  store.put('outbox',id,{id,type:'finish',attempt:a.id,player:p.id,subscription:subscriptions[0],subscriptions,channel,record,pb,wr,split:{ms:a.elapsedMs},status:'pending',tries:0,nextTry:now,createdAt:now,
   content:`${p.name} | ${profileLabel(a.profile)}\n${wr?'WR TIME BEATEN'+(pb?' / NEW PB':''):pb?'NEW PB':'Run completed'}: ${runTime(a.elapsedMs,a.igtMs,a.profile,a.realTime?.elapsedMs)}`});
 }
}
