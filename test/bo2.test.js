import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profile,profileKey,parseCommand,snapshot,categoriesForMap,profileLabel} from '../src/domain.js';
import {parseZwr,zwrUrl} from '../src/zwr.js';
import {Store} from '../src/store.js';
test('BO2 categories and Origins remain separate from BO3',()=>{
 const p=profile({map:'bo2-origins'});
 assert.equal(p.timing,'GameTime');assert.equal(p.category,'Standard');assert.doesNotMatch(profileLabel(p),/Standard/);
 assert.notEqual(profileKey(p),profileKey(profile({map:'origins',category:'Mega Gums'})));
 assert.equal(categoriesForMap('bo2-tranzit').length,4);
 assert.throws(()=>profile({map:'bo2-nuketown',category:'Standard'}));
 assert.ok(parseCommand('!wr BO2 Nuketown').error);
 assert.throws(()=>profile({map:'bo2-tranzit',category:'Mega Gums'}));
 assert.throws(()=>profile({...p,timing:'RealTime'}));
 assert.throws(()=>profile({...p,game:'bo3'}));
 assert.equal(parseCommand('!wr BO2 Origins').profile.map,'bo2-origins');
 assert.equal(parseCommand('!wr TranZit No Bank Maxis').profile.category,'No Bank Maxis');
 assert.ok(parseCommand('!wr TranZit').error);
});
test('BO2 primary IGT and secondary RTA are validated and persisted separately',t=>{
 const store=new Store();t.after(()=>store.close());const {player}=store.register('Bo2Runner');
 const s={attemptId:'bo2-attempt',sequence:1,profile:{map:'bo2-origins'},phase:'Running',index:1,elapsedMs:60000,current:'End',splits:[{index:0,name:'Ice',ms:30000}],realTime:{elapsedMs:90000,splits:[{index:0,name:'Ice',ms:45000}]}};
 assert.equal(snapshot(s).realTime.elapsedMs,90000);assert.throws(()=>snapshot({...s,elapsedMs:null}));
 store.ingest(player.id,s);assert.match(store.answer('!best @bo2runner Ice session'),/0:30/);assert.match(store.answer('!current @bo2runner'),/IGT/);
});
test('BO2 ZWR parser selects exact solo boards and excludes co-op',()=>{
 const board=(id,time)=>`<div class="Board" data-json="${id}"><div class="Row TopRank"><div class="Rank">1</div><div class="Name">Runner</div><a class="Achieved">${time}</a></div></div>`;
 const records=parseZwr(board('bo2-buried-ee-speedrun-maxis-nobank-2-board','1:00')+board('bo2-buried-ee-speedrun-maxis-nobank-1-board','14:29'),'bo2-buried');
 assert.equal(records.length,1);assert.equal(records[0].profile.category,'No Bank Maxis');assert.equal(records[0].profile.timing,'GameTime');assert.equal(records[0].ms,869000);
 assert.equal(parseZwr(board('bo2-origins-ee-speedrun-ALL-1-board','30:00'),'bo2-origins')[0].profile.category,'Standard');
 assert.equal(zwrUrl('bo2-die-rise'),'https://zwr.gg/leaderboards/bo2/ee-speedrun/die-rise/');
});

test('verified ZWR page fixtures produce all fourteen Solo records',()=>{
 const expected={'bo2-tranzit':[710000,333000,656150,366000],'bo2-die-rise':[382000,414000,280450,368000],'bo2-buried':[651000,869000,499000,730000],'bo2-mob-of-the-dead':[1066000],'bo2-origins':[2105000]};
 for(const [map,times] of Object.entries(expected)){const records=parseZwr(readFileSync(new URL('./fixtures/bo2-zwr/'+map+'.html',import.meta.url),'utf8'),map);assert.deepEqual(records.map(r=>r.ms),times);assert.ok(records.every(r=>r.profile.players===1&&r.recordId));}
});
