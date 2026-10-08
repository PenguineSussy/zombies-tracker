import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveSplits,splitName} from '../src/split-rules.js';
import {Store} from '../src/store.js';
import {ChatResponder} from '../src/chat.js';
const p={map:'der-eisendrache',category:'Mega Gums'};
const rows=(...pairs)=>pairs.map(([name,ms],index)=>({name,ms,index}));
test('map-specific aliases preserve raw names and let explicit names override timing hints',()=>{
 const input=rows(['R7',1000],['Teleport 1',2000],['Boss',3000]);const before=structuredClone(input);
 assert.deepEqual(resolveSplits(p,input).map(s=>s.displayName),['Crackle','TP','Boss Enter']);assert.deepEqual(input,before);
 assert.equal(splitName({map:'revelations'},'TP'),'House');assert.equal(splitName(p,'TP'),'TP');
 assert.equal(splitName({map:'gorod-krovi'},'Fly'),'Fly');
});
test('fallback uses unique windows, ordered anchors and segment minima; ambiguity stays raw',()=>{
 assert.equal(resolveSplits(p,rows(['Despair',334000],['R7',451000]))[0].displayName,'Rocket');
 assert.equal(resolveSplits(p,rows(['Rocket',380000],['Mystery',400000]))[1].displayName,undefined);
 const g={map:'gorod-krovi',category:'Mega Gums'};
 assert.equal(resolveSplits(g,rows(['Mystery',350000]))[0].displayName,undefined);
 assert.equal(resolveSplits(g,rows(['Fly',250000],['R6',380000],['Fly',500000]))[2].displayName,'Fly 2');
});
test('optional and alternative splits do not shift names; volatile maps and other categories do not infer',()=>{
 const rev={map:'revelations',category:'Mega Gums'};
 const r=resolveSplits(rev,rows(['Boss 1',1000000],['Basketball',1150000],['Boss 2',1250000]));
 assert.deepEqual(r.map(s=>s.displayName),['Boss 1','Basketball','Boss 2']);
 assert.equal(resolveSplits(p,rows(['Bow',260000],['Unknown',340000]))[1].displayName,undefined);
 for(const profile of [{...p,category:'No Gums'},{...p,map:'moon'},{...p,map:'origins'}])assert.equal(resolveSplits(profile,rows(['Unknown',334000]))[0].displayName,undefined);
 const dup=resolveSplits(p,rows(['R7',420000],['Crackle',440000]));assert.deepEqual(dup.map(s=>s.name),['R7','Crackle']);
 assert.equal(resolveSplits(p,rows(['Mystery',1500000]))[0].displayName,undefined);
});
test('normalized queries and session PB use stored data without rewriting it or importing lifetime PB',t=>{
 const s=new Store();t.after(()=>s.close());const {player}=s.register('Runner');
 s.ingest(player.id,{attemptId:'rules-001',sequence:1,profile:p,phase:'Running',index:2,elapsedMs:451000,splits:rows(['Despair',334000],['R7',451000]),current:'Teleport 1',observedAt:Date.now()});
 assert.match(s.answer('!best @runner Rocket session'),/Rocket: 5:34/);assert.match(s.answer('!best @runner Despair session'),/Rocket: 5:34/);
 assert.match(s.answer('!best @runner Round 7 session'),/Crackle: 7:31/);
 assert.equal(s.get('attempts','runner:rules-001').splits[0].name,'despair');
 assert.match(s.answer('!current @runner'),/Next: TP/);assert.match(s.answer('!sessionpb @runner'),/unavailable/);
 s.ingest(player.id,{attemptId:'rules-001',sequence:2,profile:p,phase:'Ended',index:2,elapsedMs:451000,splits:rows(['Despair',334000],['R7',451000]),complete:true,observedAt:Date.now()});
 assert.match(s.answer('!sessionpb @runner'),/7:31/);
 s.put('metadata','chat-connection:twitch:runner',{kind:'chat-connection',provider:'twitch',player:'runner',target:'channel',enabled:true,connected:true});
 assert.match(new ChatResponder(s,450,Date.now,()=>0,'twitch').respond('channel','viewer','msg','!sessionpb'),/7:31/);
 s.privacy(s.get('players','runner'),false);assert.match(s.answer('!sessionpb @runner'),/isn't sharing/);
});
