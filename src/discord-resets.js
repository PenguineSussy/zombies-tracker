import {eligibleTime} from './minimum-run.js';
import {profileLabel} from './domain.js';
import {runTime} from './reply-format.js';

export function queueDiscordReset(store,p,a,old){
 const now=store.clock();
 if(!old||old.id===a.id||!old.resetObserved||a.phase!=='NotRunning'||a.resetEvent===false||old.practice||!p.public||a.suppressAlerts||now-a.observedAt>30000||now-old.observedAt>30000||!eligibleTime(old.elapsedMs))return;
 for(const sent of store.list('outbox')){
  if(sent.type==='reset'||sent.status!=='sent'||!/^\d+$/.test(sent.messageId??'')||sent.attempt!==old.id)continue;
  // Only follow up while this is still the last completed split. Undo or
  // reaching any later split ends the follow-up for this notification.
  if(!old.splits.some(s=>s.index===sent.split.index&&s.ms===sent.split.ms)||old.splits.some(s=>s.index>sent.split.index))continue;
  const sub=store.get('subscriptions',sent.subscription);
  if(!sub?.enabled)continue;
  const id=`${sent.id}:reset`;
  if(store.get('outbox',id))continue;
  store.put('outbox',id,{id,type:'reset',attempt:old.id,player:p.id,subscription:sub.id,replyTo:sent.messageId,split:{ms:old.elapsedMs},channel:sent.channel,role:null,status:'pending',tries:0,nextTry:now,createdAt:now,
   content:`${p.name} | ${profileLabel(old.profile)}\nReset at ${runTime(old.elapsedMs,old.igtMs,old.profile,old.realTime?.elapsedMs)} after ${sent.split.displayName??sent.split.name}.`});
 }
}
