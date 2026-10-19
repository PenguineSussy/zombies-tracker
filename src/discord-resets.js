import {eligibleTime} from './minimum-run.js';
import {profileLabel} from './domain.js';
import {runTime} from './reply-format.js';
import {resolveSplits} from './split-rules.js';

export function queueDiscordReset(store,p,a,old){
 const now=store.clock();
 // Confirmed resets close delivered alerts even after delayed telemetry.
 // Freshness suppression still applies to new milestone pings.
 if(!old||old.id===a.id||!old.resetObserved||a.phase!=='NotRunning'||a.resetEvent===false||old.practice||!p.public||!eligibleTime(old.elapsedMs))return;
 const lastSplit=resolveSplits(old.profile,old.splits).reduce((last,split)=>!last||split.index>last.index?split:last,null);
 for(const sent of store.list('outbox')){
  if(sent.type==='reset'||sent.status!=='sent'||!/^\d+$/.test(sent.messageId??'')||sent.attempt!==old.id)continue;
  // A delivered alert follows the run through later, unannounced splits.
  // Still exclude alerts whose checkpoint was removed or changed by undo.
  if(!old.splits.some(s=>s.index===sent.split.index&&s.ms===sent.split.ms))continue;
  const sub=store.get('subscriptions',sent.subscription);
  if(!sub?.enabled)continue;
  const id=`${sent.id}:reset`;
  if(store.get('outbox',id))continue;
  store.put('outbox',id,{id,type:'reset',attempt:old.id,player:p.id,subscription:sub.id,replyTo:sent.messageId,split:{ms:old.elapsedMs},channel:sent.channel,role:null,status:'pending',tries:0,nextTry:now,createdAt:now,
   content:`${p.name} | ${profileLabel(old.profile)}\nReset at ${runTime(old.elapsedMs,old.igtMs,old.profile,old.realTime?.elapsedMs)} after ${lastSplit.displayName??lastSplit.name}.`});
 }
}
