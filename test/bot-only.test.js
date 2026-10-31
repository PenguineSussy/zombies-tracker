import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {createApp} from '../src/server.js';
import {botOwner,ownerKey} from '../src/bot-owners.js';
import {ChatConnections,chatTargets} from '../src/chat-connections.js';
import {ChatResponder} from '../src/chat.js';
import {DiscordSite} from '../src/discord-site.js';
const env={PUBLIC_ORIGIN:'https://tracker.example',TWITCH_CLIENT_ID:'app',TWITCH_CLIENT_SECRET:'secret',TWITCH_ACCESS_TOKEN:'bot',TWITCH_BOT_USER_ID:'bot',YOUTUBE_CLIENT_ID:'app',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_ACCESS_TOKEN:'bot',YOUTUBE_BOT_CHANNEL_ID:'bot',DISCORD_APP_ID:'99999',DISCORD_CLIENT_SECRET:'secret',DISCORD_BOT_TOKEN:'bot'};
function guest(store){let cookie;const player=botOwner(store,{headers:{}},env,{setHeader:(_,v)=>cookie=v});return {player,cookie};}
const callback=start=>new URLSearchParams({state:new URL(start.url).searchParams.get('state'),code:'code'});
function fetcher(url){
 if(url.includes('/token'))return Promise.resolve(Response.json({access_token:'private-access',refresh_token:'private-refresh',scope:'identify guilds'}));
 if(url.includes('helix/users'))return Promise.resolve(Response.json({data:[{id:'12345',display_name:'Channel',login:'channel'}]}));
 if(url.includes('/channels?'))return Promise.resolve(Response.json({items:[{id:'yt123',snippet:{title:'Channel'}}]}));
 if(url.includes('/liveBroadcasts?'))return Promise.resolve(Response.json({items:[{id:'live',snippet:{channelId:'yt123',liveChatId:'chat',title:'Live'}}]}));
 if(url.includes('/users/@me/guilds'))return Promise.resolve(Response.json([{id:'11111',name:'Server',permissions:'32'}]));
 if(url.endsWith('/users/@me'))return Promise.resolve(Response.json({id:'44444',username:'Manager'}));
 throw Error('Unexpected URL '+url);
}
test('bot-only Twitch and YouTube authorize, enable, recover and never create a runner',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const one=guest(store),two=guest(store),chat=new ChatConnections(store,env,fetcher);
 for(const provider of ['twitch','youtube']){
  const start=chat.start(provider,one.player);await assert.rejects(chat.finish(provider,callback(start),'bad'),/browser/);await chat.finish(provider,callback(start),start.cookie);
  await chat.settings(provider,one.player,{enabled:true,cooldownSeconds:20,broadcastId:'live'});
  assert.equal(chatTargets(store,env,provider).length,1);
  assert.equal(chat.view(two.player)[provider].connected,false);
  await assert.rejects(chat.settings(provider,two.player,{enabled:false,cooldownSeconds:15}),/Connect/);
  const recover=chat.start(provider,two.player);await chat.finish(provider,callback(recover),recover.cookie);
  assert.equal(chat.view(one.player)[provider].connected,false);assert.equal(chat.view(two.player)[provider].connected,true);
  assert.equal(chat.view(two.player)[provider].cooldownSeconds,20);
  await chat.settings(provider,two.player,{enabled:true,cooldownSeconds:20,broadcastId:'live'});
 }
 assert.equal(store.list('players').length,0);
 const responder=new ChatResponder(store,450,Date.now,()=>15,'twitch');assert.match(responder.respond('12345','viewer','m1','!help'),/Commands:/);
 assert.doesNotMatch(JSON.stringify(chat.view(two.player)),/private-access|private-refresh/);
 const runner=store.register('Runner').player;const upgrade=chat.start('twitch',runner);await chat.finish('twitch',callback(upgrade),upgrade.cookie);
 assert.equal(chat.view(runner).twitch.connected,true);assert.equal(chat.view(two.player).twitch.connected,false);
 const forbidden=chat.start('twitch',one.player);await assert.rejects(chat.finish('twitch',callback(forbidden),forbidden.cookie),/another runner/);
});
test('bot-only Discord requires OAuth and managed guilds without enabling runner recovery',async t=>{
 let now=Date.now();const store=new Store(':memory:',()=>now);t.after(()=>store.close());const one=guest(store),two=guest(store),site=new DiscordSite(store,env,fetcher);
 assert.equal(site.status(one.player,'').connected,false);await assert.rejects(site.guilds(one.player,''),/Connect Discord/);
 const start=site.start(one.player);await assert.rejects(site.finish(callback(start),'bad'),/browser/);const cookie=await site.finish(callback(start),start.cookie);
 assert.equal(site.status(one.player,cookie).connected,true);assert.equal(site.status(two.player,cookie).connected,false);
 assert.equal((await site.guilds(one.player,cookie))[0].id,'11111');assert.equal(site.recoveryStatus(one.player).enabled,false);assert.equal(store.list('players').length,0);
 now+=31*86400000;assert.equal(ownerKey(store,one.player.id),null);assert.equal(site.status(one.player,cookie).connected,false);
});
test('HTTP guest bot setup stays isolated from runner data and rejects cross-site changes',async t=>{
 const store=new Store(':memory:');const app=createApp({store,env,fetcher});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.stop();store.close();});const base='http://127.0.0.1:'+app.server.address().port;
 const start=await fetch(base+'/api/me/chatbot/twitch/connect',{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN}});assert.equal(start.status,200);
 const cookies=start.headers.getSetCookie();assert.equal(cookies.length,2);assert.ok(cookies.some(c=>c.startsWith('monty_bot=')&&c.includes('HttpOnly')&&c.includes('Secure')));
 const cookie=cookies.map(c=>c.split(';')[0]).join('; '),url=(await start.json()).url;
 const done=await fetch(base+'/api/chatbot/callback/twitch?'+new URLSearchParams({state:new URL(url).searchParams.get('state'),code:'code'}),{headers:{Cookie:cookie},redirect:'manual'});assert.equal(done.status,303);assert.match(done.headers.get('location'),/connected/);
 const status=await fetch(base+'/api/me/chatbot',{headers:{Cookie:cookie}});assert.equal((await status.json()).twitch.connected,true);
 for(const path of ['/api/me','/api/me/history'])assert.equal((await fetch(base+path,{headers:{Cookie:cookie}})).status,401);
 for(const path of ['/api/ingest','/api/me/rotate','/api/me/source'])assert.equal((await fetch(base+path,{method:'POST',headers:{Cookie:cookie,Origin:env.PUBLIC_ORIGIN}})).status,401);
 const blocked=await fetch(base+'/api/me/chatbot/twitch/settings',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.example'}});assert.equal(blocked.status,403);
 const logout=await fetch(base+'/api/me/chatbot/signout',{method:'POST',headers:{Cookie:cookie,Origin:env.PUBLIC_ORIGIN}});assert.equal(logout.status,200);
 const after=await fetch(base+'/api/me/chatbot',{headers:{Cookie:cookie}});assert.equal((await after.json()).twitch.connected,false);
 assert.equal(store.list('players').length,0);
});
