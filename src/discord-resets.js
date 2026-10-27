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
 const jobs=store.list('outbox'),latestByChannel=new Map();
 for(const sent of jobs){
  if(['reset','finish','monitor'].includes(sent.type)||sent.status!=='sent'||!/^\d+$/.test(sent.messageId??'')||sent.attempt!==old.id)continue;
  // A delivered alert follows the run through later, unannounced splits.
  // Still exclude alerts whose checkpoint was removed or changed by undo.
  if(!old.splits.some(s=>s.index===sent.split.index&&s.ms===sent.split.ms))continue;
  const sub=store.get('subscriptions',sent.subscription);
  if(!sub?.enabled)continue;
  const previous=latestByChannel.get(sent.channel);
  if(!previous||BigInt(sent.messageId)>BigInt(previous.messageId))latestByChannel.set(sent.channel,sent);
 }
 for(const sent of latestByChannel.values()){
  const sub=store.get('subscriptions',sent.subscription);
  // Attempt IDs include the player; map/category alone must never deduplicate runs.
  const id=`${old.id}:reset:channel:${sent.channel}`;
  if(jobs.some(j=>j.type==='reset'&&j.attempt===old.id&&j.channel===sent.channel))continue;
  if(store.get('outbox',id))continue;
  store.put('outbox',id,{id,type:'reset',attempt:old.id,player:p.id,subscription:sub.id,replyTo:sent.messageId,split:{ms:old.elapsedMs},channel:sent.channel,role:null,status:'pending',tries:0,nextTry:now,createdAt:now,
   content:`${p.name} | ${profileLabel(old.profile)}\nReset at ${runTime(old.elapsedMs,old.igtMs,old.profile,old.realTime?.elapsedMs)} after ${lastSplit.displayName??lastSplit.name}.`});
 }
}
