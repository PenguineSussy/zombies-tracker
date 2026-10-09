import {randomBytes,createHash} from 'node:crypto';
import {check,milliseconds,profile} from './domain.js';
import {MAPS} from './domain.js';
import {SPLIT_RULES} from './split-rules.js';
export function discordCheckpoints(map){
 if(map==='super-easter-egg')return ['shadows-of-evil','the-giant','der-eisendrache','zetsubou-no-shima','gorod-krovi','revelations'].flatMap(id=>{const name=MAPS.find(m=>m.id===id).name;return [...discordCheckpoints(id).filter(n=>n!=='End').map(n=>name+' - '+n),name+' - Complete'];});
 return [...new Set([...(SPLIT_RULES[map]??[]).map(r=>r.name),'End',...(map==='zetsubou-no-shima'?['KT4']:[])])];
}
const hash=v=>createHash('sha256').update(v??'').digest('hex');
const api='https://discord.com/api/v10';
const snowflake=v=>typeof v==='string'&&/^\d{5,25}$/.test(v);
const cookie=(raw,name)=>String(raw??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
const manage=g=>g.owner||(BigInt(g.permissions??0)&40n)!==0n;
export function channelPermissions(guild,roles,member,channel){
 if(member.user?.id===guild.owner_id)return ~0n;
 let bits=BigInt(roles.find(r=>r.id===guild.id)?.permissions??0);
 for(const r of roles)if(member.roles.includes(r.id))bits|=BigInt(r.permissions);
 if(bits&8n)return ~0n;
 const overwrites=channel.permission_overwrites??[];
 const everyone=overwrites.find(o=>o.type===0&&o.id===guild.id);
 if(everyone)bits=(bits&~BigInt(everyone.deny))|BigInt(everyone.allow);
 let deny=0n,allow=0n;
 for(const o of overwrites)if(o.type===0&&member.roles.includes(o.id)){deny|=BigInt(o.deny);allow|=BigInt(o.allow);}
 bits=(bits&~deny)|allow;
 const personal=overwrites.find(o=>o.type===1&&o.id===member.user?.id);
 return personal?(bits&~BigInt(personal.deny))|BigInt(personal.allow):bits;
}
export class DiscordSite {
 constructor(store,env,fetcher=fetch){Object.assign(this,{store,env,fetcher});this.pending=new Map();this.sessions=new Map();}
 available(){return !!(this.env.DISCORD_APP_ID&&this.env.DISCORD_BOT_TOKEN&&this.env.DISCORD_CLIENT_SECRET&&this.env.PUBLIC_ORIGIN);}
 invite(guild){
  if(!this.env.DISCORD_APP_ID)return null;
  const q=new URLSearchParams({client_id:this.env.DISCORD_APP_ID,scope:'bot applications.commands',permissions:'3072',integration_type:'0'});
  if(guild){q.set('guild_id',guild);q.set('disable_guild_select','true');}
  return 'https://discord.com/oauth2/authorize?'+q;
 }
 config(){return {available:this.available(),inviteUrl:this.invite()};}
 keyHash(player){return this.store.db.prepare('SELECT token FROM players WHERE id=?').get(player.id)?.token;}
 valid(record,player){return record&&record.expires>this.store.clock()&&record.player===player.id&&this.keyHash(player)===record.keyHash;}
 sweep(){for(const map of [this.pending,this.sessions])for(const [k,v]of map)if(v.expires<=this.store.clock())map.delete(k);}
 session(player,cookies){this.sweep();const key=hash(cookie(cookies,'monty_discord'));const s=this.sessions.get(key);check(this.valid(s,player),'Connect Discord again to manage server alerts.',403);return s;}
 status(player,cookies){const s=this.sessions.get(hash(cookie(cookies,'monty_discord')));return {...this.config(),connected:!!this.valid(s,player),name:this.valid(s,player)?s.name:null};}
 cookie(name,value,path,seconds){return `${name}=${value}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${seconds}${this.env.PUBLIC_ORIGIN?.startsWith('https:')?'; Secure':''}`;}
 start(player){
  check(this.available(),'Discord account linking is awaiting server setup.',503);this.sweep();check(this.pending.size<1000,'Try again later.',429);
  const origin=new URL(this.env.PUBLIC_ORIGIN);check(origin.origin===this.env.PUBLIC_ORIGIN&&(origin.protocol==='https:'||origin.hostname==='localhost'||origin.hostname==='127.0.0.1'),'Invalid public origin.',503);
  const state=randomBytes(32).toString('base64url'),proof=randomBytes(32).toString('base64url'),redirect=origin.origin+'/api/discord/callback';
  this.pending.set(state,{player:player.id,keyHash:this.keyHash(player),proof:hash(proof),redirect,expires:this.store.clock()+600000});
  return {url:'https://discord.com/oauth2/authorize?'+new URLSearchParams({client_id:this.env.DISCORD_APP_ID,response_type:'code',redirect_uri:redirect,scope:'identify guilds',state,prompt:'consent'}),cookie:this.cookie('discord_oauth',proof,'/api/discord/callback',600)};
 }
 async finish(query,cookies){
  this.sweep();const state=query.get('state'),p=this.pending.get(state);
  check(p&&p.proof===hash(cookie(cookies,'discord_oauth')),'Discord authorization expired or browser verification failed.',400);this.pending.delete(state);
  const player={id:p.player};check(this.valid(p,player),'Runner sign-in changed. Sign in again.',401);
  check(!query.has('error')&&query.get('code'),'Discord authorization cancelled.',400);
  const r=await this.fetcher(api+'/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:this.env.DISCORD_APP_ID,client_secret:this.env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:query.get('code'),redirect_uri:p.redirect}),signal:AbortSignal.timeout(10000)});
  check(r.ok,'Discord authorization failed. Try connecting again.',400);const t=await r.json();
  check(t.access_token&&['identify','guilds'].every(s=>String(t.scope??'').split(' ').includes(s)),'Required Discord permissions were not granted.',403);
  const user=await this.request('/users/@me','Bearer '+t.access_token);
  check(snowflake(user.id)&&this.valid(p,player),'Runner sign-in changed. Sign in again.',401);
  check(this.sessions.size<2000,'Try connecting again later.',429);
  const value=randomBytes(32).toString('base64url'),seconds=Math.min(3600,Number(t.expires_in)||3600);
  this.sessions.set(hash(value),{player:p.player,keyHash:p.keyHash,accessToken:t.access_token,userId:user.id,name:user.global_name??user.username,expires:this.store.clock()+seconds*1000});
  return this.cookie('monty_discord',value,'/api/me/discord',seconds);
 }
 disconnect(cookies){this.sessions.delete(hash(cookie(cookies,'monty_discord')));return this.cookie('monty_discord','','/api/me/discord',0);}
 async request(path,authorization){
  const r=await this.fetcher(api+path,{headers:{Authorization:authorization},signal:AbortSignal.timeout(10000)});
  check(r.status!==429,'Discord is busy. Wait a moment and refresh.',429);
  check(r.status!==401,'Discord authorization expired. Reconnect Discord.',403);
  check(r.ok,r.status===403||r.status===404?'Server or channel is unavailable. Check Discord permissions and that the bot is installed.':'Discord is unavailable. Try again later.',r.status===403||r.status===404?403:502);
  return r.json();
 }
 async listGuilds(authorization){
  const result=[];let after='';
  for(let i=0;i<25;i++){
   const rows=await this.request('/users/@me/guilds?limit=200'+(after?'&after='+after:''),authorization);
   result.push(...rows);if(rows.length<200)return result;
   after=rows.reduce((a,g)=>BigInt(g.id)>BigInt(a)?g.id:a,'0');
  }
  check(false,'Too many servers to list. Use Discord slash commands for now.',503);
 }
 async guilds(player,cookies){
  const s=this.session(player,cookies);
  const [mine,bot]=await Promise.all([this.listGuilds('Bearer '+s.accessToken),this.listGuilds('Bot '+this.env.DISCORD_BOT_TOKEN)]);
  this.session(player,cookies);
  return mine.filter(manage).map(g=>({id:g.id,name:g.name,installed:bot.some(b=>b.id===g.id),inviteUrl:this.invite(g.id)}));
 }
 async context(player,cookies,guildId){
  check(snowflake(guildId),'Choose a Discord server.',400);const s=this.session(player,cookies);
  const guilds=await this.listGuilds('Bearer '+s.accessToken);
  check(guilds.some(g=>g.id===guildId&&manage(g)),'Manage Server permission required.',403);
  const botAuth='Bot '+this.env.DISCORD_BOT_TOKEN;
  const bot=await this.request('/users/@me',botAuth);
  const [guild,roles,channels,member,botMember]=await Promise.all([
   this.request('/guilds/'+guildId,botAuth),this.request('/guilds/'+guildId+'/roles',botAuth),this.request('/guilds/'+guildId+'/channels',botAuth),
   this.request('/guilds/'+guildId+'/members/'+s.userId,botAuth),this.request('/guilds/'+guildId+'/members/'+bot.id,botAuth)
  ]);
  check(member.user?.id===s.userId&&botMember.user?.id===bot.id,'Discord membership could not be verified.',403);
  this.session(player,cookies);
  const permitted=channels.filter(c=>[0,5].includes(c.type)&&(channelPermissions(guild,roles,member,c)&1024n)!==0n&&(channelPermissions(guild,roles,botMember,c)&3072n)===3072n);
  return {guild,roles,channels:permitted,botMember};
 }
 async details(player,cookies,guildId){
  const c=await this.context(player,cookies,guildId);
  return {channels:c.channels.map(ch=>({id:ch.id,name:ch.name,roleIds:c.roles.filter(r=>r.id!==guildId&&!r.managed&&(r.mentionable||(channelPermissions(c.guild,c.roles,c.botMember,ch)&131072n)!==0n)).map(r=>r.id)})),roles:c.roles.filter(r=>r.id!==guildId&&!r.managed).map(r=>({id:r.id,name:r.name})),alerts:this.store.list('subscriptions').filter(s=>s.guild===guildId&&c.channels.some(ch=>ch.id===s.channel))};
 }
 async save(player,cookies,guildId,input){
  const c=await this.context(player,cookies,guildId),channel=c.channels.find(ch=>ch.id===input.channel);
  check(channel,'Choose a channel you can view where the bot can send messages.',403);
  const role=input.role?c.roles.find(r=>r.id===input.role):null;
  check(!input.role||(role&&role.id!==guildId&&!role.managed&&(role.mentionable||(channelPermissions(c.guild,c.roles,c.botMember,channel)&131072n)!==0n)),'Choose a mentionable role from this server.',403);
  const runners=[...new Set(String(input.player??'*').trim().split(',').map(n=>n.trim().replace(/^@/,'').toLowerCase()))];
  check(runners.length<=20&&!runners.includes(''),'Enter up to 20 runner names separated by commas, or * for all public runners.');
  check(!runners.includes('*')||runners.length===1,'Use * by itself for all public runners.');
  for(const runner of runners)check(runner==='*'||this.store.get('players',runner)?.public,'Choose a public runner or * for every public runner. Check: '+runner);
  check(typeof input.split==='string'&&input.split.trim().length>0&&input.split.length<=100,'Enter a checkpoint name.');
  check(this.store.list('subscriptions').filter(s=>s.guild===guildId).length+runners.length<=200,'This server has reached its 200-alert limit.',409);
  const common={guild:guildId,channel:channel.id,role:role?.id,profile:profile(input.profile),split:input.split,mode:input.mode,thresholdMs:input.mode==='under'?milliseconds(input.threshold):null};
  return this.store.transaction(()=>{const alerts=runners.map(runner=>this.store.subscribe({...common,player:runner}));return alerts.length===1?alerts[0]:{alerts};});
 }
 async remove(player,cookies,guildId,id){
  const c=await this.context(player,cookies,guildId),sub=this.store.get('subscriptions',id);
  check(sub?.guild===guildId&&c.channels.some(ch=>ch.id===sub.channel),'Alert not found in an accessible channel of this server.',404);
  this.store.db.prepare('DELETE FROM subscriptions WHERE id=?').run(id);return {removed:true};
 }
}
