export function filterActivity(events,game='all',type='all'){
 return events.filter(e=>(game==='all'||(e.game??(e.timing==='GameTime'?'bo2':'bo3'))===game)&&(type==='all'||(type==='no-resets'?e.type!=='reset':e.type===type)));
}
