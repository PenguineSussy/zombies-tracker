import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {ChatConnections,chatTargets,channelCooldown} from '../src/chat-connections.js';
import {ChatResponder} from '../src/chat.js';
import {createApp} from '../src/server.js';
const env={PUBLIC_ORIGIN:'https://tracker.example',TWITCH_CLIENT_ID:'app',TWITCH_CLIENT_SECRET:'secret',TWITCH_ACCESS_TOKEN:'bot',TWITCH_BOT_USER_ID:'bot-id',YOUTUBE_CLIENT_ID:'google',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_ACCESS_TOKEN:'bot',YOUTUBE_BOT_CHANNEL_ID:'bot-channel'};
const response=data=>({ok:true,json:async()=>data});
function fixture(t){const store=new Store();t.after(()=>store.close());return {store,...store.register('Runner')};}
function callback(start){return new URLSearchParams({state:new URL(start.url).searchParams.get('state'),code:'code'});}
test('Twitch OAuth binds browser, provider and runner; connection is disabled until enabled; no token exposed',async t=>{
 const {store,player,token}=fixture(t);let calls=0;
 const chat=new ChatConnections(store,env,async url=>{calls++;return response(url.includes('/token')?{access_token:'private-token'}:{data:[{id:'123',display_name:'RunnerTwitch'}]});});
 const start=chat.start('twitch',player,token),q=callback(start);
 await assert.rejects(chat.finish('twitch',q,'wrong'),/browser/);assert.equal(calls,0);
 await chat.finish('twitch',q,start.cookie);
 await assert.rejects(chat.finish('twitch',q,start.cookie),/expired/);
 assert.equal(chat.view(player).twitch.enabled,false);assert.ok(!JSON.stringify(chat.view(player)).includes('private-token'));
 await chat.settings('twitch',player,{enabled:true,cooldownSeconds:30});assert.deepEqual(chatTargets(store,env,'twitch'),['123']);assert.equal(channelCooldown(store,'twitch','123'),30);
 await assert.rejects(chat.settings('twitch',player,{enabled:true,cooldownSeconds:0}),/5 to 300/);
 chat.disconnect('twitch',player);assert.deepEqual(chatTargets(store,{...env,TWITCH_CHANNEL_IDS:'123'},'twitch'),[]);
});
test('rotated runner key and channel linked to another runner reject OAuth',async t=>{
 const {store,player,token}=fixture(t);const chat=new ChatConnections(store,env,async url=>response(url.includes('/token')?{access_token:'token'}:{data:[{id:'123',display_name:'Runner'}]}));
 let start=chat.start('twitch',player,token);store.rotate(player);await assert.rejects(chat.finish('twitch',callback(start),start.cookie),/sign-in changed/);
 const other=store.register('Other');store.put('metadata','other-connection',{kind:'chat-connection',player:player.id,provider:'twitch',channelId:'123',connected:true});
 start=chat.start('twitch',other.player,other.token);await assert.rejects(chat.finish('twitch',callback(start),start.cookie),/another runner/);
});
test('YouTube only enables active broadcasts owned by verified channel and removes credentials on disconnect',async t=>{
 const {store,player,token}=fixture(t);
 const chat=new ChatConnections(store,env,async url=>response(url.includes('/token')?{access_token:'private-token',refresh_token:'private-refresh'}:url.includes('/channels?')?{items:[{id:'own',snippet:{title:'My Channel'}}]}:{items:[{id:'ours',snippet:{channelId:'own',title:'Live',liveChatId:'chat-own'}},{id:'foreign',snippet:{channelId:'other',title:'Other',liveChatId:'chat-other'}}]}));
 const start=chat.start('youtube',player,token);await chat.finish('youtube',callback(start),start.cookie);
 assert.equal((await chat.broadcasts(player)).length,1);
 await assert.rejects(chat.settings('youtube',player,{enabled:true,cooldownSeconds:15,broadcastId:'foreign'}),/belonging/);
 await chat.settings('youtube',player,{enabled:true,cooldownSeconds:15,broadcastId:'ours'});assert.deepEqual(chatTargets(store,env,'youtube'),['chat-own']);
 assert.ok(!JSON.stringify(chat.view(player)).includes('private-'));
 chat.disconnect('youtube',player);assert.ok(!JSON.stringify(store.list('metadata')).includes('private-'));
});
test('cooldowns are channel-specific with a separate global guard',t=>{
 const {store}=fixture(t);let now=0;const c=new ChatResponder(store,450,()=>now,ch=>ch==='slow'?30:5);
 assert.ok(c.respond('slow','a','1','!help'));now=2000;assert.ok(c.respond('fast','a','2','!help'));
 now=8000;assert.equal(c.respond('slow','b','3','!help'),null);assert.ok(c.respond('fast','b','4','!help'));
 now=30000;assert.ok(c.respond('slow','b','5','!help'));
});
test('HTTP chatbot endpoints require a runner key and OAuth start sets HttpOnly binding cookie',async t=>{
 const {store,token}=fixture(t);const app=createApp({store,env});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.stop());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 assert.equal((await fetch(base+'/api/me/chatbot')).status,401);
 const r=await fetch(base+'/api/me/chatbot/twitch/connect',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
 assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match((await r.json()).url,/id.twitch.tv/);
});
