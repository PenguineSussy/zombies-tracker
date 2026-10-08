import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {ChatConnections,connectionKey,chatTargets} from '../src/chat-connections.js';
import {ChatResponder} from '../src/chat.js';
import {checkTwitchStreams,checkYouTubeStreams,checkLinkedYouTubeStreams} from '../src/stream-monitor.js';
import {verifiedLiveStreams,publicStreams} from '../src/streams.js';
import {deliverAlerts} from '../src/discord.js';
import {streamCandidates,distinctSlots} from '../public/watch.js';
const env={PUBLIC_ORIGIN:'https://tracker.example',TWITCH_CLIENT_ID:'app',TWITCH_CLIENT_SECRET:'secret',TWITCH_ACCESS_TOKEN:'bot',TWITCH_BOT_USER_ID:'bot',YOUTUBE_CLIENT_ID:'yt',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_ACCESS_TOKEN:'bot',YOUTUBE_BOT_CHANNEL_ID:'bot'};
const json=data=>new Response(JSON.stringify(data));
function fixture(t){let now=1700000000000;const store=new Store(':memory:',()=>now);t.after(()=>store.close());return {store,...store.register('Runner'),advance:ms=>{now+=ms;}};}
async function link(chat,provider,player,token,slot){const s=chat.start(provider,player,token,slot);await chat.finish(provider,new URLSearchParams({state:new URL(s.url).searchParams.get('state'),code:'test'}),s.cookie);}

test('three accounts per platform retain ownership, independent settings and implicit runner commands',async t=>{
 const {store,player,token}=fixture(t);let account='';
 const chat=new ChatConnections(store,env,async url=>json(url.includes('/token')?{access_token:'never-expose',refresh_token:'never-expose-refresh'}:url.includes('helix/users')?{data:[{id:account,login:account,display_name:account}]}:url.includes('/channels?')?{items:[{id:account,snippet:{title:account}}]}:{items:[{id:account+'video',snippet:{channelId:account,title:'Stream',liveChatId:account+'chat'}}]}));
 for(const provider of ['twitch','youtube'])for(const slot of [0,1,2]) {
  account=provider+slot;await link(chat,provider,player,token,slot);await chat.settings(provider,player,{slot,enabled:true,cooldownSeconds:15+slot,broadcastId:account+'video'});
 }
 assert.equal(chat.view(player).twitch.accounts.filter(a=>a.connected).length,3);assert.equal(chat.view(player).youtube.accounts.filter(a=>a.connected).length,3);
 assert.doesNotMatch(JSON.stringify(chat.view(player)),/never-expose/);
 for(const provider of ['twitch','youtube']) {
  assert.equal(chatTargets(store,env,provider).length,3);
  for(const target of chatTargets(store,env,provider))assert.match(new ChatResponder(store,450,Date.now,()=>15,provider).respond(target,'viewer',target,'!current'),/Runner/i);
 }
 account='twitch0';await assert.rejects(link(chat,'twitch',player,token,1),/already linked/);
 assert.throws(()=>chat.start('twitch',player,token,3),/Main/);assert.throws(()=>chat.start('twitch',player,token,false),/Main/);
 chat.disconnect('twitch',player,1);assert.equal(chatTargets(store,env,'twitch').length,2);assert.equal(chat.view(player).twitch.connected,true);
 chat.disconnect('youtube',player,2);assert.equal(chat.view(player).youtube.accounts[1].connected,true);assert.ok(!store.get('metadata',connectionKey('youtube',player.id,2)).accessToken);
});

