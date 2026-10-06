import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {parseZwr} from '../src/zwr.js';
const profile={map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'};
const records={pbMs:1625000,splits:[{index:0,name:'Rocket',bestSplitMs:334000,bestSegmentMs:334000},{index:1,name:'R7',bestSplitMs:405000,bestSegmentMs:60000}]};
function fixture(t){const store=new Store();t.after(()=>store.close());const {player}=store.register('Runner');const send=extra=>store.ingest(player.id,{attemptId:'records-001',sequence:1,profile,phase:'NotRunning',index:-1,elapsedMs:0,splits:[],observedAt:Date.now(),records,...extra});return {store,player,send};}
test('saved records work before a tracked run; preserve case and separate split from segment',t=>{
 const {store,send}=fixture(t);send();
 assert.match(store.answer('!best @runner ROCKET alltime'),/Rocket: 5:34 \(5:34\)/);
 assert.match(store.answer('!best @runner r7 alltime'),/R7: 6:45 \(1:00\)/);
 assert.match(store.answer('!pb @runner'),/27:05 \(LiveSplit Personal Best\)/);
 assert.match(store.answer('!splits @runner alltime'),/Rocket: 5:34 \(5:34\).*R7: 6:45 \(1:00\)/);
 assert.match(store.answer('!best @runner Rocket session'),/unavailable/);
});
test('records are isolated by category, runner and practice; invalid and stale uploads cannot change them',t=>{
 const {store,player,send}=fixture(t);send();
 assert.throws(()=>send({sequence:2,records:{...records,pbMs:-1}}));
 send({sequence:0,records:{...records,pbMs:1}});assert.match(store.answer('!pb @runner'),/27:05/);
 send({attemptId:'records-002',profile:{...profile,category:'Classic Gums'},records:null});assert.match(store.answer('!pb @runner'),/unavailable/);
 send({attemptId:'practice-01',profile,practice:true,records:{...records,pbMs:1}});assert.match(store.answer('!pb @runner'),/27:05/);
 store.register('Other');assert.match(store.answer('!pb @other'),/unavailable/);
 store.privacy(store.get('players',player.id),false);assert.match(store.answer('!pb @runner'),/isn't sharing/);
 store.removePlayer(player);assert.equal(store.list('metadata').filter(x=>x.kind==='saved-records').length,0);
});
test('skipped checkpoints never create a segment best and imported records survive heartbeats',t=>{
 const {store,send}=fixture(t);send();send({sequence:2,records:null});assert.match(store.answer('!pb @runner'),/27:05/);
 send({attemptId:'running-01',phase:'Running',index:2,elapsedMs:500000,splits:[{index:1,name:'R7',ms:400000}],records:null});
 assert.match(store.answer('!best @runner R7 alltime'),/6:40 \(1:00\)/);
 assert.match(store.answer('!best @runner R7 session'),/6:40 \(unavailable\)/);
});
const board=(id,time,holder='Example')=>`<div class="Board active" data-players="1" data-json="${id}"><div class="Row TopRank"><div class="Rank">1</div><div class="Name">${holder}</div><a class="Achieved">${time}</a></div></div>`;
test('ZWR selects exact Solo gum board; does not borrow co-op or reversed records',()=>{
 const html=board('bo3-der-eisendrache-ee-speedrun-all-gobblegum-2-board','1:00')+board('bo3-der-eisendrache-ee-speedrun-all-gobblegum-1-board','25:42')+board('bo3-der-eisendrache-ee-speedrun-classic-gobblegum-1-board','30:00');
 const r=parseZwr(html,'der-eisendrache',123);assert.equal(r.length,2);assert.equal(r.find(x=>x.profile.category==='Mega Gums').ms,1542000);assert.equal(r.find(x=>x.profile.category==='Classic Gums').ms,1800000);
 assert.equal(parseZwr(board('bo3-bo3-super-ee-Super-ee-speedrun-all-gobblegum-reversed-1-board','1:00'),'super-easter-egg').length,0);
 assert.equal(parseZwr('<html>Unavailable</html>','der-eisendrache').length,0);
});

test('WR commands select maps independently of runners, default Mega Gums and validate categories',t=>{
 const store=new Store();t.after(()=>store.close());
 for(const [category,ms] of [['Mega Gums',1542000],['Any%',1558000]]) {
  const p={...profile,category};const id='zwr:'+JSON.stringify(p);
  store.put('metadata',id,{id,profile:p,ms,holder:'Example',achievedDate:'2025-09-23',checkedAt:Date.now(),source:'https://zwr.gg/'});
 }
 assert.match(store.answer('!wr Der Eisendrache'),/Mega Gums · RTA.*25:42/);
 assert.match(store.answer('!wr Der Eisendrache Any%'),/Any% · RTA.*25:58/);
 assert.match(store.answer('@littlemontybot !WR de ANY%'),/Any% · RTA.*25:58/);
 assert.match(store.answer('!wr @Penguine'),/Use !wr <map>/);
 assert.match(store.answer('!wr'),/Use !wr <map>/);
 assert.match(store.answer('!wr Der Eisendrache typo'),/Choose No Gums/);
 assert.match(store.answer('!wr Zetsubou No Shima No Gums'),/allows only/);
 assert.match(store.answer('!wr Ascension'),/allows only: Any%/);
 assert.match(store.answer('!wr Ascension Any%'),/Ascension.*Any% · RTA/);
 assert.match(store.answer('!wr Super Easter Egg'),/Super Easter Egg.*Mega Gums · RTA/);
 assert.doesNotMatch(store.answer('!wr Der Eisendrache'),/RealTime/);
});

test('WR dates match exact records, reject invalid dates, and never use checkedAt',()=>{
 const id='bo3-der-eisendrache-ee-speedrun-all-gobblegum-1-board';
 const html=board(id,'25:42');
 const metadata=(added,name='Example',achieved='25:42')=>'<script type="application/json" id="'+id+'">'+JSON.stringify({'1':[{players:1,id:'123',player1:{name},achieved,added}]})+'</script>';
 assert.equal(parseZwr(html+metadata('23rd, September 2025'),'der-eisendrache')[0].achievedDate,'2025-09-23');
 assert.equal(parseZwr(html+metadata('31st, February 2025'),'der-eisendrache')[0].achievedDate,null);
 assert.equal(parseZwr(html+metadata('23rd, September 2025','Other'),'der-eisendrache')[0].achievedDate,null);
 assert.equal(parseZwr(html+metadata('23rd, September 2025','Example','26:00'),'der-eisendrache')[0].achievedDate,null);
 assert.equal(parseZwr(html,'der-eisendrache',123)[0].achievedDate,null);
});
test('WR replies show only achieved date and omit source link and checked timestamp',t=>{
 const store=new Store();t.after(()=>store.close());const id='zwr:'+JSON.stringify(profile);
 const record={id,profile,ms:1542000,holder:'Example',achievedDate:'2025-09-23',dateSource:'zwr-added',checkedAt:Date.now(),source:'https://zwr.gg/'};
 store.put('metadata',id,record);const answer=store.answer('!wr DE');
 assert.match(answer,/SOLO WR:/);
 assert.doesNotMatch(answer,/ZWR/);
 assert.match(answer,/Achieved: 2025-09-23\./);
 assert.doesNotMatch(answer,/Checked|https?:|ZWR added|zwr-added|stale cache/);
 store.put('metadata',id,{...record,achievedDate:null});assert.match(store.answer('!wr DE'),/Achieved: unavailable/);
});
