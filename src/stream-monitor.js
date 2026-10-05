import {twitchToken} from './chat.js';

// Uses the bot's server-side authorization. LiveSplit phase is never a live signal.
export async function checkTwitchStreams(store, token, clientId) {
  const players=store.list('players').filter(p=>p.public && p.streams?.twitch);
  const channels=[...new Set(players.map(p=>p.streams.twitch.channel))];
  for(let offset=0;offset<channels.length;offset+=100) {
    const batch=channels.slice(offset,offset+100), query=new URLSearchParams({first:'100'});
    for(const channel of batch)query.append('user_login',channel);
    const response=await token.request('https://api.twitch.tv/helix/streams?'+query,{headers:{'Client-Id':clientId},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(`Twitch live check unavailable (${response.status}).`);
    const data=await response.json();
    if(!Array.isArray(data.data))throw new Error('Invalid Twitch stream response.');
    const live=new Set(data.data.filter(s=>s.type==='live').map(s=>s.user_login.toLowerCase()));
    for(const original of players.filter(p=>batch.includes(p.streams.twitch.channel))) {
      const p=store.get('players',original.id);
      if(!p?.public || p.streams?.twitch?.channel!==original.streams.twitch.channel)continue;
      p.streamStatus={channel:p.streams.twitch.channel,status:live.has(p.streams.twitch.channel)?'live':'offline',checkedAt:store.clock()};store.savePlayer(p);
    }
  }
}
export function startStreamMonitor(store,env,log=console.log) {
  if(!env.TWITCH_CLIENT_ID || !env.TWITCH_ACCESS_TOKEN)return ()=>{};
  const token=twitchToken(store,env);
  let stopped=false, timer;
  async function poll(){try{await checkTwitchStreams(store,token,env.TWITCH_CLIENT_ID);}catch(e){log(e.message);}finally{if(!stopped)timer=setTimeout(poll,60000);}}
  void poll();return ()=>{stopped=true;clearTimeout(timer);};
}
