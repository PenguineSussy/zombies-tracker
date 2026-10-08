import {check} from './domain.js';

export function streamLink(value, platform) {
  if (!value?.trim()) return null;
  let url; try { url = new URL(value.trim()); } catch { check(false, 'Enter a full HTTPS stream URL.'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.port, 'Use an HTTPS Twitch or YouTube URL.');
  const host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
  if (platform === 'twitch') {
    check(['twitch.tv','www.twitch.tv'].includes(host) && parts.length === 1 && /^[a-zA-Z0-9_]{3,25}$/.test(parts[0]), 'Enter a Twitch channel URL, such as https://www.twitch.tv/name.');
    check(!['directory','videos','downloads','settings','subscriptions'].includes(parts[0].toLowerCase()), 'Enter a Twitch channel, not a Twitch site page.');
    const channel = parts[0].toLowerCase();
    return {platform, channel, url:`https://www.twitch.tv/${channel}`};
  }
  check(platform === 'youtube', 'Unknown streaming platform.');
  let videoId;
  if (host === 'youtu.be' && parts.length === 1) videoId = parts[0];
  if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    if (['live','embed'].includes(parts[0]) && parts.length === 2) videoId = parts[1];
  }
  check(/^[\w-]{11}$/.test(videoId??''), 'Use the specific YouTube broadcast URL (watch?v=… or /live/…), not a channel link.');
  return {platform, videoId, url:`https://www.youtube.com/watch?v=${videoId}`};
}


export const STREAM_FRESH_MS=120000;
export function streamAccounts(player,provider) {
  return player.streams?.[provider+'Accounts']??[player.streams?.[provider]??null,null,null];
}
export function streamSources(store,player,now=store?.clock()??Date.now()) {
  const linked=store?store.list('metadata').filter(c=>c.kind==='chat-connection'&&c.player===player.id&&c.connected):[];
  const result=[];
  for(const provider of ['twitch','youtube'])for(const slot of [0,1,2]) {
    const c=linked.find(c=>c.provider===provider&&(c.slot??0)===slot),manual=streamAccounts(player,provider)[slot];
    if(provider==='twitch') {
      const login=c?.login??manual?.channel;
      if(login)result.push({platform:provider,slot,channel:login,channelId:c?.channelId,url:'https://www.twitch.tv/'+login});
      else if(c?.channelId)result.push({platform:provider,slot,channelId:c.channelId,url:null});
    } else if(c) {
      // Only fresh, public broadcasts returned by the owning channel's API.
      if(c.liveCheckedAt>now-STREAM_FRESH_MS)for(const b of c.liveBroadcasts??[])result.push({platform:provider,slot,videoId:b.id,url:'https://www.youtube.com/watch?v='+b.id,verified:true,status:'live',checkedAt:c.liveCheckedAt});
    } else if(manual)result.push({...manual,slot});
  }
  return result;
}
export function verifiedLiveStreams(store,player,now=store.clock()) {
  if(!player.public)return [];
  const seen=new Set();
  return streamSources(store,player,now).map(s=>{
    const check=player.streamChecks?.[s.url]??(s.platform==='twitch'&&s.channel===player.streamStatus?.channel?player.streamStatus:null);
    return s.verified?s:{...s,status:check?.status,checkedAt:check?.checkedAt};
  }).filter(s=>s.url&&s.status==='live'&&s.checkedAt>now-STREAM_FRESH_MS&&!seen.has(s.url)&&seen.add(s.url))
    .sort((a,b)=>a.slot-b.slot||(a.platform===b.platform?a.url.localeCompare(b.url):a.platform==='twitch'?-1:1));
}
export function publicStreams(player,now,store=null) {
  if(!player.public)return null;
  const live=verifiedLiveStreams(store??{clock:()=>now,list:()=>[]},player,now);
  const twitch=live.find(s=>s.platform==='twitch'),youtube=live.find(s=>s.platform==='youtube');
  const fresh=player.streamStatus?.checkedAt>now-STREAM_FRESH_MS&&player.streamStatus?.channel===player.streams?.twitch?.channel;
  return {twitch:twitch??player.streams?.twitch??null,youtube:youtube??player.streams?.youtube??null,
    twitchStatus:twitch?'live':fresh?player.streamStatus.status:'unknown',youtubeLive:!!youtube,
    live:live.map(({platform,slot,channel,videoId,url})=>({platform,slot,channel,videoId,url,verified:true}))};
}
