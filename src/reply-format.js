import {MAPS} from './domain.js';
export function replyProfile(p){
 if(!p)return 'No run selected';
 return (p.map?.startsWith('bo2-')?'BO2 · ':'')+(MAPS.find(m=>m.id===p.map)?.name??p.map)+(p.category&&p.category!=='Standard'?' · '+p.category:'');
}
export function duration(ms){
 const minutes=Math.floor(Math.max(0,ms)/60000),hours=Math.floor(minutes/60);
 return hours?`${hours}h ${minutes%60}m`:minutes?`${minutes}m`:`${Math.floor(Math.max(0,ms)/1000)}s`;
}
export function lastSeen(at,now){
 const seconds=Math.max(0,Math.floor((now-at)/1000));
 if(seconds<60)return seconds+' seconds ago';
 const minutes=Math.floor(seconds/60);if(minutes<60)return minutes+' minute'+(minutes===1?'':'s')+' ago';
 const hours=Math.floor(minutes/60);if(hours<24)return hours+' hour'+(hours===1?'':'s')+' ago';
 const days=Math.floor(hours/24);return days+' day'+(days===1?'':'s')+' ago';
}
export function achievedDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value??''))return 'unavailable';
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}):'unavailable';
}
export function deltaDuration(ms){return (ms/1000)+' second'+(ms===1000?'':'s');}

export function replyTiming(p){return p?.timing==='GameTime'?'IGT':'RTA';}
