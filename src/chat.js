import { parseCommand } from './domain.js';
import {chatTargets,channelCooldown,connections} from './chat-connections.js';

export class ChatResponder {
  constructor(store, limit = 450, clock = Date.now, cooldown = ()=>15, provider = null) { this.provider=provider; this.store=store; this.limit=limit; this.clock=clock; this.cooldown=cooldown; this.cooldowns=new Map(); this.ids=new Map(); }
  respond(channel, sender, messageId, text) {
    const now=this.clock();
    for(const [id,at] of this.ids) if(now-at>600000) this.ids.delete(id);
    for(const [id,at] of this.cooldowns) if(now-at>600000) this.cooldowns.delete(id);
    if(this.ids.has(messageId)) return null;
    this.ids.set(messageId,now);
    const command=parseCommand(text); if(!command) return null;
    const userKey=`${channel}:${sender}`, channelKey=`channel:${channel}`;
    if(now-(this.cooldowns.get(userKey)??-Infinity)<5000 || now-(this.cooldowns.get(channelKey)??-Infinity)<this.cooldown(channel)*1000 || now-(this.cooldowns.get('global')??-Infinity)<1600) return null;
    this.cooldowns.set(userKey,now); this.cooldowns.set(channelKey,now); this.cooldowns.set('global',now);
    if(command.command==='pb'&&!command.player&&this.provider) {
      const owners=connections(this.store).filter(c=>c.provider===this.provider&&c.target===channel&&c.connected&&c.enabled&&this.store.get('players',c.player));
      if(owners.length===1)command.player=owners[0].player;
    }
    let result=this.store.answer(command);
    if(command.command==='session' && result?.length>this.limit) {
      const p=this.store.view(command.player);
      if(!p.private)result=this.store.sessionAnswer(p,true);
    }
    if(result?.length>this.limit && result.includes(' | ')) {
      const parts=result.split(' | ');
      result=parts[0]+' | '+parts[1].split(' · ').slice(0,2).join(' · ')+' | '+parts.slice(2).join(' | ');
    }
    return result && (result.length>this.limit ? result.slice(0,this.limit-1)+'…' : result);
  }
}

// This alpha accepts operator-provisioned OAuth credentials. Refresh tokens are never sent to clients.
export class OAuthToken {
  constructor({accessToken,refreshToken,clientId,clientSecret,provider},fetcher=fetch) { Object.assign(this,{accessToken,refreshToken,clientId,clientSecret,provider,fetcher}); }
  async refresh() {
    if(!this.refreshToken) throw new Error(`${this.provider} token expired. Configure a refresh token.`);
    if(this.refreshing) return this.refreshing;
    this.refreshing=(async()=>{
      const response=await this.fetcher(this.provider==='twitch'?'https://id.twitch.tv/oauth2/token':'https://oauth2.googleapis.com/token',{
        method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:this.refreshToken,client_id:this.clientId,client_secret:this.clientSecret??''}),signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw new Error(`${this.provider} authorization must be renewed (${response.status}).`);
      const data=await response.json(); this.accessToken=data.access_token; this.refreshToken=data.refresh_token??this.refreshToken;
      this.onRefresh?.({accessToken:this.accessToken,refreshToken:this.refreshToken});
    })();
    try { await this.refreshing; } finally { this.refreshing=null; }
  }
  async request(url,options={},retry=true) {
    const response=await this.fetcher(url,{...options,headers:{...options.headers,Authorization:`Bearer ${this.accessToken}`},signal:options.signal??AbortSignal.timeout(10000)});
    if(response.status===401 && retry) { await this.refresh(); return this.request(url,options,false); }
    return response;
  }
}

