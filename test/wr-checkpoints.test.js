import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {WR_CHECKPOINTS,wrCheckpoint} from '../src/wr-checkpoints.js';
import {profileKey} from '../src/domain.js';
function seed(s,r){s.put('metadata',`zwr:${profileKey(r.profile)}`,{recordId:r.recordId,holder:r.holder,ms:r.listedMs});}
test('reviewed records match only their category and current record identity',t=>{
 const s=new Store(':memory:');t.after(()=>s.close());
 for(const r of WR_CHECKPOINTS){seed(s,r);for(const split of r.splits){assert.equal(wrCheckpoint(s,r.profile,split.name)?.ms,split.ms);assert.equal(split.ms%50,0);}
  assert.equal(wrCheckpoint(s,{...r.profile,category:'Classic Gums'},r.splits[0].name),null);
  s.put('metadata',`zwr:${profileKey(r.profile)}`,{recordId:'new-wr',holder:r.holder,ms:r.listedMs});assert.equal(wrCheckpoint(s,r.profile,r.splits[0].name),null);
 }
});
test('subsplits, aliases, missing checkpoints and Super EE cumulative times',t=>{
 const s=new Store(':memory:');t.after(()=>s.close());for(const r of WR_CHECKPOINTS)seed(s,r);
 const p=map=>WR_CHECKPOINTS.find(r=>r.profile.map===map).profile;
 assert.equal(wrCheckpoint(s,p('origins'),'-Lightning Enter').ms,878000);
 assert.equal(wrCheckpoint(s,p('origins'),'-Ice Leave').ms,1138000);
 assert.equal(wrCheckpoint(s,p('origins'),'Fire Dupe'),null);
 assert.equal(wrCheckpoint(s,p('origins'),'Iron Fisting'),null);
 assert.equal(wrCheckpoint(s,p('der-eisendrache'),'Rocket'),null);
 assert.equal(wrCheckpoint(s,p('der-eisendrache'),'R7').ms,416000);
 assert.equal(wrCheckpoint(s,p('super-easter-egg'),'DE').ms,2959000);
 assert.equal(wrCheckpoint(s,p('super-easter-egg'),'End').ms,7976150);
});
test('pace uses confirmed WR checkpoints without requiring manual benchmarks',t=>{
 const s=new Store(':memory:',()=>1700000000000);t.after(()=>s.close());s.register('Runner');
 const r=WR_CHECKPOINTS.find(r=>r.profile.map==='der-eisendrache');seed(s,r);
 s.ingest('runner',{attemptId:'attempt-one',sequence:1,profile:r.profile,phase:'Running',index:1,splits:[{index:0,name:'R7',ms:420670}],elapsedMs:420670,current:'TP',complete:true,observedAt:s.clock()});
 assert.match(s.answer('!pace @Runner'),/Approximately 5 seconds behind WR checkpoint/);
 const m=WR_CHECKPOINTS.find(r=>r.profile.map==='moon');seed(s,m);
 s.ingest('runner',{attemptId:'attempt-two',sequence:2,profile:m.profile,phase:'Running',index:1,splits:[{index:0,name:'Power',ms:45670}],elapsedMs:45670,current:'Samantha Says',complete:true,observedAt:s.clock()});
 assert.match(s.answer('!pace @Runner'),/1.15 seconds behind WR checkpoint/);
});
