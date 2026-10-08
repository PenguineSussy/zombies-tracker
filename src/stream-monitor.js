import {twitchToken,OAuthToken} from './chat.js';
import {streamSources} from './streams.js';
import {ChatConnections,connections,connectionKey} from './chat-connections.js';

// LiveSplit's running phase is never evidence that a stream is live.
export async function checkTwitchStreams(store,token,clientId) {
  const sources=store.list('players').filter(p=>p.public).flatMap(p=>streamSources(store,p).filter(s=>s.platform==='twitch').map(s=>({...s,player:p.id,key:s.channelId?'id:'+s.channelId:'login:'+s.channel})));
  const unique=[...new Map(sources.map(s=>[s.key,s])).values()];
  for(let offset=0;offset<unique.length;offset+=100) {
    const batch=unique.slice(offset,offset+100),query=new URLSearchParams({first:'100'});
    for(const s of batch)query.append(s.channelId?'user_id':'user_login',s.channelId??s.channel);
    const response=await token.request('https://api.twitch.tv/helix/streams?'+query,{headers:{'Client-Id':clientId},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(`Twitch live check unavailable (${response.status}).`);
    const data=await response.json();if(!Array.isArray(data.data))throw new Error('Invalid Twitch stream response.');
    for(const original of sources.filter(s=>batch.some(b=>b.key===s.key))) {
      let p=store.get('players',original.player);if(!p?.public)continue;
      const current=streamSources(store,p).find(s=>s.platform==='twitch'&&s.slot===original.slot);
      if(!current||current.channelId!==original.channelId||current.channel!==original.channel)continue;
      const live=data.data.find(s=>s.type==='live'&&(original.channelId?s.user_id===original.channelId:s.user_login?.toLowerCase()===original.channel));
      const login=live?.user_login?.toLowerCase()??original.channel;
      if(!login)continue;
      if(original.channelId&&live) {
        const key=connectionKey('twitch',p.id,original.slot),c=store.get('metadata',key);
        if(c?.connected&&c.channelId===original.channelId)store.put('metadata',key,{...c,login});
      }
      const url='https://www.twitch.tv/'+login,status={channel:login,status:live?'live':'offline',checkedAt:store.clock()};
      p.streamChecks={...p.streamChecks,[url]:status};if(original.slot===0)p.streamStatus=status;store.savePlayer(p);
    }
  }
}
export async function checkYouTubeStreams(store,token) {
  const sources=store.list('players').filter(p=>p.public).flatMap(p=>streamSources(store,p).filter(s=>s.platform==='youtube'&&!s.verified).map(s=>({...s,player:p.id})));
  const ids=[...new Set(sources.map(s=>s.videoId))];
  for(let offset=0;offset<ids.length;offset+=50) {
    const batch=ids.slice(offset,offset+50),query=new URLSearchParams({part:'snippet,liveStreamingDetails,status',id:batch.join(',')});
    const response=await token.request('https://www.googleapis.com/youtube/v3/videos?'+query);
    if(!response.ok)throw new Error(`YouTube live check unavailable (${response.status}).`);
    const data=await response.json();if(!Array.isArray(data.items))throw new Error('Invalid YouTube stream response.');
    const live=new Set(data.items.filter(v=>v.status?.privacyStatus==='public'&&v.snippet?.liveBroadcastContent==='live'&&v.liveStreamingDetails?.actualStartTime&&!v.liveStreamingDetails.actualEndTime).map(v=>v.id));
    for(const original of sources.filter(s=>batch.includes(s.videoId))) {
      const p=store.get('players',original.player);if(!p?.public||!streamSources(store,p).some(s=>s.url===original.url&&!s.verified))continue;
      p.streamChecks={...p.streamChecks,[original.url]:{status:live.has(original.videoId)?'live':'offline',checkedAt:store.clock()}};store.savePlayer(p);
    }
  }
}
export async function checkLinkedYouTubeStreams(store,chatbot,log=()=>{}) {
  for(const c of connections(store).filter(c=>c.provider==='youtube'&&c.connected)) {
    const p=store.get('players',c.player);if(!p?.public)continue;
    try {
      const broadcasts=await chatbot.broadcasts(p,c.slot??0,{publicOnly:true,requireChat:false});
      const key=connectionKey('youtube',c.player,c.slot??0),latest=store.get('metadata',key);
      if(!latest?.connected||latest.channelId!==c.channelId||!store.get('players',p.id)?.public)continue;
      store.put('metadata',key,{...latest,liveCheckedAt:store.clock(),liveBroadcasts:broadcasts.map(b=>({id:b.id}))});
    } catch {log('A connected YouTube live check is unavailable; stale live links will expire.');}
  }
}
export function startStreamMonitor(store,env,log=console.log) {
  const twitch=env.TWITCH_CLIENT_ID&&env.TWITCH_ACCESS_TOKEN?twitchToken(store,env):null;
  const saved=store.get('metadata','youtube-oauth')??{};
  const youtube=env.YOUTUBE_ACCESS_TOKEN?new OAuthToken({accessToken:saved.accessToken??env.YOUTUBE_ACCESS_TOKEN,refreshToken:saved.refreshToken??env.YOUTUBE_REFRESH_TOKEN,clientId:env.YOUTUBE_CLIENT_ID,clientSecret:env.YOUTUBE_CLIENT_SECRET,provider:'youtube'}):null;
  if(youtube)youtube.onRefresh=value=>store.put('metadata','youtube-oauth',value);
  const chatbot=new ChatConnections(store,env);
  let stopped=false,timer;
  async function poll(){
    for(const task of [()=>twitch&&checkTwitchStreams(store,twitch,env.TWITCH_CLIENT_ID),()=>youtube&&checkYouTubeStreams(store,youtube),()=>checkLinkedYouTubeStreams(store,chatbot,log)]) {
      if(stopped)break;try{await task();}catch(e){log(e.message);}
    }
    if(!stopped)timer=setTimeout(poll,60000);
  }
  void poll();return ()=>{stopped=true;clearTimeout(timer);};
}
