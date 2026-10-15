import {profileKey} from './domain.js';

export const DIRECT_TIMEOUT=30000;
export const activeSource=p=>p.activeSource??p.source?.type??'direct';
export const directConnected=(p,now)=>p.directLastSeen!=null&&now-p.directLastSeen<=DIRECT_TIMEOUT;

// Called within the ingestion transaction. The saved therun configuration is
// never replaced by an addon heartbeat. Source cursors survive server restarts.
export function routeSource(store,p,s,provider){
 if(provider==='therun'&&p.source?.type!=='therun')return {skip:'source-changed'};
 if(p.source?.type!=='therun'){p.activeSource='direct';return {snapshot:s};}
 const now=store.clock(),state=p.sourceRouting??={};
 if(provider==='therun'){
  if(directConnected(p,now)){
   state.blockedAttempt=s.attemptId;state.observedDuringDirect=true;
   store.savePlayer(p);return {skip:'direct-connected'};
  }
  if(state.waitForFallback){
   // If no upstream sample was seen during addon ownership, the first sample
   // is only a baseline. It may be the same run, even if it has finished.
   if(!state.observedDuringDirect){state.blockedAttempt=s.attemptId;state.observedDuringDirect=true;store.savePlayer(p);return {skip:'waiting-for-new-therun-attempt'};}
   if(s.attemptId===state.blockedAttempt)return {skip:'waiting-for-new-therun-attempt'};
   // A stale cached reset/run is not a safe source handover either.
   if(now-s.observedAt>DIRECT_TIMEOUT)return {skip:'stale-therun-update'};
   state.waitForFallback=false;
  }
  if(activeSource(p)==='direct'){s.resetEvent=false;s.suppressAlerts=true;}
  p.activeSource='therun';return {snapshot:s};
 }
 // Drain queued pre-connection samples without allowing them to take ownership
 // or resurrect runs already collected from therun.gg.
 if(now-s.observedAt>DIRECT_TIMEOUT)return {skip:'stale-direct-replay'};
 if(state.duplicateDirectAttempt===s.attemptId){p.directLastSeen=now;store.savePlayer(p);return {skip:'already-recorded-by-therun'};}
 const previous=p.activeAttempt&&store.get('attempts',p.activeAttempt);
 if(activeSource(p)==='therun'){
  s.suppressAlerts=true;
  state.observedDuringDirect=false;
  state.blockedAttempt=previous?.attemptId;
  const shared=s.splits.filter(v=>previous?.splits.some(old=>old.index===v.index));
  const matchingPrefix=shared.length>0&&shared.every(v=>previous.splits.some(old=>old.index===v.index&&old.ms===v.ms));
  const sameProfile=previous&&profileKey(previous.profile)===profileKey(s.profile)&&previous.practice===s.practice;
  if(sameProfile&&previous.phase==='Ended'&&matchingPrefix&&s.splits.length<=previous.splits.length&&s.elapsedMs<=previous.elapsedMs&&Math.abs(s.observedAt-previous.observedAt)<=DIRECT_TIMEOUT){
   state.duplicateDirectAttempt=s.attemptId;p.directLastSeen=now;p.activeSource='direct';state.waitForFallback=true;store.savePlayer(p);return {skip:'already-recorded-by-therun'};
  }
  // Preserve the original snapshot in storage, but exclude a superseded partial
  // copy from records, reset totals, activity and pending alerts.
  const nearbyStart=previous&&Math.abs((previous.observedAt-previous.elapsedMs)-(s.observedAt-s.elapsedMs))<=DIRECT_TIMEOUT;
  if(sameProfile&&['Running','Paused'].includes(previous.phase)&&s.phase!=='NotRunning'&&(matchingPrefix||nearbyStart)){
   s.handover={splits:previous.splits,notified:previous.notified??[],startedAt:previous.startedAt,pacePb:previous.pacePb};
   previous.supersededBy=`${p.id}:${s.attemptId}`;previous.closed=true;previous.closedAt=now;store.saveAttempt(previous);
   for(const job of store.list('outbox'))if(job.attempt===previous.id&&job.status==='pending'){job.status='cancelled';store.put('outbox',job.id,job);}
   for(const event of store.list('metadata'))if(event.kind==='runner-activity'&&event.attempt===previous.id)store.db.prepare('DELETE FROM metadata WHERE id=?').run(event.id);
   p.activeAttempt=null;
  }
 }
 state.waitForFallback=true;p.directLastSeen=now;p.activeSource='direct';p.sourceError=null;
 return {snapshot:s};
}
