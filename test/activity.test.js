import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {publicActivity} from '../src/activity.js';
function setup(t){let now=1700000000000,seq=0;const store=new Store(':memory:',()=>now);t.after(()=>store.close());store.register('Runner');const send=(extra={})=>store.ingest('runner',{attemptId:'attempt-one',sequence:++seq,profile:{map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'},phase:'Running',index:0,splits:[],current:'Rocket',elapsedMs:0,complete:true,observedAt:now,...extra});return {store,send,advance:ms=>now+=ms};}
test('scroller uses full run context and aliases without changing stored event names or undo',t=>{
 const f=setup(t);f.send();
 f.send({index:2,elapsedMs:451000,igtMs:420000,splits:[{index:0,name:'My custom name',ms:334000,igtMs:310000},{index:1,name:'R7',ms:451000,igtMs:420000}]});
 const events=publicActivity(f.store);
 assert.deepEqual(new Set(events.map(e=>e.split)),new Set(['Rocket','Crackle']));
 assert.equal(events.find(e=>e.split==='Rocket').igtMs,310000);
 assert.equal(f.store.list('metadata').find(e=>e.kind==='runner-activity'&&e.split.index===0).split.displayName,'My custom name');
 f.send();assert.equal(publicActivity(f.store).length,0);
 f.send({index:1,elapsedMs:1000,splits:[{index:0,name:'Joke',ms:1000}],manualNames:['Rocket']});
 assert.equal(publicActivity(f.store)[0].split,'Rocket');
});
test('Revelations old manual aliases and cached events display the new names',t=>{
 const f=setup(t),profile={map:'revelations',category:'Mega Gums'};f.send({profile});
 f.send({profile,index:2,elapsedMs:500000,splits:[{index:0,name:'Custom one',ms:400000},{index:1,name:'Custom two',ms:500000}],manualNames:['Beast','Exit']});
 assert.deepEqual(new Set(publicActivity(f.store).map(e=>e.split)),new Set(['Beast Enter','Beast Exit']));
 assert.deepEqual(f.store.view('runner').attempt.splits.map(s=>s.displayName),['Beast Enter','Beast Exit']);
 assert.match(f.store.answer('!splits Runner'),/Beast Enter.*Beast Exit/);
});
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


