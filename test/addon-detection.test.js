import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {splitName,resolveRecords,resolveSplits} from '../src/split-rules.js';
import {ChatResponder} from '../src/chat.js';
const profile={map:'der-eisendrache',category:'Mega Gums'};
test('custom Rocket name is shared by records, commands, current checkpoint and site',t=>{
 const s=new Store();t.after(()=>s.close());const {player}=s.register('Runner');
 const names=['Penguine Eats Bread','R7'];
 const records={pbMs:451000,splits:names.map((name,index)=>({index,name,pbSplitMs:[346000,451000][index],bestSplitMs:[334000,440000][index],bestSegmentMs:[334000,94000][index]}))};
 s.ingest(player.id,{attemptId:'custom-name-001',sequence:1,profile,phase:'Running',index:0,elapsedMs:100,current:names[0],splits:[],records});
 assert.match(s.answer('!current Runner'),/Next: Rocket/);
 assert.match(s.answer('!best Runner Rocket alltime'),/Rocket: 5:34/);
 assert.match(s.answer('!best Runner "Penguine Eats Bread" alltime'),/Rocket: 5:34/);
 assert.match(s.answer('!splits Runner alltime'),/Rocket — 5:34/);
 assert.equal(s.savedRecords(s.get('players',player.id)).splits[0].displayName,'Rocket');
 for(const provider of ['twitch','youtube']){
 const bot=new ChatResponder(s,provider==='youtube'?190:450,Date.now,()=>0,provider);
 assert.match(bot.respond('channel','viewer','test','!best Runner Rocket alltime'),/Rocket: 5:34/);
 }
});
test('autosplitter labels survive upload and resolve using the same map aliases',t=>{
 const s=new Store();t.after(()=>s.close());const {player}=s.register('Runner');
 const data={attemptId:'asl-name-001',sequence:1,profile,phase:'Running',index:1,elapsedMs:350000,current:'Another joke',splits:[{index:0,name:'Penguine Eats Bread',ms:334000}],autosplitNames:['Rocket Test TP','First TP']};
 s.ingest(player.id,data);
 assert.match(s.answer('!current Runner'),/Last split: Rocket.*Next: TP/);
 assert.match(s.answer('!best Runner Rocket session'),/Rocket: 5:34/);
 assert.throws(()=>s.ingest(player.id,{...data,sequence:2,autosplitNames:['Rocket Test TP','Rocket Test TP']}),/Duplicate/);
 assert.equal(splitName({map:'revelations'},'Squid Leave'),'Exit');
 assert.equal(splitName({map:'revelations'},'House Enter'),'House');
 assert.equal(splitName({map:'zetsubou-no-shima'},'Rainbow'),'Rainbow Round End');
 assert.equal(splitName({map:'zetsubou-no-shima'},'KT-4'),'KT-4');
 assert.equal(resolveSplits({map:'zetsubou-no-shima',category:'Mega Gums'},[{index:0,name:'KT4',ms:700000}])[0].name,'KT4');
});
test('uncertain saved timings do not invent a canonical split',()=>{
 const rows=[{index:0,name:'Joke',pbSplitMs:280000,bestSplitMs:334000}];
 assert.equal(resolveRecords(profile,rows)[0].name,'Joke');
 assert.equal(resolveRecords({...profile,map:'moon'},[{index:0,name:'Joke',pbSplitMs:334000}])[0].name,'Joke');
});

test('manual aliases win over autosplitter and timing while unmapped checkpoints use fallback',t=>{
 const s=new Store();t.after(()=>s.close());const {player}=s.register('Aliases');
 const data={attemptId:'manual-alias-001',sequence:1,profile,phase:'Running',index:1,elapsedMs:350000,current:'R7',splits:[{index:0,name:'My Custom Name',ms:280000}],manualNames:['Rocket',null],autosplitNames:['Bow','R7'],records:{pbMs:450000,splits:[{index:0,name:'My Custom Name',pbSplitMs:290000,bestSplitMs:275000,bestSegmentMs:275000},{index:1,name:'R7',pbSplitMs:450000,bestSplitMs:440000,bestSegmentMs:150000}]}};
 s.ingest(player.id,data);
 assert.match(s.answer('!current Aliases'),/Last split: Rocket.*Next: Crackle/);
 assert.match(s.answer('!best Aliases Rocket alltime'),/Rocket: 4:35/);
 assert.match(s.answer('!best Aliases "My Custom Name" alltime'),/Rocket: 4:35/);
 assert.match(s.answer('!pace Aliases'),/ahead of.*PB/);
 assert.equal(s.savedRecords(s.get('players',player.id)).splits[1].displayName,'Crackle');
});
test('Super EE manual map completion aliases retain cumulative timing and completion',t=>{
 const s=new Store();t.after(()=>s.close());const {player}=s.register('SuperRunner');
 const maps=['Shadows of Evil','The Giant','Der Eisendrache','Zetsubou No Shima','Gorod Krovi','Revelations'];
 const names=maps.map(m=>m+' - Complete');
 s.ingest(player.id,{attemptId:'manual-super-001',sequence:1,profile:{map:'super-easter-egg',category:'Mega Gums'},phase:'Ended',index:6,elapsedMs:6000000,complete:true,manualNames:names,splits:maps.map((m,index)=>({index,name:'Custom '+index,ms:(index+1)*1000000}))});
 const p=s.view(player.id);assert.equal(p.attempt.complete,true);assert.equal(p.attempt.splits[2].displayName,'Der Eisendrache - Complete');assert.equal(p.attempt.splits[5].ms,6000000);
 assert.match(s.answer('!pb SuperRunner'),/1:40:00/);
});

test('alias setup guidance is only a last resort',t=>{
 const s=new Store();t.after(()=>s.close());const {player}=s.register('UnknownRunner');
 const base={attemptId:'unknown-alias-001',sequence:1,profile,phase:'Running',index:1,elapsedMs:1000,splits:[{index:0,name:'Joke checkpoint',ms:1000}]};
 s.ingest(player.id,base);assert.match(s.answer('!best UnknownRunner "Joke checkpoint" session'),/Set its alias/);
 s.ingest(player.id,{...base,sequence:2,manualNames:['Rocket']});assert.doesNotMatch(s.answer('!best UnknownRunner Rocket session'),/Set its alias/);
});
