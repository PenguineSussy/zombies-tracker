import {eligibleTime} from './minimum-run.js';
import {profileKey,profileLabel} from './domain.js';
import {runTime} from './reply-format.js';

export function queueDiscordFinish(store,p,a){
 const now=store.clock();
 if(a.phase!=='Ended'||!a.complete||a.practice||!p.public||a.suppressAlerts||!eligibleTime(a.elapsedMs)||now-a.observedAt>30000)return;
 const channels=new Map();
 for(const sub of store.list('subscriptions')){
  if(!sub.enabled||(sub.player!=='*'&&sub.player!==p.id)||profileKey(sub.profile)!==profileKey(a.profile))continue;
  if(!channels.has(sub.channel))channels.set(sub.channel,[]);
  channels.get(sub.channel).push(sub.id);
 }
 for(const [channel,subscriptions] of channels){
  const id=`${a.id}:finish:channel:${channel}`;
  if(store.get('outbox',id))continue;
  store.put('outbox',id,{id,type:'finish',attempt:a.id,player:p.id,subscription:subscriptions[0],subscriptions,channel,split:{ms:a.elapsedMs},status:'pending',tries:0,nextTry:now,createdAt:now,
   content:`${p.name} | ${profileLabel(a.profile)}\nRun completed: ${runTime(a.elapsedMs,a.igtMs,a.profile,a.realTime?.elapsedMs)}`});
 }
}
