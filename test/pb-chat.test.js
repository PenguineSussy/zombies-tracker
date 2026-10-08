import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {ChatResponder} from '../src/chat.js';
import {profileKey,parseCommand} from '../src/domain.js';
const de={map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'};
function fixture(t){const store=new Store();t.after(()=>store.close());for(const name of ['Penguine','Other']){const {player}=store.register(name);player.profile={...de,map:'gorod-krovi'};store.savePlayer(player);for(const [category,ms]of [['Mega Gums',name==='Penguine'?1558065:1800000],['Classic Gums',2000000]]){const profile={...de,category};store.put('metadata',`saved-records:${player.id}:${profileKey(profile)}`,{profile,pbMs:ms,splits:[]});}}return store;}
function responder(store,provider){let now=0;const r=new ChatResponder(store,450,()=>now,()=>0,provider);return (text,channel='channel')=>{now+=6000;return r.respond(channel,'viewer',String(now),text);};}
function link(store,provider,player='penguine',extra={}){store.put('metadata',`chat-connection:${provider}:${player}`,{kind:'chat-connection',provider,player,target:'channel',connected:true,enabled:true,...extra});}
test('PB map queries preserve category isolation regardless of active map',t=>{
 const s=fixture(t);
 assert.match(s.answer('!PB @Penguine DE'),/Penguine.*Der Eisendrache.*Mega Gums.*25:58.065/);
 assert.match(s.answer('!pb @Penguine DE Classic Gums'),/Classic Gums.*33:20/);
 assert.match(s.answer('!pb @Penguine DE No Gums'),/No Gums.*unavailable/);
 assert.match(s.answer('!pb @Penguine'),/Gorod Krovi.*unavailable/);
 assert.match(s.answer('!pb @Penguine DE wrong'),/Choose No Gums/);
 assert.match(s.answer('!pb @Penguine Ascension No Gums'),/allows only: Any%/);
 assert.equal(parseCommand('!pb DE').player,undefined);
 assert.equal(parseCommand('!pb "Der Eisendrache"').profile.map,'der-eisendrache');
});
test('Twitch and YouTube PB auto-target their verified channel runner, not sender or other provider',t=>{
 const s=fixture(t);link(s,'twitch');link(s,'youtube','other');
 const twitch=responder(s,'twitch'),youtube=responder(s,'youtube');
 assert.match(twitch('!PB DE'),/Penguine.*25:58.065/);
 assert.match(youtube('!pb DE'),/Other.*30:00/);
 assert.match(twitch('!pb @Other DE'),/Other.*30:00/);
 assert.match(youtube('@littlemontybot !pb @Penguine DE'),/Penguine.*25:58.065/);
 assert.match(twitch('!pb DE','unlinked'),/not linked/);
 link(s,'twitch','penguine',{enabled:false});assert.match(twitch('!pb DE'),/not linked/);
 assert.match(s.answer('!pb DE'),/not linked/);
});
test('PB lookup does not expose private runners or guess ambiguous chat ownership',t=>{
 const s=fixture(t);link(s,'twitch');const reply=responder(s,'twitch');
 s.privacy(s.get('players','penguine'),false);
 assert.match(reply('!pb DE'),/isn't sharing/);
 assert.match(reply('!pb @Penguine DE'),/isn't sharing/);
 link(s,'twitch','other');assert.match(reply('!pb DE'),/not linked/);
});
test('PB map queries also include completed tracked runs and exclude practice',t=>{
 const s=fixture(t);for(const [id,ms,practice]of [['normal',1500000,false],['practice',100,true]])s.saveAttempt({id,player:'penguine',profile:de,phase:'Ended',complete:true,practice,elapsedMs:ms});
 assert.match(s.answer('!pb @Penguine DE'),/PB: 25:00 RTA/);
});
test('all runner commands select the current platform/channel owner unless explicitly mentioned',t=>{
 const s=fixture(t);link(s,'twitch');link(s,'youtube','other');
 for(const provider of ['twitch','youtube']){
  const reply=responder(s,provider),owner=provider==='twitch'?'Penguine':'Other',foreign=owner==='Penguine'?'Other':'Penguine';
  for(const command of ['!current','!session','!sessionpb','!splits','!splits alltime','!pace','!best Rocket alltime','!pb DE']){
   assert.match(reply(command),new RegExp(owner),provider+' '+command);
   const explicit=command.replace(/^(\S+)/,`$1 @${foreign}`);
   assert.match(reply(explicit),new RegExp(foreign),provider+' '+explicit);
  }
  assert.match(reply('!current','unlinked'),/not linked/);
  assert.match(reply('!wr DE'),/SOLO WR|Solo WR/);
 }
 s.privacy(s.get('players','penguine'),false);assert.match(responder(s,'twitch')('!current'),/isn't sharing/);
 link(s,'twitch','other');assert.match(responder(s,'twitch')('!current'),/not linked/);
 assert.match(s.answer('!current'),/not linked/);
});
