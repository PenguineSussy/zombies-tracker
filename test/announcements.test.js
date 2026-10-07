import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {profile,profileKey} from '../src/domain.js';
import {deliverAnnouncements,announcementText} from '../src/announcements.js';
import {ChatConnections} from '../src/chat-connections.js';

function setup(t,options={}) {
 let now=1700000000000,sequence=0;const store=new Store(':memory:',()=>now);t.after(()=>store.close());const {player}=store.register('Runner');
 const p=profile({map:'der-eisendrache',category:'Mega Gums'});
 const records={pbMs:2000000,splits:[{index:0,name:'Rocket',bestSplitMs:360000,bestSegmentMs:350000},{index:1,name:'End',bestSplitMs:2000000,bestSegmentMs:1600000}]};
 const connection={kind:'chat-connection',provider:'twitch',player:player.id,channelId:'channel',target:'channel',connected:true,enabled:true,announcements:{gold:true,pb:true,wr:true},...options};
 store.put('metadata','chat-connection:twitch:runner',connection);
 store.put('metadata',`zwr:${profileKey(p)}`,{kind:'zwr',profile:p,ms:1900000});
 const send=(changes={})=>store.ingest(player.id,{attemptId:'attempt-one',sequence:++sequence,profile:p,phase:'Running',index:0,elapsedMs:100,current:'Rocket',splits:[],complete:true,observedAt:now,...changes});
 const split=(changes={})=>send({index:1,elapsedMs:340000,current:'End',splits:[{index:0,name:'Rocket',ms:340000}],...changes});
 const finish=()=>split({index:2,phase:'Ended',elapsedMs:1800000,current:null,splits:[{index:0,name:'Rocket',ms:340000},{index:1,name:'End',ms:1800000}]});
 const jobs=()=>store.list('metadata').filter(x=>x.kind==='chat-announcement');
 const sent=[];const deliver=()=>deliverAnnouncements(store,'twitch',async(target,text)=>sent.push({target,text}));
 return {store,player,p,send,split,finish,jobs,sent,deliver,advance:n=>now+=n,records,connection};
}
test('gold uses prior saved segment, waits 15 seconds and posts only once',async t=>{
 const f=setup(t);f.send({records:f.records});f.split({records:{...f.records,splits:f.records.splits.map(s=>({...s,bestSegmentMs:100}))}});
 assert.equal(f.jobs().length,1);assert.equal(f.jobs()[0].before,350000);await f.deliver();assert.equal(f.sent.length,0);
 f.advance(14999);await f.deliver();assert.equal(f.sent.length,0);f.advance(1);await f.deliver();await f.deliver();assert.equal(f.sent.length,1);
 assert.match(f.sent[0].text,/GOLD.*Rocket segment: 5:40 RTA.*previous 5:50.*0:10/);assert.equal(f.sent[0].target,'channel');
 f.split();await f.deliver();assert.equal(f.sent.length,1);
});
test('PB and WR compare full complete runs in the exact profile and recheck WR at delivery',async t=>{
 const f=setup(t);f.send({records:f.records});f.finish();assert.equal(f.jobs().filter(j=>j.type==='pb').length,1);assert.equal(f.jobs().filter(j=>j.type==='wr').length,1);
 f.store.put('metadata',`zwr:${profileKey(f.p)}`,{ms:1700000});f.advance(15000);for(let i=0;i<4;i++){f.split({sequence:10+i,phase:'Ended',index:2,elapsedMs:1800000,current:null,splits:[{index:0,name:'Rocket',ms:340000},{index:1,name:'End',ms:1800000}]});await f.deliver();f.advance(15000);}
 assert.ok(f.sent.some(x=>/NEW PB.*30:00/.test(x.text)));assert.ok(!f.sent.some(x=>/WR TIME/.test(x.text)));assert.equal(f.jobs().find(j=>j.type==='wr').status,'cancelled');
});
test('undo/reset cancels pending results and re-splitting cannot duplicate an announcement',async t=>{
 for(const reset of [false,true]){const f=setup(t);f.send({records:f.records});f.split();f.send(reset?{attemptId:'idle-reset',phase:'NotRunning',index:-1,elapsedMs:0}:{});f.advance(15000);await f.deliver();assert.equal(f.sent.length,0);assert.equal(f.jobs()[0].status,'cancelled');if(!reset){f.split();await f.deliver();assert.equal(f.sent.length,0);}}
});
test('opt-in, privacy, stale events, replay, missing baselines and incomplete runs are guarded',async t=>{
 for(const reason of ['disabled','private','stale','replay','initial','no-baseline','practice','incomplete']){
  const f=setup(t,reason==='disabled'?{announcements:{gold:false,pb:false,wr:false}}:{});
  if(reason==='private')f.store.privacy(f.player,false);
  if(reason!=='initial')f.send(reason==='no-baseline'?{}:{records:f.records});
  if(reason==='stale')f.advance(31000);
  if(reason==='practice'){const f2=setup(t);f2.send({practice:true,records:f2.records});f2.split({practice:true});assert.equal(f2.jobs().length,0);continue;}
  f.split({...(reason==='replay'?{suppressAlerts:true}:{}),...(reason==='incomplete'?{index:2,phase:'Ended',complete:false,splits:[{index:1,name:'End',ms:340000}]}:{})});
  assert.equal(f.jobs().length,0,reason);
 }
});
test('delivery checks privacy, connection, target, freshness and does not retry uncertain sends',async t=>{
 for(const reason of ['privacy','disabled','target','stale','failure']){
  const f=setup(t);f.send({records:f.records});f.split();f.advance(15000);
  if(reason==='privacy')f.store.privacy(f.store.get('players','runner'),false);
  if(reason==='disabled'||reason==='target')f.store.put('metadata','chat-connection:twitch:runner',{...f.connection,...(reason==='disabled'?{enabled:false}:{target:'other'})});
  if(reason==='stale')f.advance(16000);
  if(reason==='failure'){let calls=0;await deliverAnnouncements(f.store,'twitch',async()=>{calls++;throw new Error('timeout');});await deliverAnnouncements(f.store,'twitch',async()=>calls++);assert.equal(calls,1);assert.equal(f.jobs()[0].status,'failed');}
  else{await f.deliver();assert.equal(f.sent.length,0);assert.equal(f.jobs()[0].status,'cancelled');}
 }
});
test('announcement settings default off, validate input and stay channel specific',async t=>{
 const f=setup(t,{announcements:undefined});const chat=new ChatConnections(f.store,{});
 assert.deepEqual(chat.view(f.player).twitch.announcements,{gold:false,pb:false,wr:false,communityWr:false});
 await assert.rejects(chat.settings('twitch',f.player,{enabled:true,cooldownSeconds:15,announcements:{gold:'yes',pb:false,wr:false}}),/announcement settings/);
 await chat.settings('twitch',f.player,{enabled:true,cooldownSeconds:15,announcements:{gold:true,pb:false,wr:false}});
 assert.equal(chat.view(f.player).twitch.announcements.gold,true);assert.equal(chat.view(f.player).youtube.announcements.gold,false);
 const text=announcementText({type:'wr',runner:'Runner',profile:f.p,ms:100000,before:120000},200);assert.match(text,/pending verification/);assert.ok(text.length<=200);
});
test('other chats receive WR only with explicit community opt-in; never foreign golds or PBs',async t=>{
 const f=setup(t);f.store.register('Other');f.store.register('Quiet');
 for(const [player,enabled] of [['other',true],['quiet',false]])f.store.put('metadata',`chat-connection:twitch:${player}`,{...f.connection,player,target:player,channelId:player,announcements:{gold:true,pb:true,wr:true,communityWr:enabled}});
 f.send({records:f.records});f.finish();
 assert.deepEqual(f.jobs().filter(j=>j.recipient==='other').map(j=>j.type),['wr']);assert.equal(f.jobs().filter(j=>j.recipient==='quiet').length,0);
 f.advance(15000);await f.deliver();await f.deliver();
 assert.equal(f.sent.filter(x=>x.target==='other').length,1);assert.match(f.sent.find(x=>x.target==='other').text,/@Runner WR TIME BEATEN/);
 assert.ok(!f.sent.some(x=>x.target==='other'&&/GOLD|NEW PB/.test(x.text)));
});
test('community opt-out and changed segment predecessor cancel delayed announcements',async t=>{
 const f=setup(t);f.store.register('Other');const c={...f.connection,player:'other',target:'other',channelId:'other',announcements:{communityWr:true}};
 f.store.put('metadata','chat-connection:twitch:other',c);f.send({records:f.records});f.finish();
 f.store.put('metadata','chat-connection:twitch:other',{...c,announcements:{communityWr:false}});
 f.split({phase:'Ended',index:2,elapsedMs:1800000,splits:[{index:0,name:'Rocket',ms:330000},{index:1,name:'End',ms:1800000}]});
 f.advance(15000);await f.deliver();await f.deliver();
 assert.ok(!f.sent.some(x=>x.target==='other'));assert.equal(f.jobs().find(j=>j.type==='gold'&&j.split.index===1).status,'cancelled');
});
