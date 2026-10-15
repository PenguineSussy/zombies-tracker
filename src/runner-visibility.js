import {activeSource} from './source-routing.js';
export function runnerArchived(player,now){
 const offlineAfter=activeSource(player)==='therun'?120000:30000;
 const offlineSince=player.lastSeen==null?player.createdAt:player.lastSeen+offlineAfter;
 return Number.isFinite(offlineSince)&&now-offlineSince>300000;
}
