export function runnerArchived(player,now){
 const offlineAfter=player.source?.type==='therun'?120000:30000;
 const offlineSince=player.lastSeen==null?player.createdAt:player.lastSeen+offlineAfter;
 return Number.isFinite(offlineSince)&&now-offlineSince>300000;
}
