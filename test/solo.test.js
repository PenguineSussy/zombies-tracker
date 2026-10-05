import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profile,profileKey,CATEGORIES} from '../src/domain.js';
import {Store} from '../src/store.js';
test('Solo EE RTA profiles accept exactly the four gum categories',()=>{
  for(const category of CATEGORIES) assert.deepEqual(profile({map:'moon',category}),{map:'moon',category,players:1,timing:'RealTime'});
  assert.throws(()=>profile({map:'moon',category:'No Gums',players:2}),/Solo/);
  assert.throws(()=>profile({map:'moon',category:'No Gums',timing:'GameTime'}),/RTA/);
  assert.throws(()=>profile({map:'moon',category:'random'}),/Choose/);
  assert.throws(()=>profile({map:'moon',objective:'main easter egg',players:1,rules:'classic',route:'standard',timing:'RealTime'}),/Update older/);
});
test('legacy history stays separate from new gum category records',()=>{
  const old={map:'moon',objective:'main easter egg',players:1,rules:'no gums',route:'standard',timing:'RealTime'};
  assert.notEqual(profileKey(old),profileKey(profile({map:'moon',category:'No Gums'})));
});
test('records and WR checkpoints do not cross gum categories',()=>{
  const store=new Store(':memory:');
  try{
    const {player}=store.register('SoloTest');
    const base={sequence:1,phase:'Running',index:1,elapsedMs:10000,current:'boss',splits:[{index:0,name:'bow',ms:5000}],observedAt:Date.now(),complete:true};
    store.ingest(player.id,{...base,attemptId:'solo-attempt-1',profile:{map:'der-eisendrache',category:'No Gums'}});
    store.ingest(player.id,{...base,attemptId:'solo-attempt-2',profile:{map:'der-eisendrache',category:'Mega Gums'},splits:[{index:0,name:'bow',ms:3000}]});
    assert.equal(store.best(store.get('players',player.id),'bow','alltime',{map:'der-eisendrache',category:'No Gums'}).ms,5000);
    assert.equal(store.best(store.get('players',player.id),'bow','alltime').ms,3000);
  }finally{store.close();}
});
