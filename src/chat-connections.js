import {randomBytes,createHash} from 'node:crypto';
import {check} from './domain.js';
import {OAuthToken} from './chat.js';

const digest=value=>createHash('sha256').update(value??'').digest('hex');
const id=(provider,player)=>`chat-connection:${provider}:${player}`;
export const connections=store=>store.list('metadata').filter(v=>v.kind==='chat-connection');
export function chatTargets(store,env,provider) {
  const managed=connections(store).filter(c=>c.provider===provider);
  const legacy=(env[provider==='twitch'?'TWITCH_CHANNEL_IDS':'YOUTUBE_LIVE_CHAT_IDS']??'').split(',').map(s=>s.trim()).filter(Boolean);
  return [...new Set([...legacy.filter(channel=>!managed.some(c=>c.target===channel)),...managed.filter(c=>c.enabled&&c.connected&&c.target&&store.get('players',c.player)).map(c=>c.target)])];
}
export function channelCooldown(store,provider,channel) {
  return connections(store).find(c=>c.provider===provider&&c.target===channel)?.cooldownSeconds??15;
}
export class ChatConnections {
  constructor(store,env,fetcher=fetch) {Object.assign(this,{store,env,fetcher});this.pending=new Map();}
  config(provider) {
    check(['twitch','youtube'].includes(provider),'Unknown provider.',404);
    const prefix=provider.toUpperCase();
    return {provider,clientId:this.env[`${prefix}_CLIENT_ID`],clientSecret:this.env[`${prefix}_CLIENT_SECRET`]};
  }
  available(provider) {
    const c=this.config(provider);
    return !!(c.clientId&&c.clientSecret&&this.env.PUBLIC_ORIGIN&&this.env[`${provider.toUpperCase()}_ACCESS_TOKEN`]&&this.env[provider==='twitch'?'TWITCH_BOT_USER_ID':'YOUTUBE_BOT_CHANNEL_ID']);
  }
  view(player) {
    return Object.fromEntries(['twitch','youtube'].map(provider=>{
      const c=this.store.get('metadata',id(provider,player.id));
      return [provider,{available:this.available(provider),connected:!!c?.connected,name:c?.name??null,enabled:!!c?.enabled,cooldownSeconds:c?.cooldownSeconds??15,broadcastId:c?.broadcastId??null,target:!!c?.target,status:c?.status??'Not connected'}];
    }));
  }
  start(provider,player,runnerKey) {
    const config=this.config(provider);check(this.available(provider),'Channel connections are awaiting server configuration.',503);
    const origin=new URL(this.env.PUBLIC_ORIGIN);
    check(origin.origin===this.env.PUBLIC_ORIGIN&&(origin.protocol==='https:'||['localhost','127.0.0.1'].includes(origin.hostname)),'Invalid public origin.',503);
    for(const [key,p]of this.pending)if(p.expires<Date.now())this.pending.delete(key);
    check(this.pending.size<1000,'Please try connecting again later.',429);
    const state=randomBytes(32).toString('base64url'),cookie=randomBytes(32).toString('base64url');
    const callback=`${origin.origin}/api/chatbot/callback/${provider}`;
    this.pending.set(state,{provider,player:player.id,keyHash:digest(runnerKey),cookieHash:digest(cookie),callback,expires:Date.now()+600000});
    const query=new URLSearchParams({client_id:config.clientId,redirect_uri:callback,response_type:'code',state,scope:provider==='twitch'?'channel:bot':'https://www.googleapis.com/auth/youtube.readonly'});
    if(provider==='youtube'){query.set('access_type','offline');query.set('prompt','select_account consent');}else query.set('force_verify','true');
    return {url:(provider==='twitch'?'https://id.twitch.tv/oauth2/authorize?':'https://accounts.google.com/o/oauth2/v2/auth?')+query,cookie:`chat_oauth_${provider}=${cookie}; HttpOnly; SameSite=Lax; Path=/api/chatbot/callback/${provider}; Max-Age=600${origin.protocol==='https:'?'; Secure':''}`};
  }
  async finish(provider,query,cookies='') {
    this.config(provider);
    const state=query.get('state'),pending=this.pending.get(state);
    const cookie=cookies.split(';').map(v=>v.trim()).find(v=>v.startsWith(`chat_oauth_${provider}=`))?.split('=')[1];
    check(pending&&pending.provider===provider&&pending.expires>Date.now()&&pending.cookieHash===digest(cookie),'Connection expired or browser verification failed. Try Connect again.',400);
    this.pending.delete(state);
    check(this.store.db.prepare('SELECT id FROM players WHERE id=? AND token=?').get(pending.player,pending.keyHash),'Runner sign-in changed. Sign in and reconnect.',401);
    check(!query.has('error')&&query.get('code'),'Authorization cancelled. Nothing was connected.');
    const config=this.config(provider);
    const response=await this.fetcher(provider==='twitch'?'https://id.twitch.tv/oauth2/token':'https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code:query.get('code'),redirect_uri:pending.callback,client_id:config.clientId,client_secret:config.clientSecret}),signal:AbortSignal.timeout(10000)});
    check(response.ok,'Authorization failed. Please reconnect.',400);
    const tokens=await response.json();check(tokens.access_token,'Authorization returned no token.');
    const identity=await this.fetcher(provider==='twitch'?'https://api.twitch.tv/helix/users':'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{headers:{Authorization:`Bearer ${tokens.access_token}`,...(provider==='twitch'?{'Client-Id':config.clientId}:{})},signal:AbortSignal.timeout(10000)});
    check(identity.ok,'Could not verify channel ownership. Please reconnect.',400);
    const data=await identity.json(),channel=provider==='twitch'?data.data?.[0]:data.items?.[0];
    check(channel?.id,'No channel found. Choose the Google account or Brand Account for your channel.');
    check(!connections(this.store).some(c=>c.provider===provider&&c.channelId===channel.id&&c.player!==pending.player&&c.connected),'This channel is already linked to another runner.',409);
    // Recheck after external calls: deletion/key rotation must invalidate pending links.
    check(this.store.db.prepare('SELECT id FROM players WHERE id=? AND token=?').get(pending.player,pending.keyHash),'Runner sign-in changed. Reconnect.',401);
    const old=this.store.get('metadata',id(provider,pending.player));
    this.store.put('metadata',id(provider,pending.player),{kind:'chat-connection',player:pending.player,provider,connected:true,channelId:channel.id,name:provider==='twitch'?channel.display_name:channel.snippet.title,
      target:provider==='twitch'?channel.id:null,enabled:false,cooldownSeconds:old?.cooldownSeconds??15,status:'Connected; enable chat replies when ready',
      ...(provider==='youtube'?{accessToken:tokens.access_token,refreshToken:tokens.refresh_token}: {})});
  }
  async broadcasts(player) {
    const c=this.store.get('metadata',id('youtube',player.id));check(c?.connected,'Connect YouTube first.');
    const config=this.config('youtube');
    const token=new OAuthToken({...config,accessToken:c.accessToken,refreshToken:c.refreshToken},this.fetcher);
    token.onRefresh=value=>{const latest=this.store.get('metadata',id('youtube',player.id));if(latest?.connected&&latest.channelId===c.channelId)this.store.put('metadata',id('youtube',player.id),{...latest,...value});};
    const r=await token.request('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status&broadcastStatus=active&broadcastType=all&maxResults=50');
    check(r.ok,'Could not load active broadcasts. Reconnect YouTube if authorization expired.',400);
    const data=await r.json();
    return (data.items??[]).filter(b=>b.snippet.channelId===c.channelId&&b.snippet.liveChatId).map(b=>({id:b.id,title:b.snippet.title,chatId:b.snippet.liveChatId}));
  }
  async settings(provider,player,input) {
    this.config(provider);const key=id(provider,player.id),c=this.store.get('metadata',key);
    check(c?.connected,'Connect your channel first.');
    check(typeof input.enabled==='boolean'&&Number.isInteger(input.cooldownSeconds)&&input.cooldownSeconds>=5&&input.cooldownSeconds<=300,'Cooldown must be a whole number from 5 to 300 seconds.');
    if(provider==='youtube'&&input.enabled) {
      const selected=(await this.broadcasts(player)).find(b=>b.id===input.broadcastId);
      check(selected,'Select an active broadcast belonging to your connected channel.');
      c.target=selected.chatId;c.broadcastId=selected.id;
    }
    const latest=this.store.get('metadata',key);
    check(latest?.connected&&latest.channelId===c.channelId&&this.store.get('players',player.id),'Connection changed. Please refresh.',409);
    this.store.put('metadata',key,{...latest,target:c.target,broadcastId:c.broadcastId,enabled:input.enabled,cooldownSeconds:input.cooldownSeconds,status:input.enabled?'Waiting for bot connection':'Replies disabled'});
    return this.view(player);
  }
  disconnect(provider,player) {
    this.config(provider);const key=id(provider,player.id),old=this.store.get('metadata',key);
    if(old)this.store.put('metadata',key,{kind:'chat-connection',provider,player:player.id,target:old.target,connected:false,enabled:false,cooldownSeconds:old.cooldownSeconds,status:'Disconnected'});
    return this.view(player);
  }
}
