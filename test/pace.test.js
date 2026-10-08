import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {profileKey,profile} from '../src/domain.js';
function setup(t){let now=1700000000000,sequence=0;const s=new Store(':memory:',()=>now);t.after(()=>s.close());s.register('Runner');const p=profile({map:'der-eisendrache',category:'Mega Gums'});const records={pbMs:1558000,splits:[{index:0,name:'Rocket',pbSplitMs:346000,bestSplitMs:334000,bestSegmentMs:334000},{index:1,name:'End',pbSplitMs:1558000,bestSplitMs:1558000,bestSegmentMs:1200000}]};const send=(changes={})=>s.ingest('runner',{attemptId:'attempt-one',sequence:++sequence,profile:p,phase:'Running',index:0,splits:[],elapsedMs:0,current:'Rocket',complete:true,observedAt:now,...changes});return {s,p,records,send,advance:ms=>now+=ms};}
test('pace compares the PB checkpoint, never a gold or best split, and freezes it across PB updates',t=>{
 const f=setup(t);f.send({records:f.records});f.send({index:1,elapsedMs:334000,current:'End',splits:[{index:0,name:'Rocket',ms:334000}]});assert.match(f.s.answer('!pace @Runner'),/Rocket: 5:34.*12 seconds ahead of PB/);
 f.send({phase:'Ended',index:2,current:null,elapsedMs:1500000,splits:[{index:0,name:'Rocket',ms:334000},{index:1,name:'End',ms:1500000}],records:{...f.records,pbMs:1500000,splits:f.records.splits.map(s=>({...s,pbSplitMs:s.index===0?334000:1500000}))}});
 assert.match(f.s.answer('!pace @Runner'),/58 seconds ahead of PB/);assert.match(f.s.answer('!pace @Runner'),/finished/);
});
test('pace handles pre-split, idle, offline, paused and private runners',t=>{
 const f=setup(t);assert.match(f.s.answer('!pace @Runner'),/No active run/);f.send({records:f.records});assert.match(f.s.answer('!pace @Runner'),/No completed checkpoint/);
 f.send({phase:'Paused',index:1,elapsedMs:360000,splits:[{index:0,name:'Rocket',ms:360000}]});assert.match(f.s.answer('!pace @Runner'),/paused.*14 seconds behind PB/);
 f.advance(31000);assert.match(f.s.answer('!pace @Runner'),/offline; last recorded/);f.s.privacy(f.s.get('players','runner'),false);assert.match(f.s.answer('!pace @Runner'),/isn't sharing/);
});
test('old addons get update guidance; missing, skipped and reordered PB checkpoints cannot be guessed',t=>{
 const f=setup(t);const old={...f.records,splits:f.records.splits.map(({pbSplitMs,...s})=>s)};f.send({records:old});f.send({index:1,elapsedMs:334000,splits:[{index:0,name:'Rocket',ms:334000}]});assert.match(f.s.answer('!pace @Runner'),/update the LiveSplit addon and reconnect/);
 f.send({attemptId:'attempt-two',records:f.records,index:1,elapsedMs:334000,splits:[{index:0,name:'Different checkpoint',ms:334000}]});assert.match(f.s.answer('!pace @Runner'),/layout does not match/);
 f.send({sequence:20,attemptId:'attempt-two',index:2,elapsedMs:500000,splits:[{index:1,name:'End',ms:500000}]});assert.match(f.s.answer('!pace @Runner'),/layout does not match/);
});
test('WR finish time is information only; pace needs an actual matching WR checkpoint',t=>{
 const f=setup(t);f.s.put('metadata',`zwr:${profileKey(f.p)}`,{ms:1542000});f.send({records:f.records});f.send({index:1,elapsedMs:334000,splits:[{index:0,name:'Rocket',ms:334000}]});assert.match(f.s.answer('!pace @Runner'),/WR finish: 25:42 \(checkpoint pace unavailable\)/);assert.doesNotMatch(f.s.answer('!pace @Runner'),/ahead of WR/);
});
