import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.js';
test('PB folder endpoint authenticates imports and keeps runners offline',async t=>{
 const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(()=>{app.stop();app.store.close();});
 const url='http://127.0.0.1:'+app.server.address().port;
 const {player,token}=app.store.register('FolderRunner');
 const body=JSON.stringify({profile:{map:'der-eisendrache',category:'Mega Gums'},pbMs:1548000});
 assert.equal((await fetch(url+'/api/me/import-pb',{method:'POST',headers:{'content-type':'application/json'},body})).status,401);
 const result=await fetch(url+'/api/me/import-pb',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body});
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{synced:true});
 assert.match(app.store.answer('!pb FolderRunner DE'),/25:48/);
 assert.equal(app.store.attempts(player.id).length,0);assert.equal(app.store.list('outbox').length,0);
 assert.deepEqual(app.store.get('players',player.id),player);
});
