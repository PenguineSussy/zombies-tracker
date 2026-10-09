import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DiscordSite,channelPermissions} from '../src/discord-site.js';
import {Store} from '../src/store.js';
import {createApp} from '../src/server.js';
const env={DISCORD_APP_ID:'99999',DISCORD_BOT_TOKEN:'private-bot',DISCORD_CLIENT_SECRET:'private-secret',PUBLIC_ORIGIN:'https://tracker.example'};
const guild='11111',channel='22222',role='33333',uid='44444',bid='55555';
function fixture(t){
 let now=1700000000000;const store=new Store(':memory:',()=>now);t.after(()=>store.close());const {player,token}=store.register('Runner');
 const state={manage:true,installed:true,visible:true,send:true,mentionable:true,calls:[]};
 const fetcher=async(url,options={})=>{
  const path=new URL(url).pathname;state.calls.push(path);let data;
  if(path.endsWith('/oauth2/token'))data={access_token:'private-user',expires_in:3600,scope:'identify guilds'};
  else if(path.endsWith('/users/@me/guilds'))data=options.headers.Authorization.startsWith('Bot ')?(state.installed?[{id:guild}]:[]):[{id:guild,name:'My server',permissions:state.manage?'32':'0'},{id:'77777',name:'No management',permissions:'0'}];
  else if(path.endsWith('/users/@me'))data=options.headers.Authorization.startsWith('Bot ')?{id:bid}:{id:uid,username:'DiscordRunner'};
  else if(!state.installed)return new Response('{}',{status:404});
  else if(path.endsWith('/roles'))data=[{id:guild,name:'@everyone',permissions:'3072'},{id:role,name:'Speedruns',permissions:'0',mentionable:state.mentionable}];
  else if(path.endsWith('/channels'))data=[{id:channel,name:'runs',type:0,permission_overwrites:[{id:uid,type:1,deny:state.visible?'0':'1024',allow:'0'},{id:bid,type:1,deny:state.send?'0':'2048',allow:'0'}]},{id:'66666',name:'voice',type:2}];
  else if(path.includes('/members/'))data={user:{id:path.split('/').at(-1)},roles:[]};
  else if(path==='/api/v10/guilds/'+guild)data={id:guild,owner_id:'88888'};
  else throw Error('Unexpected Discord request '+path);
  return Response.json(data);
 };
 const site=new DiscordSite(store,env,fetcher);
 async function connect(){const start=site.start(player);const q=new URLSearchParams({state:new URL(start.url).searchParams.get('state'),code:'synthetic'});return site.finish(q,start.cookie);}
 return {store,player,token,site,fetcher,state,connect,advance:ms=>{now+=ms;}};
}
const alert={channel,role,player:'Runner',split:'Rocket',profile:{map:'der-eisendrache',category:'Mega Gums'},mode:'milestone'};
test('Discord authorization binds browser and runner, expires, and never exposes or persists tokens',async t=>{
 const f=fixture(t),start=f.site.start(f.player),q=new URLSearchParams({state:new URL(start.url).searchParams.get('state'),code:'code'});
 assert.equal(new URL(start.url).searchParams.get('scope'),'identify guilds');
 await assert.rejects(f.site.finish(q,'wrong'),/browser verification/);assert.equal(f.state.calls.length,0);
 const cookies=await f.site.finish(q,start.cookie);await assert.rejects(f.site.finish(q,start.cookie),/expired/);
 assert.equal(f.site.status(f.player,cookies).connected,true);
 assert.doesNotMatch(JSON.stringify(f.site.status(f.player,cookies)),/private-user|private-bot|private-secret/);
 assert.doesNotMatch(JSON.stringify(f.store.list('metadata')),/private-user/);
 const other=f.store.register('Other');assert.throws(()=>f.site.session(other.player,cookies),/Connect Discord/);
 f.advance(3600001);assert.throws(()=>f.site.session(f.player,cookies),/Connect Discord/);
 const fresh=await f.connect();f.store.rotate(f.player);assert.throws(()=>f.site.session(f.player,fresh),/Connect Discord/);
 const next=await f.connect();f.site.disconnect(next);assert.equal(f.site.status(f.player,next).connected,false);
});
test('Discord only lists managed servers and validates guild, channel, role and runner on each alert mutation',async t=>{
 const f=fixture(t),cookie=await f.connect();
 assert.deepEqual((await f.site.guilds(f.player,cookie)).map(g=>[g.id,g.installed]),[[guild,true]]);
 const data=await f.site.details(f.player,cookie,guild);assert.deepEqual(data.channels.map(c=>c.id),[channel]);assert.deepEqual(data.channels[0].roleIds,[role]);
 const sub=await f.site.save(f.player,cookie,guild,alert);assert.equal(sub.guild,guild);assert.equal(sub.player,'runner');
 assert.equal((await f.site.details(f.player,cookie,guild)).alerts.length,1);
 await assert.rejects(f.site.save(f.player,cookie,guild,{...alert,channel:'12345'}),/channel/);
 await assert.rejects(f.site.save(f.player,cookie,guild,{...alert,role:'12345'}),/role/);
 await assert.rejects(f.site.save(f.player,cookie,guild,{...alert,role:guild}),/role/);
 await assert.rejects(f.site.save(f.player,cookie,'77777',alert),/Manage Server/);
 await assert.rejects(f.site.save(f.player,cookie,guild,{...alert,split:''}),/checkpoint/);
 f.store.privacy(f.player,false);await assert.rejects(f.site.save(f.player,cookie,guild,alert),/public runner/);f.store.privacy(f.player,true);
 f.state.mentionable=false;await assert.rejects(f.site.save(f.player,cookie,guild,alert),/mentionable/);f.state.mentionable=true;
 f.state.manage=false;await assert.rejects(f.site.remove(f.player,cookie,guild,sub.id),/Manage Server/);assert.ok(f.store.get('subscriptions',sub.id));
 f.state.manage=true;f.state.visible=false;await assert.rejects(f.site.save(f.player,cookie,guild,alert),/channel/);assert.equal((await f.site.details(f.player,cookie,guild)).alerts.length,0);
 f.state.visible=true;f.state.send=false;assert.equal((await f.site.details(f.player,cookie,guild)).channels.length,0);
 f.state.send=true;await f.site.remove(f.player,cookie,guild,sub.id);assert.equal(f.store.get('subscriptions',sub.id),null);
 f.state.installed=false;assert.equal((await f.site.guilds(f.player,cookie))[0].installed,false);await assert.rejects(f.site.save(f.player,cookie,guild,alert),/unavailable/);
});
test('Discord channel permission overwrites honor role and member ordering',()=>{
 const g={id:guild,owner_id:'88888'},roles=[{id:guild,permissions:'3072'},{id:role,permissions:'0'}],member={user:{id:uid},roles:[role]};
 const c={permission_overwrites:[{id:guild,type:0,deny:'2048',allow:'0'},{id:role,type:0,deny:'0',allow:'2048'},{id:uid,type:1,deny:'1024',allow:'0'}]};
 assert.equal(channelPermissions(g,roles,member,c),2048n);
 roles[1].permissions='8';assert.equal(channelPermissions(g,roles,member,c)&3072n,3072n);
});
test('Discord website routes require runner sign-in, same origin, and bound Discord session',async t=>{
 const f=fixture(t),app=createApp({store:f.store,env,fetcher:f.fetcher});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.stop());const origin='http://127.0.0.1:'+app.server.address().port;
 const headers={Authorization:'Bearer '+f.token,Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/json'};
 assert.equal((await fetch(origin+'/api/me/discord/guilds')).status,401);
 assert.equal((await fetch(origin+'/api/me/discord/connect',{method:'POST',headers:{Authorization:headers.Authorization}})).status,403);
 const start=await fetch(origin+'/api/me/discord/connect',{method:'POST',headers,body:'{}'}),cookie=start.headers.get('set-cookie'),data=await start.json();
 const callback=new URL(data.url).searchParams.get('state');const result=await fetch(origin+'/api/discord/callback?state='+callback+'&code=code',{headers:{Cookie:cookie},redirect:'manual'});
 assert.equal(result.status,303);const auth={...headers,Cookie:result.headers.get('set-cookie')};
 assert.equal((await fetch(origin+'/api/me/discord/guilds',{headers:auth})).status,200);
 const saved=await fetch(origin+'/api/me/discord/guilds/'+guild+'/alerts',{method:'POST',headers:auth,body:JSON.stringify(alert)});assert.equal(saved.status,201);
 const id=(await saved.json()).id;assert.equal((await fetch(origin+'/api/me/discord/guilds/77777/alerts/'+id,{method:'DELETE',headers:auth})).status,403);
 assert.equal((await fetch(origin+'/api/me/discord/guilds/'+guild+'/alerts/'+id,{method:'DELETE',headers:auth})).status,200);
 assert.equal((await fetch(origin+'/discord-panel.js')).status,200);
});

