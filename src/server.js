import {runnerArchived} from './runner-visibility.js';
import {addonRelease,addonStatus} from './addon-updates.js';
import {publicActivity} from './activity.js';
import {browserCookie,createBrowserSession,clearBrowserSession,browserSession,checkBrowserOrigin} from './browser-sessions.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { MAPS, ENABLED_MAPS, CATEGORIES, categoriesForMap, check } from './domain.js';
import { verifyDiscord, discordInteraction, deliverAlerts } from './discord.js';
import { sourceConfig, startTheRun } from './therun.js';
import { startTwitch, startYouTube } from './chat.js';
import { publicStreams } from './streams.js';
import { startStreamMonitor } from './stream-monitor.js';
import {startZwr} from './zwr.js';
import {ChatConnections} from './chat-connections.js';
import {DiscordSite,discordCheckpoints} from './discord-site.js';

const root=fileURLToPath(new URL('../public/',import.meta.url));
function equal(a,b) { return typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
async function body(req) {
  const chunks=[];let bytes=0;
  for await(const chunk of req) { bytes+=chunk.length;check(bytes<=262144,'Request too large.',413);chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export function createApp({store=new Store(),env={},connectors=false,fetcher=fetch}={}) {
  const chatbot=new ChatConnections(store,env,fetcher);
  const discordSite=new DiscordSite(store,env,fetcher);
  let stopChat=()=>{};
  const restartChat=()=>{stopChat();if(connectors){const stops=[startTwitch(store,env),startYouTube(store,env)];stopChat=()=>stops.forEach(stop=>stop());}};
  const limits=new Map();
  function limit(req,name,max,window=60000) {
    const now=Date.now(), key=`${req.socket.remoteAddress}:${name}`;
    for(const [id,item]of limits)if(item.end<now)limits.delete(id);
    let item=limits.get(key);if(!item){item={count:0,end:now+window};limits.set(key,item);}
    check(++item.count<=max,'Too many requests; try again later.',429);
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src https://player.twitch.tv https://www.youtube.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control','no-store');
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');const path=url.pathname;
      if(req.method==='GET'&&path==='/api/discord/callback') {
        limit(req,'discord-oauth',30);
        const recovering=!!discordSite.pending.get(url.searchParams.get('state'))?.recovery;
        try {const result=await discordSite.finish(url.searchParams,req.headers.cookie);res.setHeader('Set-Cookie',result.recoveryCookie??result);res.writeHead(303,{Location:result.recoveryCookie?'/?recovery=ready#setup':'/?discord=connected#integrations'});}
        catch(error){res.writeHead(303,{Location:'/?'+(recovering?'recovery':'discord')+'=error&reason='+encodeURIComponent(error.status?error.message:'Discord connection failed. Try again.')+(recovering?'#setup':'#integrations')});}
        res.end();return;
      }
      if(req.method==='GET'&&path.startsWith('/api/chatbot/callback/')) {
        limit(req,'oauth-callback',30);
        const provider=path.split('/').at(-1);
        try {await chatbot.finish(provider,url.searchParams,req.headers.cookie);restartChat();res.writeHead(303,{Location:'/?chatbot=connected#integrations'});res.end();}
        catch(error){res.writeHead(303,{Location:'/?chatbot=error&reason='+encodeURIComponent(error.status?error.message:'Connection failed. Please try again.')+'#integrations'});res.end();}
        return;
      }
      if(req.method==='GET' && path==='/downloads/Zombies-Tracker-LiveSplit.zip') {
        const content=await readFile(resolve(root,'downloads/Zombies-Tracker-LiveSplit.zip'));
        res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Zombies-Tracker-LiveSplit.zip"'});res.end(content);return;
      }
      if(req.method==='GET' && ['/','/app.js','/discord-panel.js','/watch.js','/activity.js','/style.css','/monty-logo.png'].includes(path)) {
        const file=path==='/'?'index.html':path.slice(1);const content=await readFile(resolve(root,file));
        res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});res.end(content);return;
      }
      if(req.method==='GET' && path==='/health')return send({ok:true,version:'1.0.0'});
      limit(req,'all',600);
      if(req.method==='GET' && path==='/api/catalog')return send({maps:ENABLED_MAPS,allMaps:MAPS,checkpointsByMap:Object.fromEntries(ENABLED_MAPS.map(m=>[m.id,discordCheckpoints(m.id)])),categories:CATEGORIES,categoriesByMap:Object.fromEntries(ENABLED_MAPS.map(m=>[m.id,categoriesForMap(m.id)])),integrations:{discord:!!env.DISCORD_PUBLIC_KEY,twitch:!!env.TWITCH_CHANNEL_IDS,youtube:!!env.YOUTUBE_LIVE_CHAT_IDS,therun:true}});
      if(req.method==='GET' && path==='/api/addon-release')return send(addonRelease);
      if(req.method==='GET'&&path==='/api/discord/config')return send(discordSite.config());
      if(req.method==='GET' && path==='/api/activity')return send(publicActivity(store));
      if(req.method==='GET' && path==='/api/players')return send(store.list('players').filter(p=>p.public).slice(0,200).map(p=>runnerArchived(p,store.clock())?{id:p.id,name:p.name,status:'offline',lastSeen:p.lastSeen,archived:true}:({id:p.id,name:p.name,status:store.view(p.id).status,lastSeen:p.lastSeen,archived:false,profile:p.profile,source:p.source?.type??'direct',streams:publicStreams(p,store.clock(),store)})));
      if(req.method==='GET' && path.startsWith('/api/players/')) {
        const v=store.view(decodeURIComponent(path.slice('/api/players/'.length)));
        if(!v.private&&runnerArchived(v,store.clock()))return send({id:v.id,name:v.name,status:'offline',lastSeen:v.lastSeen,archived:true});
        // Do not expose private source configuration, benchmark internals, or alert metadata.
        return send({id:v.id,name:v.name,private:v.private,status:v.status,lastSeen:v.lastSeen,profile:v.profile,session:v.private?null:store.sessionStats(v),streams:publicStreams(v,store.clock(),store),
          attempt:v.attempt?{attemptCount:v.attempt.attemptCount??null,phase:v.attempt.phase,current:v.attempt.current,stageMap:v.attempt.stageMap,elapsedMs:v.attempt.elapsedMs,splits:v.attempt.splits,complete:v.attempt.complete,practice:v.attempt.practice}:null});
      }
      const raw=await body(req);let data={};
      if(raw.length){try{data=JSON.parse(raw);}catch{check(false,'Invalid JSON.');}}
      if(req.method==='POST' && path==='/discord/interactions') {
        check(verifyDiscord(env.DISCORD_PUBLIC_KEY,req.headers['x-signature-timestamp'],req.headers['x-signature-ed25519'],raw),'Invalid Discord signature.',401);
        return send(discordInteraction(store,data));
      }
      if(req.method==='POST' && path==='/api/register') {limit(req,'register',5,3600000);return send(store.register(data.username),201);}
      if(req.method==='POST' && path==='/api/query') {limit(req,'query',60);check(typeof data.command==='string'&&data.command.length<=500,'Command required.');return send({reply:store.answer(data.command)??'Use !help to see commands.'});}
      if(path.startsWith('/api/recovery/discord')) {
        checkBrowserOrigin(req,env);limit(req,'recovery',10);
        if(req.method==='POST'&&path==='/api/recovery/discord/start'){const result=discordSite.startRecovery(data.username);res.setHeader('Set-Cookie',result.cookie);return send({url:result.url});}
        if(req.method==='GET'&&path==='/api/recovery/discord/status')return send(discordSite.recoveryReady(req.headers.cookie));
        if(req.method==='POST'&&path==='/api/recovery/discord/reset'){
          const result=discordSite.resetRecovered(req.headers.cookie,data.username),session=createBrowserSession(store,req,result.player);
          res.setHeader('Set-Cookie',[browserCookie(session.value,env),discordSite.cookie('monty_recovery','','/api/recovery/discord',0)]);
          return send({token:result.token,expiresAt:session.expiresAt});
        }
        check(false,'Not found.',404);
      }
      const token=req.headers.authorization?.replace(/^Bearer /,'');
      if(path.startsWith('/api/admin/')) {
        check(env.ADMIN_KEY && equal(token,env.ADMIN_KEY),'Admin key required.',401);
        if(req.method==='POST' && path==='/api/admin/benchmarks')return send(store.benchmark(data),201);
        if(req.method==='GET' && path==='/api/admin/alerts')return send(store.list('outbox'));
        if(req.method==='GET' && path==='/api/admin/benchmarks')return send(store.list('benchmarks'));
        check(false,'Not found.',404);
      }
      if(req.method==='POST'&&path==='/api/login') {limit(req,'login',20);checkBrowserOrigin(req,env);const p=store.authenticate(token);const session=createBrowserSession(store,req,p);res.setHeader('Set-Cookie',browserCookie(session.value,env));return send({expiresAt:session.expiresAt});}
      if(req.method==='POST'&&path==='/api/logout') {checkBrowserOrigin(req,env);clearBrowserSession(store,req);res.setHeader('Set-Cookie',browserCookie('',env,true));return send({signedOut:true});}
      let loginExpiresAt=null;
      const p=token?store.authenticate(token):(()=>{const session=browserSession(store,req);checkBrowserOrigin(req,env);loginExpiresAt=session.expiresAt;return session.player;})();
      if(path.startsWith('/api/me/discord')) {
        checkBrowserOrigin(req,env);limit(req,'discord-management',30);
        if(req.method==='DELETE'&&path==='/api/me/discord/recovery')return send(discordSite.unlinkRecovery(p));
        if(req.method==='GET'&&path==='/api/me/discord')return send(discordSite.status(p,req.headers.cookie));
        if(req.method==='POST'&&path==='/api/me/discord/connect'){const result=discordSite.start(p);res.setHeader('Set-Cookie',result.cookie);return send({url:result.url});}
        if(req.method==='DELETE'&&path==='/api/me/discord'){res.setHeader('Set-Cookie',discordSite.disconnect(req.headers.cookie));return send({disconnected:true});}
        if(req.method==='GET'&&path==='/api/me/discord/guilds')return send(await discordSite.guilds(p,req.headers.cookie));
        const match=path.match(/^\/api\/me\/discord\/guilds\/(\d{5,25})(?:\/alerts(?:\/([\w-]+))?)?$/);
        if(match){
          if(req.method==='GET'&&!path.includes('/alerts'))return send(await discordSite.details(p,req.headers.cookie,match[1]));
          if(req.method==='POST'&&path.endsWith('/alerts'))return send(await discordSite.save(p,req.headers.cookie,match[1],data),201);
          if(req.method==='DELETE'&&match[2])return send(await discordSite.remove(p,req.headers.cookie,match[1],match[2]));
        }
        check(false,'Not found.',404);
      }
      if(req.method==='GET'&&path==='/api/me/chatbot')return send(chatbot.view(p));
      if(req.method==='GET'&&path==='/api/me/chatbot/youtube/broadcasts'){limit(req,'broadcasts',10);return send(await chatbot.broadcasts(p,url.searchParams.get('slot')??0));}
      if(path.startsWith('/api/me/chatbot/')) {
        const [, , , ,provider,operation]=path.split('/');
        limit(req,'chatbot',20);
        if(req.method==='POST'&&operation==='connect'){const result=chatbot.start(provider,p,token,data.slot);res.setHeader('Set-Cookie',result.cookie);return send({url:result.url});}
        if(req.method==='POST'&&operation==='settings'){const result=await chatbot.settings(provider,p,data);restartChat();return send(result);}
        if(req.method==='DELETE'&&!operation){const result=chatbot.disconnect(provider,p,url.searchParams.get('slot')??0);restartChat();return send(result);}
      }
      if(req.method==='GET'&&path==='/api/me')return send({...p,loginExpiresAt,addonUpdate:addonStatus(p)});
      if(req.method==='POST'&&path==='/api/me/streams')return send(store.streams(p,data));
      if(req.method==='POST'&&path==='/api/ingest'){check(!p.source||p.source.type==='direct','This runner uses therun.gg; switch to direct before sending LiveSplit updates.',409);return send(store.ingest(p.id,data));}
      if(req.method==='POST'&&path==='/api/me/privacy')return send(store.privacy(p,data.public));
      if(req.method==='POST'&&path==='/api/me/session')return send(store.session(p,data.action));
      if(req.method==='POST'&&path==='/api/me/rotate')return send({token:store.rotate(p)});
      if(req.method==='DELETE'&&path==='/api/me'){for(const slot of [0,1,2]){chatbot.disconnect('twitch',p,slot);chatbot.disconnect('youtube',p,slot);}store.removePlayer(p);restartChat();return send({deleted:true});}
      if(req.method==='GET'&&path==='/api/me/history')return send(store.attempts(p.id));
      if(req.method==='POST'&&path==='/api/me/source') {
        const source=sourceConfig(data);
        const oldSource={...(p.source??{type:'direct'})};delete oldSource.connectionId;
        if(JSON.stringify(oldSource)===JSON.stringify(source))return send(p);
        const a=p.activeAttempt&&store.get('attempts',p.activeAttempt);
        if(a){a.closed=true;store.saveAttempt(a);}
        p.source={...source,connectionId:randomUUID()};p.activeAttempt=null;p.lastSeen=null;p.sourceError=null;store.savePlayer(p);return send(p);
      }
      check(false,'Not found.',404);
    } catch(error) {if(!res.headersSent)send({error:error.status?error.message:'Internal server error.'},error.status??500);if(!error.status)console.error(error);}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  const stops=[];let delivering=false;
  if(connectors) {
    restartChat();stops.push(()=>stopChat(),startTheRun(store),startStreamMonitor(store,env),startZwr(store,fetcher));
    const timer=setInterval(async()=>{if(delivering)return;delivering=true;try{await deliverAlerts(store,env.DISCORD_BOT_TOKEN);}catch(error){console.error('Alert delivery failed:',error.message);}finally{delivering=false;}},2000);
    stops.push(()=>clearInterval(timer));
  }
  return {server,store,stop:()=>{for(const stop of stops)stop();server.close();}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const store=new Store(process.env.DATA_PATH??'data/tracker.sqlite');
  const app=createApp({store,env:process.env,connectors:true});
  const port=Number(process.env.PORT??3000),host=process.env.HOST??'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Zombies Tracker: http://${host}:${port}\nPlatform connectors activate only when configured. No OBS integration.`));
  process.on('SIGINT',()=>app.stop());process.on('SIGTERM',()=>app.stop());
}




