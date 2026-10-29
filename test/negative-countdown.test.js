import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshot} from '../src/domain.js';
import {Store} from '../src/store.js';
import {publicActivity} from '../src/activity.js';
const profile={map:'iw-spaceland',category:'DC FF',players:1,timing:'GameTime'};
const upload=(extra={})=>({attemptId:'iw-countdown-test',sequence:1,profile,phase:'Running',index:1,elapsedMs:-5950,igtMs:null,splits:[{index:0,name:'Box hit',ms:-58300,igtMs:null}],complete:true,observedAt:Date.now(),...extra});
test('IW negative checkpoint from reported upload is accepted with signed IGT and secondary RTA',()=>{
 const input=upload({igtMs:-5950,splits:[{index:0,name:'Box hit',ms:-58300,igtMs:-58300}],realTime:{elapsedMs:-5000,splits:[{index:0,name:'Box hit',ms:-58000}]}});
 const parsed=snapshot(input);assert.equal(parsed.splits[0].ms,-58300);assert.equal(parsed.splits[0].igtMs,-58300);assert.equal(parsed.realTime.splits[0].ms,-58000);
 assert.equal(snapshot({...input,profile:{map:'der-eisendrache',category:'Mega Gums',timing:'RealTime',players:1},realTime:null}).splits[0].ms,-58300);
});
test('countdown split validation retains lower bound, ordering and current-timer limit',()=>{
 for(const ms of [-3600001,-5949,NaN,1.5])assert.throws(()=>snapshot(upload({splits:[{index:0,name:'Box hit',ms}]})),/Invalid split time/);
 assert.throws(()=>snapshot(upload({index:2,splits:[{index:0,name:'First',ms:-50000},{index:1,name:'Second',ms:-58000}]})),/Invalid split time/);
 assert.throws(()=>snapshot(upload({igtMs:-3600001})),/Invalid IGT/);
 assert.throws(()=>snapshot(upload({realTime:{elapsedMs:-60000,splits:[{index:0,name:'Box hit',ms:-58000}]}})),/Invalid split time/);
 assert.equal(snapshot(upload({elapsedMs:-3600000,splits:[{index:0,name:'First',ms:-3600000}]})).splits[0].ms,-3600000);
});
test('queued countdown uploads drain into a positive run without countdown records or alerts',t=>{
 const store=new Store();t.after(()=>store.close());const {player}=store.register('CountdownRunner');
 store.subscribe({guild:'12345',channel:'67890',player:player.id,profile,split:'Box hit',mode:'milestone'});
 assert.equal(store.ingest(player.id,upload({suppressAlerts:true})).accepted,true);
 assert.equal(store.ingest(player.id,upload({sequence:2,elapsedMs:6000})).accepted,true);
 assert.equal(store.view(player.id).attempt.splits[0].ms,-58300);
 assert.equal(store.list('outbox').length,0);assert.equal(publicActivity(store).length,0);
 assert.equal(store.best(store.get('players',player.id),'Box hit','session'),null);
 assert.equal(store.ingest(player.id,upload({sequence:3,elapsedMs:10000,index:2,splits:[{index:0,name:'Box hit',ms:-58300},{index:1,name:'PAP',ms:10000}]})).accepted,true);
 assert.equal(store.view(player.id).attempt.splits.length,2);
 assert.equal(store.view(player.id).attempt.elapsedMs,10000);
});