test('Website alerts default to all runners and save name lists atomically',async t=>{
 const f=fixture(t),cookie=await f.connect();f.store.register('Second');
 const all=await f.site.save(f.player,cookie,guild,{...alert,player:undefined});assert.equal(all.player,'*');
 const result=await f.site.save(f.player,cookie,guild,{...alert,player:' Runner, @Second, RUNNER '});assert.deepEqual(result.alerts.map(a=>a.player),['runner','second']);
 const count=f.store.list('subscriptions').length;
 await assert.rejects(f.site.save(f.player,cookie,guild,{...alert,player:'Runner, Missing'}),/public runner/);
 await assert.rejects(f.site.save(f.player,cookie,guild,{...alert,player:'*, Runner'}),/by itself/);
 await assert.rejects(f.site.save(f.player,cookie,guild,{...alert,player:'Runner,'}),/runner names/);
 assert.equal(f.store.list('subscriptions').length,count);
 const {discordCheckpoints}=await import('../src/discord-site.js');
 assert.ok(discordCheckpoints('der-eisendrache').includes('Rocket'));
 assert.ok(!discordCheckpoints('origins').includes('Fire Dupe'));
 assert.ok(discordCheckpoints('super-easter-egg').includes('Shadows of Evil - Sword'));
 assert.deepEqual(discordCheckpoints('the-giant'),['End']);
});