const twitchTokens=new WeakMap();
export function twitchToken(store,env) {
  if(twitchTokens.has(store))return twitchTokens.get(store);
  const saved=store.get('metadata','twitch-oauth')??{};
  const token=new OAuthToken({accessToken:saved.accessToken??env.TWITCH_ACCESS_TOKEN,refreshToken:saved.refreshToken??env.TWITCH_REFRESH_TOKEN,clientId:env.TWITCH_CLIENT_ID,clientSecret:env.TWITCH_CLIENT_SECRET,provider:'twitch'});
  token.onRefresh=value=>store.put('metadata','twitch-oauth',value);
  twitchTokens.set(store,token);return token;
}
export function startTwitch(store,env,log=console.log) {
  if(!env.TWITCH_CLIENT_ID || !env.TWITCH_ACCESS_TOKEN || !env.TWITCH_BOT_USER_ID) return ()=>{};
  const token=twitchToken(store,env);
  const responder=new ChatResponder(store,450,Date.now,channel=>channelCooldown(store,'twitch',channel),'twitch'), channels=chatTargets(store,env,'twitch');
  if(!channels.length)return ()=>{};
  const headers={'Client-Id':env.TWITCH_CLIENT_ID,'Content-Type':'application/json'};
  let stopped=false, socket, pendingSocket, retryTimer, watchdog, failures=0, validationTimer;
  const retry=()=>{ if(!stopped) { clearTimeout(retryTimer); retryTimer=setTimeout(()=>connect(),Math.min(60000,1000*2**Math.min(failures++,6))); } };
  async function validate() {
    let r=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${token.accessToken}`},signal:AbortSignal.timeout(10000)});
    if(r.status===401) { await token.refresh(); r=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${token.accessToken}`},signal:AbortSignal.timeout(10000)}); }
    if(!r.ok) throw new Error('Twitch OAuth validation failed.');
    const data=await r.json();
    if(data.user_id!==env.TWITCH_BOT_USER_ID || data.client_id!==env.TWITCH_CLIENT_ID || !['user:read:chat','user:write:chat'].every(s=>data.scopes.includes(s))) throw new Error('Twitch token identity or chat scopes do not match configuration.');
  }
  function connect(url='wss://eventsub.wss.twitch.tv/ws',handoff=false) {
    if(stopped) return;
    const parsed=new URL(url); if(parsed.protocol!=='wss:' || parsed.hostname!=='eventsub.wss.twitch.tv') { log('Rejected unexpected Twitch reconnect host.'); retry(); return; }
    const ws=new WebSocket(url); if(handoff) pendingSocket=ws; else socket=ws;
    let keepalive=20;
    const alive=()=>{ if(socket===ws) { clearTimeout(watchdog); watchdog=setTimeout(()=>ws.close(),(keepalive+5)*1000); } };
    ws.onmessage=async event=>{
      try {
        const message=JSON.parse(event.data); const type=message.metadata.message_type;
        if(type==='session_welcome') {
          if(handoff) { const old=socket; socket=ws; pendingSocket=null; old?.close(); }
          failures=0; keepalive=message.payload.session.keepalive_timeout_seconds??20; alive();
          if(!handoff) for(const channel of channels) {
            const r=await token.request('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers,body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:channel,user_id:env.TWITCH_BOT_USER_ID},transport:{method:'websocket',session_id:message.payload.session.id}})});
            if(!r.ok) log(`Twitch channel ${channel} subscription failed (${r.status}); check authorization.`);
            connectionStatus(store,'twitch',channel,r.ok?'Listening for commands':`Connection failed (${r.status}); reconnect or try again`);
          }
          log('Twitch connection established.');
        } else if(type==='session_reconnect') connect(message.payload.session.reconnect_url,true);
        else if(type==='revocation') log('Twitch subscription revoked; reauthorize the channel.');
        else if(type==='notification') {
          alive(); const e=message.payload.event;
          if(stopped || e.chatter_user_id===env.TWITCH_BOT_USER_ID || !chatTargets(store,env,'twitch').includes(e.broadcaster_user_id)) return;
          const reply=responder.respond(e.broadcaster_user_id,e.chatter_user_id,e.message_id,e.message.text);
          if(reply) { const r=await token.request('https://api.twitch.tv/helix/chat/messages',{method:'POST',headers,body:JSON.stringify({broadcaster_id:e.broadcaster_user_id,sender_id:env.TWITCH_BOT_USER_ID,message:reply})}); if(!r.ok) log(`Twitch reply failed (${r.status}).`); }
        } else if(type==='session_keepalive') alive();
      } catch(error) { log(`Twitch: ${error.message}`); }
    };
    ws.onerror=()=>ws.close();
    ws.onclose=()=>{ if(pendingSocket===ws) { pendingSocket=null; retry(); } else if(socket===ws && !pendingSocket) { clearTimeout(watchdog); retry(); } };
  }
  void validate().then(()=>{ if(!stopped) connect(); }).catch(error=>log(error.message));
  validationTimer=setInterval(()=>void validate().catch(error=>{log(error.message); socket?.close();}),3600000);
  return ()=>{stopped=true;clearTimeout(retryTimer);clearTimeout(watchdog);clearInterval(validationTimer);socket?.close();pendingSocket?.close();};
}

