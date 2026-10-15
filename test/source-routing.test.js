import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {runnerArchived} from '../src/runner-visibility.js';

const profile={map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'};
function fixture(t){
 let now=1800000000000;
 const store=new Store(':memory:',()=>now);t.after(()=>store.close());
 const {player}=store.register('Runner');player.source={type:'therun',username:'Runner',game:'BO3',category:'DE',profile};store.savePlayer(player);
 const event=(changes={})=>({attemptId:'direct-run-001',sequence:1,profile,phase:'Running',index:1,elapsedMs:280000,current:'Rocket',splits:[{index:0,name:'Bow',ms:277000}],observedAt:now,...changes});
 return {store,event,player:()=>store.get('players','runner'),advance:ms=>now+=ms,send:(changes={},provider='direct')=>store.ingest('runner',event(changes),provider)};
}
test('addon takes priority, preserves fallback config, and supersedes the partial upstream copy',t=>{
 const f=fixture(t);f.send({attemptId:'therun-run-001'},'therun');
 f.send({addonVersion:'1.0.6'});
 assert.equal(f.player().activeSource,'direct');assert.equal(f.player().source.type,'therun');assert.equal(f.player().addon.version,'1.0.6');
 assert.equal(f.store.attempts('runner').length,1);assert.ok(f.store.get('attempts','runner:therun-run-001').supersededBy);
 assert.equal(f.send({attemptId:'therun-run-001',sequence:2},'therun').reason,'direct-connected');
 assert.equal(f.player().activeAttempt,'runner:direct-run-001');
 f.advance(31000);assert.equal(f.store.view('runner').status,'offline');
 assert.equal(f.send({attemptId:'therun-run-001',sequence:3},'therun').reason,'waiting-for-new-therun-attempt');
 f.send({attemptId:'therun-run-002',phase:'NotRunning',index:-1,splits:[],elapsedMs:0},'therun');
 assert.equal(f.player().activeSource,'therun');assert.equal(f.store.sessionStats(f.player()).resets,0);
 f.send({attemptId:'therun-run-003'},'therun');assert.equal(f.store.attempts('runner').filter(a=>a.phase==='Running').length,1);
});
test('unknown upstream run is baselined after disconnect, including completed runs',t=>{
 const f=fixture(t);f.send();f.advance(31000);
 assert.equal(f.send({attemptId:'therun-run-001',phase:'Ended',current:null,elapsedMs:277000},'therun').reason,'waiting-for-new-therun-attempt');
 assert.equal(f.store.attempts('runner').length,1);
 f.send({attemptId:'therun-run-002'},'therun');assert.equal(f.player().activeSource,'therun');
});
test('queued stale uploads and old closed attempts drain without taking ownership',t=>{
 const f=fixture(t);f.send({attemptId:'therun-run-001'},'therun');
 const old=f.event().observedAt-60000;
 assert.equal(f.send({observedAt:old}).reason,'stale-direct-replay');assert.equal(f.player().activeSource,'therun');
 f.send();f.send({attemptId:'therun-run-001',sequence:2},'therun');f.advance(31000);
 f.send({attemptId:'therun-run-002'},'therun');
 assert.equal(f.send({sequence:2}).reason,'closed-source-attempt');assert.equal(f.player().activeSource,'therun');
});
test('handover suppresses repeat alerts and duplicate completed runs',t=>{
 const f=fixture(t);f.store.subscribe({guild:'123456',channel:'234567',player:'*',profile,split:'Bow',mode:'milestone'});
 f.send({attemptId:'therun-run-001'},'therun');assert.equal(f.store.list('outbox').length,1);
 f.send();assert.equal(f.store.list('outbox').filter(j=>j.status==='pending').length,0);
 const g=fixture(t),ended={phase:'Ended',current:null,elapsedMs:277000};
 g.send({attemptId:'therun-run-001',...ended},'therun');
 assert.equal(g.send(ended).reason,'already-recorded-by-therun');assert.equal(g.store.attempts('runner').length,1);
});
test('invalid addon snapshots roll back ownership and leave therun history intact',t=>{
 const f=fixture(t);f.send({attemptId:'therun-run-001'},'therun');
 assert.throws(()=>f.send({observedAt:f.event().observedAt+120000}),/clock is ahead/);
 assert.equal(f.player().activeSource,'therun');assert.equal(f.player().directLastSeen,undefined);
 assert.equal(f.store.get('attempts','runner:therun-run-001').supersededBy,undefined);
 assert.equal(runnerArchived({...f.player(),activeSource:'direct'},f.event().observedAt+331000),true);
});
test('a lagging addon does not repeat upstream split alerts as it catches up',t=>{
 const f=fixture(t);f.store.subscribe({guild:'123456',channel:'234567',player:'*',profile,split:'Rocket',mode:'milestone'});
 const splits=[{index:0,name:'Bow',ms:277000},{index:1,name:'Rocket',ms:345000}];
 f.send({attemptId:'therun-run-001',index:2,elapsedMs:350000,splits},'therun');
 const [job]=f.store.list('outbox');f.store.put('outbox',job.id,{...job,status:'sent'});
 f.send({elapsedMs:330000});
 f.send({sequence:2,index:2,elapsedMs:350000,splits});
 assert.equal(f.store.list('outbox').length,1);assert.equal(f.store.list('outbox')[0].status,'sent');
 assert.equal(f.store.attempts('runner').length,1);
});
test('therun polling is rejected after the user removes its configuration',t=>{
 const f=fixture(t),p=f.player();p.source={type:'direct'};f.store.savePlayer(p);
 assert.equal(f.send({attemptId:'therun-run-001'},'therun').reason,'source-changed');
 assert.equal(f.store.attempts('runner').length,0);
});
