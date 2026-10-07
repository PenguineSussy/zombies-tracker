// Reviewed LittleMontyBot guide, 2026-10-07. Rules are hints, never run-validity checks.
const n=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const rule=(name,min,max,aliases=[],from={},extra={})=>({name,min:min*1000,max:max==null?Infinity:max*1000,aliases:[name,...aliases].map(n),from,...extra});
export const SPLIT_RULES={
 'shadows-of-evil':[
 rule('Rift',110,180,['Portal']),rule('Sword',420,570,[],{Rift:300}),rule('Flag',630,840,[],{Sword:160}),rule('End',1020,null,[],{Flag:390})],
 'der-eisendrache':[
 rule('Bow',250,320,[],{},{alternative:'early'}),rule('Rocket',325,390,[],{Bow:50},{alternative:'early'}),
 rule('Crackle',395,530,['R7','R7 End','Round 7 End','Round 7'],{Rocket:50}),rule('TP',540,780,['Teleport 1','Back in time','TP 1'],{Crackle:110}),
 rule('Key',825,1125,['Keeper Start','Keeper','Key Place'],{TP:240}),rule('Boss Enter',1140,1470,['Boss'],{Key:270}),rule('End',1500,null,[],{'Boss Enter':300})],
 'zetsubou-no-shima':[
 rule('Bunker',210,330),rule('Skull',390,540),rule('KT4/Rainbow Round End',600,900,['KT4','KT','Rainbow','Rainbow End'],{Skull:180}),
 rule('Boss Enter',990,null,['Boss','Elevator','Elevator Enter'],{'KT4/Rainbow Round End':225}),rule('End',1140,null,[],{'Boss Enter':180})],
 'gorod-krovi':[
 rule('Fly 1',240,390,['Fly','First Fly']),rule('Spit',340,540,['Round End','Round 6','Round 6 End','Spit (R6)','R6'],{'Fly 1':80}),
 rule('Fly 2',440,780,['Fly','Second Fly'],{Spit:80}),rule('Challenges',870,1320,['Chall Start','Challs','Challenge Start','Challenges Start'],{'Fly 2':390}),
 rule('Download',1350,1680,['Download Start'],{Challenges:405}),rule('End',1770,null,[],{Download:445})],
 revelations:[rule('Keeper',120,330,['Keeper Start'],{},{alternative:'early'}),rule('Beast',350,540,['Beast Enter'],{Keeper:190},{alternative:'early'}),
 rule('Exit',420,629,['Beast Exit'],{Beast:45}),rule('House',630,960,['TP','Teleport'],{Exit:210}),rule('Boss 1',990,1260,[],{House:300}),
 rule('Symbols',1040,1310,[],{'Boss 1':50},{optional:true}),rule('Basketball',1140,1470,[],{Symbols:90,'Boss 1':140}),rule('Boss 2',1230,1590,[],{Basketball:90}),rule('End',1350,null,[],{'Boss 2':60})],
 'shangri-la':[rule('Tiles',80,179,['Tiles Done']),rule('Crystal',180,319),rule('Napalm',320,450),rule('Radio',451,584),rule('End',585,null)],
 moon:[rule('Power',30,90),rule('Samantha Says',91,300),rule('Terminals',300,480),rule('Vril Sphere',481,640),rule('Canister 1',641,840),rule('Canister 2',841,1079),rule('End',1191,null)],
 origins:[rule('Ice Staff',370,525),rule('Wind Staff',525,660,[],{'Ice Staff':140},{optional:true}),rule('Fire Enter',630,840),
 rule('Lightning Enter',870,1080,[],{'Fire Enter':170},{alternative:'staff'}),rule('Fire Dupe',900,1110,[],{'Fire Enter':230},{alternative:'staff'}),
 rule('Lightning/Fire',910,1120,['Lightning Craft','Fire Craft','Lightning/Fire Craft'],{'Fire Enter':260},{alternative:'staff'}),
 rule('Ice Leave',1070,1280,[],{'Lightning Enter':180,'Fire Dupe':180,'Lightning/Fire':180}),rule('Upgrade',1200,1440,['All Upgrade','Wind Exit'],{'Ice Leave':150}),rule('End',1740,null,[],{Upgrade:540})]
};
export function splitName(profile,name){
 const matches=(SPLIT_RULES[profile?.map]??[]).filter(r=>r.aliases.includes(n(name)));
 return matches.length===1?matches[0].name:String(name??'');
}
export function resolveSplits(profile,rows,{timing=true,finished=false}={}) {
 const rules=SPLIT_RULES[profile?.map]??[];
 const allowTiming=timing&&['Mega Gums','Any%'].includes(profile?.category)&&!['moon','origins'].includes(profile?.map);
 const result=rows.map(s=>({...s,originalName:s.originalName??s.displayName??s.name}));
 const chosen=rows.map(s=>{const hits=rules.filter(r=>r.aliases.includes(n(s.originalName??s.displayName??s.name)));return hits.length===1?hits[0]:null;});
 for(let i=0;i<rows.length;i++){
  if(chosen[i]||!allowTiming||!Number.isFinite(rows[i].ms))continue;
  const before=chosen.slice(0,i).findLast(Boolean),after=chosen.slice(i+1).find(Boolean);
  const aliasHits=rules.filter(r=>r.aliases.includes(n(result[i].originalName)));
  const candidates=(aliasHits.length?aliasHits:rules).filter(r=>{
   const rank=rules.indexOf(r);
   if(chosen.includes(r)||rows[i].ms<r.min||rows[i].ms>r.max)return false;
   if(r.name==='End'&&!(finished&&i===rows.length-1))return false;
   if(before&&rank<=rules.indexOf(before)||after&&rank>=rules.indexOf(after))return false;
   if(r.alternative&&chosen.some(c=>c?.alternative===r.alternative))return false;
   for(const [name,seconds]of Object.entries(r.from)) {
    const j=chosen.findLastIndex((c,j)=>j<i&&c?.name===name);
    if(j>=0&&rows[i].ms-rows[j].ms<seconds*1000)return false;
   }
   return true;
  });
  if(candidates.length===1){chosen[i]=candidates[0];result[i].inferred=true;}
 }
 // Don't collapse two separate checkpoints into one record when both use aliases.
 const counts=new Map();for(const r of chosen)if(r)counts.set(r.name,(counts.get(r.name)??0)+1);
 return result.map((s,i)=>{const r=chosen[i];return r&&counts.get(r.name)===1?{...s,name:r.name.toLowerCase(),displayName:r.name}:s;});
}
export function displayAttempt(a){return a?{...a,current:a.current?splitName(a.profile,a.current):a.current,splits:resolveSplits(a.profile,a.splits??[],{finished:a.phase==='Ended'&&a.complete})}:a;}