export function startYouTube(store,env,log=console.log) {
  if(!env.YOUTUBE_ACCESS_TOKEN) return ()=>{};
  const saved=store.get('metadata','youtube-oauth')??{};
  const token=new OAuthToken({accessToken:saved.accessToken??env.YOUTUBE_ACCESS_TOKEN,refreshToken:saved.refreshToken??env.YOUTUBE_REFRESH_TOKEN,clientId:env.YOUTUBE_CLIENT_ID,clientSecret:env.YOUTUBE_CLIENT_SECRET,provider:'youtube'});
  token.onRefresh=value=>store.put('metadata','youtube-oauth',value);
  const responder=new ChatResponder(store,190,Date.now,channel=>channelCooldown(store,'youtube',channel),'youtube'), timers=new Set(); let stopped=false;
  const schedule=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);void fn();},ms);timers.add(id);};
  for(const chat of chatTargets(store,env,'youtube')) {
    let pageToken, initialized=false, failures=0;
    async function poll() {
      if(stopped || !chatTargets(store,env,'youtube').includes(chat)) return;
      try {
        const params=new URLSearchParams({liveChatId:chat,part:'snippet,authorDetails',maxResults:'200'}); if(pageToken) params.set('pageToken',pageToken);
        const r=await token.request('https://www.googleapis.com/youtube/v3/liveChat/messages?'+params);
        if(!r.ok) {
          const data=await r.json(); const reason=data.error?.errors?.[0]?.reason;
          if(['liveChatEnded','liveChatDisabled','quotaExceeded','forbidden'].includes(reason)) {log(`YouTube chat stopped: ${reason}.`);connectionStatus(store,'youtube',chat,`Chat stopped: ${reason}`);return;}
          throw new Error(`YouTube HTTP ${r.status}`);
        }
        const data=await r.json(); failures=0;
        if(stopped || !chatTargets(store,env,'youtube').includes(chat))return;
        connectionStatus(store,'youtube',chat,'Listening for commands');
        // Do not reply to the historical page fetched when a connector first starts.
        if(initialized) for(const m of data.items??[]) {
          if(stopped || !chatTargets(store,env,'youtube').includes(chat))return;
          if(m.snippet.type!=='textMessageEvent' || m.authorDetails.channelId===env.YOUTUBE_BOT_CHANNEL_ID) continue;
          const reply=responder.respond(chat,m.authorDetails.channelId,m.id,m.snippet.textMessageDetails.messageText);
          if(reply) {
            const sent=await token.request('https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snippet:{liveChatId:chat,type:'textMessageEvent',textMessageDetails:{messageText:reply}}})});
            if(!sent.ok) log(`YouTube reply failed (${sent.status}).`);
          }
        }
        initialized=true;pageToken=data.nextPageToken;
        schedule(poll,Math.max(5000,data.pollingIntervalMillis??10000));
      } catch(error) {log(error.message);schedule(poll,Math.min(120000,5000*2**Math.min(failures++,5)));}
    }
    void poll();
  }
  return ()=>{stopped=true;for(const t of timers)clearTimeout(t);};
}

function connectionStatus(store,provider,target,status) {
  for(const c of connections(store).filter(c=>c.provider===provider&&c.target===target&&c.enabled&&c.connected)) {
    store.put('metadata',`chat-connection:${provider}:${c.player}`,{...c,status});
  }
}
