import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAPS,IW_CATEGORIES,categoriesForMap,profile,parseCommand,snapshot} from '../src/domain.js';
import {parseZwr} from '../src/zwr.js';
import {Store} from '../src/store.js';
const records=JSON.parse(readFileSync(new URL('../src/iw-zwr-baseline.json',import.meta.url)));
test('IW five maps and four categories use IGT, reject cross-game categories',()=>{
 const maps=MAPS.filter(m=>m.game==='iw');assert.equal(maps.length,6);
 for(const map of maps)for(const category of categoriesForMap(map.id)){
  assert.equal(profile({map:map.id,category}).timing,'GameTime');
  assert.equal(parseCommand('!wr IW '+map.name+' '+category).profile.category,category);
  assert.throws(()=>profile({map:map.id,category:'Mega Gums'}));
  assert.throws(()=>profile({map:map.id,category,timing:'RealTime'}));
 }
 assert.equal(parseCommand('!wr Spaceland').profile.category,'Fate');
});
test('IW records answer all twenty exact Solo map/category queries',t=>{
 const store=new Store();t.after(()=>store.close());assert.equal(records.length,22);
 for(const r of records){store.put('metadata',r.id,r);assert.match(store.answer('!wr '+r.profile.map+' '+r.profile.category),new RegExp(r.holder.replace(/[.*+?^${}()|[]\\]/g,'\\$&')));}
});
test('IW primary IGT and secondary RTA remain separate with raw split names',t=>{
 const store=new Store();t.after(()=>store.close());const {player}=store.register('IwTester');
 const s={attemptId:'iw-attempt-001',sequence:1,profile:{map:'iw-spaceland',category:'FF'},phase:'Running',index:1,elapsedMs:60000,current:'My next split',splits:[{index:0,name:'PAP',ms:30000}],realTime:{elapsedMs:90000,splits:[{index:0,name:'PAP',ms:45000}]}};
 assert.equal(snapshot(s).realTime.elapsedMs,90000);store.ingest(player.id,s);
 assert.match(store.answer('!current @IwTester'),/IGT/);
 assert.match(store.answer('!best @IwTester PAP session'),/0:30/);
 assert.throws(()=>snapshot({...s,elapsedMs:null}));
});
test('IW ZWR exact board ignores co-op and other categories',()=>{
 const board=(id,time)=>'<div class="Board" data-json="'+id+'"><div class="Row TopRank"><div class="Rank">1</div><div class="Name">Runner</div><a class="Achieved">'+time+'</a></div></div>';
 const result=parseZwr(board('iw-spaceland-ee-speedrun-dc-all-cards-2-board','1:00')+board('iw-spaceland-ee-speedrun-dc-all-cards-1-board','12:34'),'iw-spaceland');
 assert.equal(result.length,1);assert.equal(result[0].profile.category,'DC FF');assert.equal(result[0].ms,754000);
});

import {IW_SPLITS,iwSplits} from '../src/iw-splits.js';
import {splitName,resolveSplits} from '../src/split-rules.js';
import {discordCheckpoints} from '../src/discord-site.js';
test('IW checkpoint dropdowns, aliases, and command names agree across categories',t=>{
 const store=new Store();t.after(()=>store.close());
 const {player}=store.register('IwAliases');let attempt=0;
 for(const map of Object.keys(IW_SPLITS))for(const category of categoriesForMap(map)){
 const names=iwSplits({map,category});
  assert.deepEqual(discordCheckpoints(map,category),iwSplits({map,category}));
  for(const name of iwSplits({map,category}))assert.equal(splitName({map,category},name.toLowerCase()),name);
  assert.equal(resolveSplits({map,category},[{name:'custom name',ms:600000}])[0].name,'custom name');
  const mapped=resolveSplits({map,category},[{name:'custom name',manualName:names[0],ms:600000}]);assert.equal(mapped[0].displayName,names[0]);
  store.ingest(player.id,{attemptId:'iw-alias-'+(++attempt),sequence:1,profile:{map,category},phase:'Running',index:1,elapsedMs:60000,current:names[1],splits:[{index:0,name:names[0].toLowerCase(),ms:30000}]});
  assert.ok(store.answer('!best @IwAliases '+names[0]+' session').includes(names[0]));
 }
});

test('Spaceland Round 9 End follows Seticom 3 only for non-DC categories',()=>{
 for(const category of IW_CATEGORIES){const names=discordCheckpoints('iw-spaceland',category);if(category.startsWith('DC'))assert.ok(!names.includes('Round 9 End'));else assert.equal(names[names.indexOf('Seticom 3')+1],'Round 9 End');}
});

import {wrSplitLookup} from '../src/wr-checkpoints.js';
import {milliseconds} from '../src/domain.js';
test('all 22 supplied checkpoint sets match records and stop matching if a WR changes',t=>{
 const store=new Store();t.after(()=>store.close());for(const r of records)store.put('metadata',r.id,r);
 const supplied=JSON.parse(readFileSync(new URL('../src/iw-wr-splits.json',import.meta.url))).records;assert.equal(supplied.length,22);
 for(const r of supplied){const p=profile({map:r.map,category:r.category});assert.deepEqual(r.splits.map(s=>s.name),discordCheckpoints(r.map,r.category));let prior=0;
 for(const s of r.splits){const actual=wrSplitLookup(store,p,s.name).split;assert.equal(actual.ms,milliseconds(s.time));assert.ok(actual.ms>prior);prior=actual.ms;}
 const record=records.find(v=>v.profile.map===r.map&&v.profile.category===r.category);store.put('metadata',record.id,{...record,recordId:'replacement'});assert.equal(wrSplitLookup(store,p,r.splits[0].name).split,null);
 }
 assert.throws(()=>profile({map:'iw-mephistopheles-super',category:'Fate'}));assert.throws(()=>profile({map:'iw-mephistopheles-super',category:'FF'}));
 assert.equal(parseCommand('!wr Mephistopheles DCFF').profile.category,'DC FF');
 assert.ok(!discordCheckpoints('iw-rave-in-the-redwoods','DC FF').includes('Death Reset'));
 assert.ok(!discordCheckpoints('iw-shaolin-shuffle','Fate').includes('Rats Start'));
});
