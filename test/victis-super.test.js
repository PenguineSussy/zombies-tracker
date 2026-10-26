import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {profile,categoriesForMap,parseCommand} from '../src/domain.js';
import {discordCheckpoints} from '../src/discord-site.js';
import {wrSplitLookup} from '../src/wr-checkpoints.js';
import {Store} from '../src/store.js';
test('Victis Super uses only Richtofen and Maxis with cumulative IGT checkpoints',t=>{
 const store=new Store();t.after(()=>store.close());const map='bo2-victis-super';
 assert.deepEqual(categoriesForMap(map),['Richtofen','Maxis']);
 for(const category of ['Bank Richtofen','No Bank Maxis','Standard'])assert.throws(()=>profile({map,category}));
 const records=JSON.parse(readFileSync(new URL('../src/victis-zwr-baseline.json',import.meta.url)));assert.equal(records.length,2);
 for(const r of records){store.put('metadata',r.id,r);const category=r.profile.category,p=profile({map,category});assert.equal(p.timing,'GameTime');assert.deepEqual(discordCheckpoints(map,category),['Tranzit','Die Rise','Buried']);assert.equal(parseCommand('!wr Victis Super '+category).profile.category,category);
 const expected=category==='Richtofen'?[709000,1078000,1699000]:[409000,777000,1774000];
 for(const [i,name] of ['Tranzit','Die Rise','Buried'].entries())assert.equal(wrSplitLookup(store,p,name).split.ms,expected[i]);
 assert.ok(store.answer('!wr Victis Super '+category).includes(r.holder));store.put('metadata',r.id,{...r,recordId:'new'});assert.equal(wrSplitLookup(store,p,'Tranzit').split,null);
 }
});
