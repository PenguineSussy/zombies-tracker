import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
const profile={map:'gorod-krovi',category:'Mega Gums'};
function fixture(t){let now=1700000000000;const store=new Store(':memory:',()=>now);t.after(()=>store.close());const {player}=store.register('Runner');const send=(id,extra={})=>store.ingest(player.id,{attemptId:id,sequence:1,profile,phase:'Running',index:0,elapsedMs:1000,splits:[],observedAt:now,...extra});return {store,send,p:()=>store.get('players',player.id),advance:ms=>now+=ms};}
test('idle heartbeats cannot prolong a session and new run opens a fresh session',t=>{
 const f=fixture(t);f.send('running-001');f.advance(60000);f.send('idle-00001',{phase:'NotRunning',index:-1,elapsedMs:0});const old=f.p().sessionId;
 f.advance(3*3600000);const before=f.store.sessionStats(f.p());assert.equal(before.active,false);assert.equal(before.durationMs,60000);
 f.send('idle-00001',{sequence:2,phase:'NotRunning',index:-1,elapsedMs:0});assert.equal(f.p().sessionId,null);
 f.advance(10000);assert.equal(f.store.sessionStats(f.p()).durationMs,60000);
 f.send('running-002',{profile:{map:'der-eisendrache',category:'Mega Gums'}});assert.notEqual(f.p().sessionId,old);assert.equal(f.store.sessionStats(f.p()).groups.length,1);
});
test('fresh active heartbeats retain a long run; map switches summarize prior maps only',t=>{
 const f=fixture(t);f.send('running-001',{index:1,elapsedMs:1000,splits:[{index:0,name:'Egg',ms:1000}]});f.advance(60000);
 f.send('running-002',{profile:{map:'der-eisendrache',category:'Mega Gums'},index:1,elapsedMs:1000,splits:[{index:0,name:'Rocket',ms:1000}]});
 let s=f.store.sessionStats(f.p());assert.equal(s.groups[0].splits.length,0);assert.equal(s.groups[0].durationMs,60000);assert.equal(s.groups[1].splits[0].name,'Rocket');
 for(let i=2;i<=5;i++){f.advance(3600000);f.send('running-002',{sequence:i,profile:{map:'der-eisendrache',category:'Mega Gums'}});}
 assert.equal(f.store.sessionStats(f.p()).active,true);
});
test('attempt totals are validated, include idle data, and are not fabricated or accumulated',t=>{
 const f=fixture(t);f.send('idle-00001',{phase:'NotRunning',index:-1,attemptCount:34324});assert.equal(f.store.view('runner').attempt.attemptCount,34324);assert.equal(f.store.sessionStats(f.p()),null);
 assert.throws(()=>f.send('idle-00001',{sequence:2,attemptCount:-1}));
 f.send('running-001',{attemptCount:34325});f.send('running-001',{sequence:2,attemptCount:34325});assert.equal(f.store.sessionStats(f.p()).attempts,1);
 f.send('idle-00002',{phase:'NotRunning',index:-1,attemptCount:7});assert.equal(f.store.view('runner').attempt.attemptCount,7);
 f.send('idle-00003',{phase:'NotRunning',index:-1});assert.equal(f.store.view('runner').attempt.attemptCount,undefined);
});
test('finished timer heartbeats do not extend session duration',t=>{
 const f=fixture(t);f.send('finished-001',{phase:'Ended',index:1,elapsedMs:1000,splits:[{index:0,name:'End',ms:1000}],complete:true});
 f.advance(3*3600000);f.send('finished-001',{sequence:2,phase:'Ended',index:1,elapsedMs:1000,splits:[{index:0,name:'End',ms:1000}],complete:true});
 assert.equal(f.store.sessionStats(f.p()).active,false);assert.equal(f.store.sessionStats(f.p()).durationMs,0);
});
