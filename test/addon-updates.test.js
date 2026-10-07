import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addonStatus,compareVersions,addonRelease} from '../src/addon-updates.js';
import {createApp} from '../src/server.js';
test('addon notices distinguish unknown, outdated and newer versions',()=>{
 assert.equal(addonStatus({}).state,'unknown');
 assert.equal(addonStatus({addon:{version:'0.2.6'}}).state,'required');
 assert.equal(addonStatus({addon:{version:'0.2.7'}}).state,'available');
 assert.equal(addonStatus({addon:{version:'0.2.10'}}).state,'current');
 assert.equal(compareVersions('0.2.10','0.2.9'),1);
});
test('release is public; reported addon version is owner-only and accepts legacy uploads',async()=>{
 const app=createApp();try{
  const {token}=app.store.register('VersionTest');
  const snap={attemptId:'version-test-1',sequence:1,profile:{map:'moon',category:'Mega Gums',players:1,timing:'RealTime'},phase:'NotRunning',index:-1,elapsedMs:0,splits:[],observedAt:Date.now(),addonVersion:'0.2.6'};
  app.store.ingest('versiontest',snap);
  assert.equal(app.store.get('players','versiontest').addon.version,'0.2.6');
  assert.throws(()=>app.store.ingest('versiontest',{...snap,sequence:2,addonVersion:'<bad>'}),/Invalid addon version/);
  app.store.ingest('versiontest',{...snap,sequence:2,addonVersion:undefined});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
  assert.deepEqual(await(await fetch(base+'/api/addon-release')).json(),addonRelease);
  assert.equal((await fetch(base+'/api/me')).status,401);
  const own=await(await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+token}})).json();assert.equal(own.addonUpdate.state,'required');
  const pub=await(await fetch(base+'/api/players/versiontest')).json();assert.equal(pub.addon,undefined);assert.equal(pub.addonUpdate,undefined);
 }finally{app.stop();app.store.close();}
});
