import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profile,profileKey,CATEGORIES,categoriesForMap,snapshot} from '../src/domain.js';
import {Store} from '../src/store.js';

test('map-specific categories reject invalid input across profile consumers',()=>{
  for(const map of ['ascension','shangri-la','zetsubou-no-shima','moon']) {
    const expected=map==='moon'?CATEGORIES:map==='zetsubou-no-shima'?['Classic Gums','Mega Gums','Any%']:['Any%'];
    assert.deepEqual(categoriesForMap(map),expected);
    for(const category of CATEGORIES) {
      if(expected.includes(category)) assert.equal(profile({map,category}).category,category);
      else assert.throws(()=>profile({map,category}),/allows only/);
    }
  }
});
test('Super EE keeps cumulative RTA and requires six map completions including Giant',()=>{
  const names=['SOE - Complete','The Giant - Complete','DE - Bow','DE - Complete','ZNS - Complete','GK - Complete','Revelations - Complete'];
  const base={attemptId:'super-test-1',sequence:1,phase:'Ended',profile:{map:'super-easter-egg',category:'Classic Gums'},index:7,elapsedMs:4200000,current:null,complete:true,splits:names.map((name,index)=>({name,index,ms:(index+1)*600000}))};
  const finished=snapshot(base);
  assert.equal(finished.complete,true);assert.equal(finished.elapsedMs,4200000);assert.equal(finished.splits[2].ms,1800000);
  assert.equal(snapshot({...base,phase:'Paused',index:2,current:'DE - Bow',elapsedMs:1250000,splits:base.splits.slice(0,2)}).stageMap,'der-eisendrache');
  const missing=names.filter(n=>!n.startsWith('The Giant'));
  assert.equal(snapshot({...base,index:6,splits:missing.map((name,index)=>({name,index,ms:(index+1)*600000}))}).complete,false);
  const wrongEnd=[...names.slice(0,5),names[6],names[5]];
  assert.equal(snapshot({...base,splits:wrongEnd.map((name,index)=>({name,index,ms:(index+1)*600000}))}).complete,false);
});
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