test('live alternate replaces offline main, checks expire and private runners never expose links',async t=>{
 const {store,player,advance}=fixture(t);
 store.streams(player,{twitchAccounts:['https://twitch.tv/mainrunner','https://twitch.tv/altrunner',''],youtubeAccounts:['https://youtu.be/abcdefghijk'],live:false});
 await checkTwitchStreams(store,{request:async url=>{assert.match(url,/mainrunner/);assert.match(url,/altrunner/);return json({data:[{type:'live',user_login:'altrunner'}]});}},'client');
 let p=store.get('players',player.id);assert.equal(verifiedLiveStreams(store,p)[0].url,'https://www.twitch.tv/altrunner');
 await checkYouTubeStreams(store,{request:async()=>json({items:[{id:'abcdefghijk',status:{privacyStatus:'public'},snippet:{liveBroadcastContent:'live'},liveStreamingDetails:{actualStartTime:'2026-10-08T10:00:00Z'}}]})});
 p=store.get('players',player.id);assert.equal(verifiedLiveStreams(store,p)[0].platform,'youtube');
 const streams=streamCandidates([{...p,streams:publicStreams(p,store.clock(),store)}]);assert.equal(streams.length,2);assert.equal(distinctSlots(streams,streams.map(s=>s.key)).filter(Boolean).length,1);
 advance(120001);assert.deepEqual(verifiedLiveStreams(store,p),[]);p.public=false;assert.equal(publicStreams(p,store.clock(),store),null);
 assert.throws(()=>store.streams(p,{twitchAccounts:Array(4).fill(''),live:false}),/two alternates/);
 assert.throws(()=>store.streams(p,{twitchAccounts:['https://twitch.tv/same','https://www.twitch.tv/SAME'],live:false}),/different stream/);
});

test('YouTube scheduled, ended, private and manual live checkbox are not confirmed live',async t=>{
 const {store,player}=fixture(t);store.streams(player,{youtube:'https://youtu.be/abcdefghijk',live:true});
 assert.deepEqual(verifiedLiveStreams(store,player),[]);
 for(const item of [
  {id:'abcdefghijk',status:{privacyStatus:'public'},snippet:{liveBroadcastContent:'upcoming'},liveStreamingDetails:{scheduledStartTime:'2026-10-09'}},
  {id:'abcdefghijk',status:{privacyStatus:'public'},snippet:{liveBroadcastContent:'live'},liveStreamingDetails:{actualStartTime:'2026-10-08',actualEndTime:'2026-10-08'}},
  {id:'abcdefghijk',status:{privacyStatus:'private'},snippet:{liveBroadcastContent:'live'},liveStreamingDetails:{actualStartTime:'2026-10-08'}}
 ]){await checkYouTubeStreams(store,{request:async()=>json({items:[item]})});assert.deepEqual(verifiedLiveStreams(store,store.get('players',player.id)),[]);}
});

test('connected YouTube alternates discover active broadcasts without requiring chat and disappear on disconnect',async t=>{
 const {store,player}=fixture(t);const key=connectionKey('youtube',player.id,2);store.put('metadata',key,{kind:'chat-connection',player:player.id,slot:2,provider:'youtube',connected:true,channelId:'owner',accessToken:'secret'});
 await checkLinkedYouTubeStreams(store,{broadcasts:async(p,slot,options)=>{assert.equal(slot,2);assert.equal(options.publicOnly,true);assert.equal(options.requireChat,false);return [{id:'abcdefghijk'}];}});
 assert.equal(verifiedLiveStreams(store,player)[0].url,'https://www.youtube.com/watch?v=abcdefghijk');
 new ChatConnections(store,env).disconnect('youtube',player,2);assert.deepEqual(verifiedLiveStreams(store,player),[]);
});

test('Discord role alert uses confirmed live link or exact Currently Offline fallback',async t=>{
 const {store,player}=fixture(t);player.activeAttempt='attempt';store.savePlayer(player);store.streams(player,{twitchAccounts:['https://twitch.tv/mainrunner','https://twitch.tv/altrunner'],live:false});
 store.put('subscriptions','sub',{enabled:true});
 async function send(id){store.put('outbox',id,{id,player:player.id,attempt:'attempt',subscription:'sub',channel:'channel',role:'123',content:'Runner reached Rocket',createdAt:store.clock(),status:'pending',nextTry:0,tries:0});let body;await deliverAlerts(store,'fake-token',async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true};});return body;}
 assert.match((await send('offline')).content,/\nCurrently Offline$/);
 await checkTwitchStreams(store,{request:async()=>json({data:[{type:'live',user_login:'altrunner'}]})},'client');
 const msg=await send('live');assert.match(msg.content,/Watch live: https:\/\/www.twitch.tv\/altrunner$/);assert.deepEqual(msg.allowed_mentions,{parse:[],roles:['123']});assert.doesNotMatch(msg.content,/mainrunner/);
});
