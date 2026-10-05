export function streamCandidates(players) {
  return players.flatMap(p=>[
    p.streams?.twitchStatus==='live' && p.streams.twitch ? {...p.streams.twitch,id:p.id,name:p.name,verified:true}:null,
    p.streams?.youtubeLive && p.streams.youtube ? {...p.streams.youtube,id:p.id,name:p.name,verified:false}:null,
  ].filter(Boolean)).map(c=>({...c,key:c.id+':'+c.platform}));
}
export function distinctSlots(candidates, keys) {
  const ids=new Set(),urls=new Set();
  return keys.slice(0,2).map(key=>{
    const c=candidates.find(c=>c.key===key);
    if(!c || ids.has(c.id) || urls.has(c.url))return null;
    ids.add(c.id);urls.add(c.url);return c;
  });
}
export function playerUrl(stream,host) {
  if(stream.platform==='twitch')return 'https://player.twitch.tv/?'+new URLSearchParams({channel:stream.channel,parent:host,autoplay:'false',muted:'true'});
  return 'https://www.youtube.com/embed/'+encodeURIComponent(stream.videoId)+'?autoplay=0';
}
