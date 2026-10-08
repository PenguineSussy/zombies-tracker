import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {discordCommands,discordInteraction} from '../src/discord.js';
import {WR_CHECKPOINTS} from '../src/wr-checkpoints.js';
import {profileKey} from '../src/domain.js';

const P={map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'};
const NOW=1791170000000;
function fixture(t){const store=new Store(':memory:',()=>NOW);t.after(()=>store.close());const {player}=store.register('Player1');return {store,player};}
function event(overrides={}){return {attemptId:'attempt-001',sequence:1,profile:P,phase:'Running',index:1,elapsedMs:285000,current:'Rocket',splits:[{index:0,name:'Bow',ms:283000}],observedAt:NOW,...overrides};}
const command=(options,permissions='32')=>({type:2,data:{name:'track-alert',options:Object.entries(options).map(([name,value])=>({name,value}))},guild_id:'123456',channel_id:'234567',member:{permissions}});

test('alerts match checkpoint aliases in both the alert and the runner splits',t=>{
  const {store,player}=fixture(t);
  const sub=store.subscribe({guild:'123456',channel:'234567',role:'345678',player:player.id,profile:P,split:'Round 7',mode:'milestone'});assert.equal(sub.split,'crackle');
  store.ingest(player.id,event());assert.equal(store.list('outbox').length,0);
  store.ingest(player.id,event({sequence:2,index:2,elapsedMs:452000,current:'TP',splits:[{index:0,name:'Bow',ms:283000},{index:1,name:'R7 End',ms:451000}]}));
  const [job]=store.list('outbox');assert.equal(job.role,'345678');assert.match(job.content,/Crackle: 7:31/);
  store.ingest(player.id,event({sequence:3,index:2,elapsedMs:460000,current:'TP',splits:[{index:0,name:'Bow',ms:283000},{index:1,name:'R7 End',ms:451000}]}));assert.equal(store.list('outbox').length,1);
});
test('a custom split name still matches the runner\'s exact LiveSplit name',t=>{
  const {store,player}=fixture(t);store.subscribe({guild:'123456',channel:'234567',player:player.id,profile:P,split:'Wisps',mode:'milestone'});
  store.ingest(player.id,event({splits:[{index:0,name:'wisps',ms:283000}]}));assert.equal(store.list('outbox').length,1);
});
test('/track-alert defaults to every completion and accepts an explicit map for any runner',t=>{
  const {store}=fixture(t);
  assert.match(discordInteraction(store,command({player:'*',split:'Boss'})).data.content,/Choose a map/);
  const reply=discordInteraction(store,command({player:'*',split:'Boss',role:'345678',map:'der-eisendrache'}));
  assert.match(reply.data.content,/any public runner \/ Boss Enter \/ Der Eisendrache.*Mega Gums.*<@&345678>/);assert.deepEqual(reply.data.allowed_mentions,{parse:[]});
  const [sub]=store.list('subscriptions');assert.deepEqual([sub.player,sub.split,sub.mode,sub.role,sub.channel],['*','boss enter','milestone','345678','234567']);assert.equal(profileKey(sub.profile),profileKey(P));
  assert.match(discordInteraction(store,command({player:'Player1',split:'Bow'})).data.content,/Choose a map/);
  assert.match(discordInteraction(store,command({player:'Player1',split:'Bow',map:'shangri-la'})).data.content,/Any%/);
  assert.match(discordInteraction(store,command({player:'Player1',split:'Wisps',map:'der-eisendrache'})).data.content,/not a standard checkpoint/);
  assert.match(discordInteraction(store,command({player:'Player1',split:'Bow',map:'der-eisendrache',mode:'under'})).data.content,/threshold/);
  assert.equal(store.list('subscriptions').length,3);
});
test('/track-alert uses the runner\'s current profile and keeps required options first',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event({profile:{...P,category:'Classic Gums'}}));
  discordInteraction(store,command({player:'Player1',split:'Rocket'}));assert.equal(store.list('subscriptions')[0].profile.category,'Classic Gums');
  const options=discordCommands.find(c=>c.name==='track-alert').options;
  assert.ok(options.every((o,i)=>o.required||options.slice(i).every(v=>!v.required)));assert.ok(options.find(o=>o.name==='map').choices.length<=25);
});
test('wr alerts use reviewed WR checkpoints when no benchmark is configured',t=>{
  const {store,player}=fixture(t);const record=WR_CHECKPOINTS.find(r=>profileKey(r.profile)===profileKey(P));
  store.put('metadata',`zwr:${profileKey(P)}`,{recordId:record.recordId,holder:record.holder,ms:record.listedMs});
  store.subscribe({guild:'123456',channel:'234567',player:'*',profile:P,split:'bow',mode:'wr'});
  store.ingest(player.id,event());assert.equal(store.list('outbox').length,0);
  store.ingest(player.id,event({attemptId:'attempt-002',elapsedMs:271000,splits:[{index:0,name:'Bow',ms:270000}]}));
  assert.match(store.list('outbox')[0].content,/~0:07 ahead of the reviewed WR checkpoint/);
});
