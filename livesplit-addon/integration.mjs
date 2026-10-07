import {createApp} from '../src/server.js';
import {Store} from '../src/store.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const store=new Store(':memory:');
const seen=[];const original=store.ingest.bind(store);
store.ingest=(id,data)=>{if(data.attemptId==='offline-attempt'&&!data.suppressAlerts)throw Object.assign(new Error('Test outage'),{status:503});const result=original(id,data);seen.push(data);return result;};
const app=createApp({store});
const server=app.server??app;
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 const {player,token}=store.register('AddonTest');
 const {stdout}=await promisify(execFile)(fileURLToPath(new URL('test-bin/Tests.exe',import.meta.url)),[`http://127.0.0.1:${server.address().port}`,token],{timeout:30000});
 assert.ok(seen.some(s=>s.phase==='Running'&&s.index===0),'start captured');
 assert.ok(seen.some(s=>s.phase==='Paused'),'pause captured');
 assert.ok(seen.some(s=>s.index===2&&!s.complete),'skip captured');
 assert.ok(seen.some(s=>s.phase==='Ended'&&s.splits.length===3&&s.complete),'finish captured');
 assert.equal(seen.at(-1).phase,'NotRunning','reset after finish captured');
 const attempt=seen.find(s=>s.phase==='Ended');
 assert.equal(attempt.profile.category,'No Gums');assert.equal(attempt.profile.timing,'RealTime');
 assert.equal(store.view(player.id).status,'NotRunning');
 assert.ok(seen.some(s=>s.attemptCount>=34324),'native saved attempt count uploaded');
 assert.ok(store.view(player.id).attempt.attemptCount>=34324,'attempt total persisted');
 assert.ok(seen.some(s=>s.attemptId==='offline-attempt'&&s.suppressAlerts),'recovered uploads suppress alerts');
 console.log(stdout.trim());console.log(`PASS native component → local HTTP → SQLite (${seen.length} events)`);
}finally{await new Promise(r=>server.close(r));store.close();}
