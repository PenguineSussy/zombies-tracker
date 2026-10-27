import {createHash} from 'node:crypto';
import {eligibleTime} from './minimum-run.js';
import {profileLabel} from './domain.js';
import {runTime} from './reply-format.js';

// Explicitly configured monitoring destination; never used as a normal subscription.
export const monitoringChannel='1557961674567188511';

export function queueMonitor(store,{id,player,attempt,content,source,split}){
 const channel=store.discordMonitorChannel;
 if(!channel||source?.channel===channel)return;
 const jobId=`monitor:${channel}:${id}`;
 if(store.get('outbox',jobId))return;
 const now=store.clock();
 store.put('outbox',jobId,{id:jobId,type:'monitor',player,attempt,split,channel,source,
  content:content.slice(0,1900),status:'pending',tries:0,nextTry:now,createdAt:now});
}

export function queueUnmatchedSplit(store,p,a,split){
 if(!store.discordMonitorChannel)return;
 const jobs=store.list('outbox');
 if(jobs.some(j=>j.type!=='monitor'&&j.attempt===a.id&&j.split?.index===split.index&&j.split?.ms===split.ms&&['pending','sent'].includes(j.status)))return;
 queueMonitor(store,{id:`split:${a.id}:${split.index}:${split.ms}`,player:p.id,attempt:a.id,split,
  content:`[Monitoring · no qualifying alert]\n${p.name} | ${profileLabel(a.profile)}\n${split.displayName??split.name}: ${runTime(split.ms,split.igtMs,a.profile,a.realTime?.splits.find(s=>s.index===split.index)?.ms)}`});
}

export async function deliverMonitor(store,token,fetcher){
 const now=store.clock();
 for(const job of store.list('outbox').filter(j=>j.type==='monitor'&&j.status==='pending'&&j.nextTry<=now).slice(0,10)){
  const p=store.get('players',job.player),a=store.get('attempts',job.attempt);
  if(job.channel!==store.discordMonitorChannel||!p?.public||!a||a.practice||(!job.source&&(!eligibleTime(job.split?.ms)||!a.splits.some(s=>s.index===job.split.index&&s.ms===job.split.ms)))){
   job.status='cancelled';store.put('outbox',job.id,job);continue;
  }
  const nonce=BigInt('0x'+createHash('sha256').update(job.id).digest('hex').slice(0,15)).toString();
  try{
   const response=await fetcher(`https://discord.com/api/v10/channels/${job.channel}/messages`,{method:'POST',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},body:JSON.stringify({content:job.content,allowed_mentions:{parse:[],users:[],roles:[],replied_user:false},nonce,enforce_nonce:true}),signal:AbortSignal.timeout(8000)});
   if(response.ok)job.status='sent';
   else if(response.status===429){const data=await response.json();job.nextTry=now+Math.max(1000,Number(data.retry_after??5)*1000);store.put('outbox',job.id,job);break;}
   else if(response.status>=400&&response.status<500){job.status='failed';job.error=`Discord HTTP ${response.status}`;}
   else throw Error('Discord unavailable');
  }catch{job.tries++;job.nextTry=now+Math.min(60000,1000*2**job.tries);if(job.tries>=6)job.status='failed';}
  store.put('outbox',job.id,job);
 }
}
