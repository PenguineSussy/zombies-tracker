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
