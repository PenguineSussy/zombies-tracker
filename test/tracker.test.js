import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import net from 'node:net';
import { Store } from '../src/store.js';
import { milliseconds, time, parseCommand } from '../src/domain.js';
import { Reconciler, LiveSplitClient } from '../companion/livesplit.js';
import { translateRun, sourceConfig } from '../src/therun.js';
import { ChatResponder, OAuthToken } from '../src/chat.js';
import { verifyDiscord, discordInteraction, deliverAlerts } from '../src/discord.js';
import { createApp } from '../src/server.js';

const P={map:'der-eisendrache',category:'No Gums',players:1,timing:'RealTime'};
const NOW=1791170000000;
function fixture(t){let now=NOW;const store=new Store(':memory:',()=>now);t.after(()=>store.close());const {player,token}=store.register('Player1');return {store,player,token,tick:(ms)=>now+=ms};}
function event(overrides={}){return {attemptId:'attempt-001',sequence:1,profile:P,phase:'Running',index:1,elapsedMs:285000,current:'Crackle',splits:[{index:0,name:'Bow',ms:283000}],complete:true,observedAt:NOW,...overrides};}
function raw(overrides={}){return {attemptCount:'1',phase:'Running',index:0,timing:'RealTime',elapsedMs:1000,current:'Bow',previous:'-',previousMs:null,...overrides};}

