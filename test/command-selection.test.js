import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {ChatResponder} from '../src/chat.js';
import {profileKey} from '../src/domain.js';
const de={map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'};
function setup(t){
 const store=new Store(':memory:',()=>1700000000000);t.after(()=>store.close());
 for(const name of ['Runner','Other']){const {player}=store.register(name);player.profile={...de,map:'gorod-krovi'};store.savePlayer(player);
 store.put('metadata',`saved-records:${player.id}:${profileKey(de)}`,{profile:de,pbMs:name==='Runner'?1600000:1700000,splits:[{index:0,name:'rocket',displayName:'Rocket',bestSplitMs:334000,bestSegmentMs:334000}]});}
 for(const provider of ['twitch','youtube'])store.put('metadata',provider,{kind:'chat-connection',provider,player:'runner',target:'channel',connected:true,enabled:true});
 return store;
}
test('bare runner names override linked channel and map/split selection stays isolated',t=>{
 const s=setup(t);
 for(const provider of ['twitch','youtube']){
 let now=0;const bot=new ChatResponder(s,450,()=>now,()=>0,provider);const reply=text=>{now+=6000;return bot.respond('channel','viewer',String(now),text);};
 assert.match(reply('!pb Other DE'),/Other.*28:20/);
 assert.match(reply('!pb DE'),/Runner.*26:40/);
 assert.match(reply('!best Other Rocket alltime DE'),/Other.*Der Eisendrache.*5:34 \(5:34 segment\)/);
 assert.match(reply('!splits Other alltime DE'),/Other.*Rocket — 5:34/);
 assert.match(reply('!splits Other alltime DE Classic Gums'),/Classic Gums.*unavailable/);
 assert.match(reply('!current Other DE'),/Other.*No current run/);
 assert.match(reply('!pace Other DE'),/Other.*No current run/);
 assert.match(reply('!sessionpb Other DE'),/Other.*Der Eisendrache.*unavailable/);
 s.privacy(s.get('players','other'),false);assert.match(reply('!pb Other DE'),/isn't sharing/);s.privacy(s.get('players','other'),true);
 }
 assert.match(s.answer('!best Runner Rocket alltime DE'),/5:34/);
 assert.match(s.answer('!pb Runner DE wrong'),/Choose/);
});
test('explicit session map stats are selected without changing the current profile',t=>{
 const s=setup(t),p=s.get('players','runner');p.sessionId='session';s.savePlayer(p);
 s.put('metadata','session',{id:'session',kind:'session',player:p.id,startedAt:1699999990000,endedAt:null});
 // Use ingestion to create the session through its normal lifecycle.
 s.ingest(p.id,{attemptId:'map-select-001',sequence:1,profile:de,phase:'Running',index:1,elapsedMs:340000,splits:[{index:0,name:'Rocket',ms:334000}],observedAt:1700000000000});
 s.ingest(p.id,{attemptId:'map-select-002',sequence:1,profile:{...de,map:'gorod-krovi'},phase:'Running',index:0,elapsedMs:1000,splits:[],observedAt:1700000000000});
 assert.match(s.answer('!splits Runner session DE'),/Der Eisendrache.*Rocket — 5:34/);
 assert.match(s.answer('!session Runner DE'),/Selected: Der Eisendrache.*Rocket: average 5:34/);
 assert.equal(s.get('players',p.id).profile.map,'gorod-krovi');
});
