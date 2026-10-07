import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {publicActivity} from '../src/activity.js';
function setup(t){let now=1700000000000,seq=0;const store=new Store(':memory:',()=>now);t.after(()=>store.close());store.register('Runner');const send=(extra={})=>store.ingest('runner',{attemptId:'attempt-one',sequence:++seq,profile:{map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'},phase:'Running',index:0,splits:[],current:'Rocket',elapsedMs:0,complete:true,observedAt:now,...extra});return {store,send,advance:ms=>now+=ms};}
test('activity captures split, PB against previous saved record, and reset without heartbeat duplicates',t=>{
 const f=setup(t);f.send({records:{pbMs:400000,splits:[{index:0,name:'Rocket',pbSplitMs:340000},{index:1,name:'End',pbSplitMs:400000}]}});f.send({index:1,elapsedMs:334000,splits:[{index:0,name:'Rocket',ms:334000}]});f.send({index:1,elapsedMs:335000,splits:[{index:0,name:'Rocket',ms:334000}]});assert.equal(publicActivity(f.store).length,1);
 f.send({phase:'Ended',index:2,elapsedMs:390000,splits:[{index:0,name:'Rocket',ms:334000},{index:1,name:'End',ms:390000}],records:{pbMs:390000,splits:[{index:0,name:'Rocket',pbSplitMs:334000},{index:1,name:'End',pbSplitMs:390000}]}});assert.ok(publicActivity(f.store).some(e=>e.type==='pb'));
 f.send({attemptId:'attempt-two'});f.send({attemptId:'attempt-idle',phase:'NotRunning',resetEvent:true});assert.equal(publicActivity(f.store).filter(e=>e.type==='reset').length,1);
});
test('activity excludes private, practice, replay and initial connection history; undo retracts split',t=>{
 const f=setup(t);const split={index:0,name:'Rocket',ms:334000};f.send({index:1,elapsedMs:334000,splits:[split]});assert.equal(publicActivity(f.store).length,0);
 f.send();f.send({index:1,elapsedMs:334000,splits:[split]});assert.equal(publicActivity(f.store).length,1);f.send();assert.equal(publicActivity(f.store).length,0);
 f.send({index:1,elapsedMs:334000,splits:[split],suppressAlerts:true});assert.equal(publicActivity(f.store).length,0);
 f.send({attemptId:'attempt-practice',practice:true});f.send({attemptId:'attempt-practice',practice:true,index:1,elapsedMs:334000,splits:[split]});assert.equal(publicActivity(f.store).length,0);
 f.send({attemptId:'attempt-public'});f.send({attemptId:'attempt-public',index:1,elapsedMs:334000,splits:[split]});f.store.privacy(f.store.get('players','runner'),false);assert.equal(publicActivity(f.store).length,0);
});