test('time parser preserves milliseconds, hours, comma fractions and countdown',()=>{
  assert.equal(milliseconds('7:31.123'),451123);assert.equal(milliseconds('1:02:03,5'),3723500);assert.equal(milliseconds('-0:05'),-5000);assert.equal(milliseconds('-'),null);
  assert.equal(time(451123),'7:31.123');assert.throws(()=>milliseconds('1:99'));
});
test('command parser accepts bot mention and multiword milestones',()=>{
  assert.deepEqual(parseCommand('@MyBot !best @Player1 lightning bow alltime'),{command:'best',player:'player1',split:'lightning bow',scope:'alltime'});
  assert.equal(parseCommand('hello !current @Player1'),null);
});
test('registration is case-insensitive, keys rotate and public state excludes credentials',t=>{
  const {store,player,token}=fixture(t);assert.equal(store.authenticate(token).id,player.id);assert.throws(()=>store.register('PLAYER1'));
  const next=store.rotate(player);assert.throws(()=>store.authenticate(token));assert.equal(store.authenticate(next).id,player.id);assert.equal(store.view(player.id).token,undefined);
});
test('two runners have isolated history and timing methods do not mix',t=>{
  const {store,player}=fixture(t);const second=store.register('Player2').player;
  store.ingest(player.id,event());store.ingest(second.id,event({splits:[{index:0,name:'Bow',ms:280000}]}));
  assert.equal(store.best(store.get('players',player.id),'bow','alltime').ms,283000);
  assert.equal(store.best(store.get('players',second.id),'bow','alltime').ms,280000);
  assert.equal(store.best(store.get('players',player.id),'bow','alltime',{...P,timing:'GameTime'}),null);
});
test('checkpoint completion uses actual split time rather than current elapsed timer',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event({index:2,elapsedMs:470000,current:'Next step',splits:[{index:0,name:'bow',ms:283000},{index:1,name:'crackle',ms:451000}]}));
  const answer=store.answer('!current @Player1');assert.match(answer,/Crackle — 7:31/);assert.match(answer,/Running: 7:50/);assert.match(answer,/Next: Next step/);
});
test('reset keeps session checkpoints; new session only resets session bests',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event());
  store.ingest(player.id,event({attemptId:'idle-00001',phase:'NotRunning',index:-1,elapsedMs:0,current:null,splits:[],complete:false}));
  let p=store.get('players',player.id);assert.equal(store.best(p,'bow','session').ms,283000);
  store.session(p,'start');p=store.get('players',player.id);assert.equal(store.best(p,'bow','session'),null);assert.equal(store.best(p,'bow','alltime').ms,283000);
});
test('idle heartbeats continue after session changes without reopening an ended session',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event());
  const idle=event({attemptId:'idle-00001',phase:'NotRunning',index:-1,elapsedMs:0,current:null,splits:[],complete:false});store.ingest(player.id,idle);
  store.session(store.get('players',player.id),'end');store.ingest(player.id,{...idle,sequence:2});assert.equal(store.get('players',player.id).sessionId,null);
  store.session(store.get('players',player.id),'start');const session=store.get('players',player.id).sessionId;store.ingest(player.id,{...idle,sequence:3});assert.equal(store.get('players',player.id).sessionId,session);
  store.ingest(player.id,event({attemptId:'attempt-002'}));assert.equal(store.get('attempts',player.id+':attempt-002').sessionId,session);
});
test('completed full-run PB requires every checkpoint even if sender claims completeness',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event({phase:'Ended',index:2,complete:true}));assert.match(store.answer('!pb @Player1'),/unavailable/);
  store.ingest(player.id,event({attemptId:'attempt-002',phase:'Ended'}));assert.match(store.answer('!pb @Player1'),/4:45/);
});
test('undo removes invalidated best and queued alert without duplicate re-pings',t=>{
  const {store,player}=fixture(t);store.subscribe({guild:'123456',channel:'234567',role:'345678',player:player.id,profile:P,split:'bow',mode:'milestone'});
  store.ingest(player.id,event());assert.equal(store.list('outbox').length,1);
  store.ingest(player.id,event({sequence:2,index:0,splits:[]}));assert.equal(store.best(store.get('players',player.id),'bow','alltime'),null);assert.equal(store.list('outbox')[0].status,'cancelled');
  store.ingest(player.id,event({sequence:3}));assert.equal(store.list('outbox').length,1);
});
test('duplicates, stale sequences and closed-attempt uploads cannot rewrite active attempt',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event());assert.equal(store.ingest(player.id,event()).accepted,false);
  store.ingest(player.id,event({attemptId:'attempt-002'}));assert.throws(()=>store.ingest(player.id,event({sequence:2})),/closed/);
});
test('practice is excluded; skipped checkpoints cannot manufacture records or full-run PBs',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event({practice:true}));assert.equal(store.best(store.get('players',player.id),'bow','alltime'),null);
  store.ingest(player.id,event({attemptId:'attempt-002',index:2,phase:'Ended',complete:false,splits:[{index:1,name:'crackle',ms:284000}]}));assert.match(store.answer('!pb @Player1'),/unavailable/);
  assert.throws(()=>store.ingest(player.id,event({attemptId:'attempt-003',splits:[{index:0,name:'bow',ms:999999}]})),/checkpoint/);
});
test('freshness and privacy apply to command responses and alerts',t=>{
  const {store,player,tick}=fixture(t);store.ingest(player.id,event());tick(31000);assert.match(store.answer('!current @Player1'),/offline/);
  store.privacy(store.get('players',player.id),false);assert.match(store.answer('!best @Player1 bow alltime'),/isn't sharing/);
});
test('WR comparison is frozen per attempt and wrong categories never match',t=>{
  const {store,player,tick}=fixture(t);store.benchmark({profile:P,splits:{bow:290000},source:'https://example.org/record',holder:'Runner',verifiedDate:'2026-10-04'});
  store.ingest(player.id,event());assert.match(store.answer('!pace @Player1'),/7 seconds ahead/);
  tick(1);store.benchmark({profile:P,splits:{bow:280000},source:'https://example.org/new',holder:'Runner2',verifiedDate:'2026-10-04'});
  store.ingest(player.id,event({sequence:2}));assert.match(store.answer('!pace @Player1'),/7 seconds ahead/);
  store.ingest(player.id,event({attemptId:'attempt-002',profile:{...P,category:'Mega Gums'}}));assert.match(store.answer('!pace @Player1'),/unavailable/);
});
test('outage replay records history but cannot send old milestone pings or look online',t=>{
  const {store,player,tick}=fixture(t);store.subscribe({guild:'123456',channel:'234567',player:player.id,profile:P,split:'bow',mode:'milestone'});tick(200000);
  store.ingest(player.id,event());assert.equal(store.list('outbox').length,0);assert.equal(store.view(player.id).status,'offline');
});
test('Discord delivery limits mentions, uses idempotency nonce, respects rate limit',async t=>{
  const {store,player,tick}=fixture(t);store.subscribe({guild:'123456',channel:'234567',role:'345678',player:player.id,profile:P,split:'bow',mode:'milestone'});store.ingest(player.id,event());
  let calls=0,body;
  const fake=async(url,options)=>{calls++;body=JSON.parse(options.body);return calls===1?new Response(JSON.stringify({retry_after:2}),{status:429}):new Response('{}');};
  await deliverAlerts(store,'fake',fake);assert.equal(store.list('outbox')[0].status,'pending');await deliverAlerts(store,'fake',fake);assert.equal(calls,1);
  tick(2000);await deliverAlerts(store,'fake',fake);assert.equal(store.list('outbox')[0].status,'sent');assert.deepEqual(body.allowed_mentions,{parse:[],roles:['345678']});assert.equal(body.enforce_nonce,true);
});
test('reset before delivery cancels stale role pings',async t=>{
  const {store,player}=fixture(t);store.subscribe({guild:'123456',channel:'234567',player:player.id,profile:P,split:'bow',mode:'milestone'});store.ingest(player.id,event());store.ingest(player.id,event({attemptId:'idle-00001',phase:'NotRunning',index:-1,elapsedMs:0,current:null,splits:[]}));
  let calls=0;await deliverAlerts(store,'fake',async()=>{calls++;return new Response('{}');});assert.equal(calls,0);assert.equal(store.list('outbox')[0].status,'cancelled');
});
test('Discord signatures reject tampering and old timestamps',()=>{
  const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
  const raw=Buffer.from('{"type":1}'),timestamp=String(Math.floor(NOW/1000));const signature=sign(null,Buffer.concat([Buffer.from(timestamp),raw]),pair.privateKey).toString('hex');
  assert.equal(verifyDiscord(publicKey,timestamp,signature,raw,NOW),true);assert.equal(verifyDiscord(publicKey,timestamp,signature,Buffer.from('{}'),NOW),false);assert.equal(verifyDiscord(publicKey,timestamp,signature,raw,NOW+301000),false);
});
test('Discord role-alert configuration enforces guild management permissions',t=>{
  const {store}=fixture(t);const reply=discordInteraction(store,{type:2,data:{name:'track-alert',options:[]},guild_id:'123456',member:{permissions:'0'}});assert.match(reply.data.content,/Manage Server/);assert.equal(store.list('subscriptions').length,0);
});
test('LiveSplit reconciler records last checkpoint, undo, reset and reconnect without retroactive alerts',()=>{
  const r=new Reconciler({profile:P,aliases:{'Bow Done':'bow'}});
  let s=r.update(raw());const first=s.attemptId;assert.equal(s.suppressAlerts,true);
  s=r.update(raw({index:1,elapsedMs:285000,current:'Crackle',previous:'Bow Done',previousMs:283000}));assert.equal(s.splits[0].ms,283000);assert.equal(s.splits[0].name,'bow');
  s=r.update(raw({index:0,elapsedMs:290000}));assert.equal(s.splits.length,0);
  r.disconnected();s=r.update(raw({index:2,elapsedMs:451000,previous:'Crackle',previousMs:451000}));assert.equal(s.complete,false);assert.equal(s.suppressAlerts,true);
  s=r.update(raw({phase:'NotRunning',index:-1,elapsedMs:0}));assert.notEqual(s.attemptId,first);assert.equal(s.splits.length,0);
  assert.throws(()=>r.update(raw({timing:'GameTime'})),/timing method/);
});
test('LiveSplit TCP client handles fragmented responses from a real socket',async t=>{
  const responses={getattemptcount:'1',getcurrenttimerphase:'Running',getsplitindex:'1',gettimingmethod:'RealTime',getcurrenttime:'4:45',getcurrentsplitname:'Crackle',getprevioussplitname:'Bow',getlastsplittime:'4:43'};
  const server=net.createServer(socket=>{let buffer='';socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const command=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);const value=responses[command]+'\r\n';socket.write(value.slice(0,1));setTimeout(()=>socket.write(value.slice(1)),1);}});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const client=new LiveSplitClient({port:server.address().port});t.after(()=>{client.close();server.close();});await client.connect();const sample=await client.read();assert.equal(sample.previousMs,283000);assert.equal(sample.elapsedMs,285000);
});
test('therun adapter uses milliseconds, exact categories and stable attempt IDs',()=>{
  const source=sourceConfig({type:'therun',username:'Player1',game:'Call of Duty: Black Ops III',category:'DE Solo',profile:P,aliases:{Bow:'bow'},variables:{Gums:'Classic'}});
  const live={login:'player1',game:source.game,category:source.category,variables:{Gums:'Classic'},gameTime:false,insertedAt:NOW,startedAt:String(NOW-285000),currentTime:285000.45,currentSplitIndex:1,currentSplitName:'Crackle',splits:[{name:'Bow',splitTime:283000.2},{name:'Crackle',splitTime:null}]};
  const first=translateRun(live,source,null,NOW);assert.equal(first.splits[0].ms,283000);assert.equal(first.suppressAlerts,true);assert.equal(first.complete,true);
  const second=translateRun({...live,insertedAt:NOW+1},source,first.attemptId,NOW+1);assert.equal(second.attemptId,first.attemptId);assert.equal(second.suppressAlerts,false);
  assert.throws(()=>translateRun({...live,game:'Another game'},source,null,NOW),/does not match/);
  assert.throws(()=>translateRun({...live,variables:{Gums:'Mega'}},source,null,NOW),/variable mismatch/);
});
test('older LiveSplit servers use configured timing with one warning and no response-stream corruption',async t=>{
  const responses={getattemptcount:'1',getcurrenttimerphase:'Running',getsplitindex:'1',getcurrenttime:'4:45',getcurrentsplitname:'Crackle',getprevioussplitname:'Bow',getlastsplittime:'4:43'};
  let probes=0;const sockets=new Set();
  const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let buffer='';socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const command=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(command==='gettimingmethod'){probes++;continue;}socket.write(responses[command]+'\r\n');}});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const warnings=[];
  const client=new LiveSplitClient({port:server.address().port,timeout:100,fallbackTiming:'RealTime',onWarning:message=>warnings.push(message)});
  t.after(()=>{client.close();for(const socket of sockets)socket.destroy();server.close();});
  await client.connect();const first=await client.read();const second=await client.read();
  assert.equal(first.previousMs,283000);assert.equal(second.elapsedMs,285000);assert.equal(first.timing,'RealTime');assert.equal(probes,1);assert.equal(warnings.length,1);assert.match(warnings[0],/automatic verification is unavailable/);
});
test('chat deduplication and per-user/channel cooldowns',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event());let now=NOW;const chat=new ChatResponder(store,450,()=>now);
  assert.ok(chat.respond('channel','viewer','1','!current @Player1'));assert.equal(chat.respond('channel','viewer','1','!current @Player1'),null);assert.equal(chat.respond('channel','viewer','2','!current @Player1'),null);now+=15001;assert.ok(chat.respond('channel','viewer','3','!current @Player1'));
});
test('short YouTube replies preserve the requested split result before long category detail',t=>{
  const {store,player}=fixture(t);store.ingest(player.id,event({profile:{...P,category:'Classic Gums'}}));const chat=new ChatResponder(store,190,()=>NOW);
  const reply=chat.respond('chat','viewer','message','!best @Player1 bow session');assert.match(reply,/4:43/);assert.match(reply,/Der Eisendrache/);assert.ok(reply.length<=190);
});
test('OAuth refresh retries unauthorized calls and preserves rotated refresh token',async()=>{
  let count=0;const oauth=new OAuthToken({provider:'twitch',accessToken:'old',refreshToken:'refresh',clientId:'client'},async(url,options)=>{
    if(url.includes('/oauth2/token'))return new Response(JSON.stringify({access_token:'new',refresh_token:'rotated'}));
    count++;return new Response('{}',{status:options.headers.Authorization==='Bearer new'?200:401});
  });assert.equal((await oauth.request('https://example.org')).status,200);assert.equal(count,2);assert.equal(oauth.refreshToken,'rotated');
});
test('HTTP registration, authenticated ingestion, source exclusion, privacy and deletion',async t=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.stop();app.store.close();});const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=async(path,method='GET',body,token)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const registration=await (await request('/api/register','POST',{username:'HTTPPlayer'})).json();const token=registration.token;
  assert.equal((await request('/api/ingest','POST',event())).status,401);
  assert.equal((await request('/api/ingest','POST',event(),token)).status,200);
  assert.equal((await request('/discord/interactions','POST',{type:1})).status,401);
  assert.equal((await request('/api/me/source','POST',{type:'therun',username:'HTTPPlayer',game:'BO3',category:'DE',profile:P},token)).status,200);
  assert.equal((await request('/api/ingest','POST',event({sequence:2}),token)).status,409);
  await request('/api/me/privacy','POST',{public:false},token);assert.deepEqual(await (await request('/api/players')).json(),[]);
  assert.equal((await request('/api/me','DELETE',undefined,token)).status,200);assert.equal((await request('/api/me','GET',undefined,token)).status,401);
});

