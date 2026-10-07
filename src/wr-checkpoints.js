import {milliseconds,profileKey,superStage} from './domain.js';
import {splitName} from './split-rules.js';

// Reviewed 2026-10-07. Whole-second video displays retain their limited precision.
// Bind checkpoints to the reviewed record so a new WR cannot inherit old splits.
const baseline=[
 {
  "profile": {
   "map": "super-easter-egg",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "124834",
  "holder": "Invisible Hole",
  "ms": 7976000
 },
 {
  "profile": {
   "map": "shadows-of-evil",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "147015",
  "holder": "ASSEM158",
  "ms": 1166000
 },
 {
  "profile": {
   "map": "the-giant",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "68327",
  "holder": "scottiei3",
  "ms": 63000
 },
 {
  "profile": {
   "map": "der-eisendrache",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "129362",
  "holder": "Seqn",
  "ms": 1542000
 },
 {
  "profile": {
   "map": "zetsubou-no-shima",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "107472",
  "holder": "Invisible Hole",
  "ms": 1206000
 },
 {
  "profile": {
   "map": "gorod-krovi",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "109919",
  "holder": "Invisible Hole",
  "ms": 1861000
 },
 {
  "profile": {
   "map": "revelations",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "107656",
  "holder": "sable",
  "ms": 1384000
 },
 {
  "profile": {
   "map": "shangri-la",
   "category": "Any%",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "85150",
  "holder": "Itzs Nukez",
  "ms": 616000
 },
 {
  "profile": {
   "map": "moon",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "93060",
  "holder": "GameLikeADylan",
  "ms": 1139000
 },
 {
  "profile": {
   "map": "origins",
   "category": "Mega Gums",
   "players": 1,
   "timing": "RealTime"
  },
  "recordId": "74424",
  "holder": "ross_aiden",
  "ms": 1849000
 }
];
const reviewed={
 'shadows-of-evil':{Rift:'2:11',Sword:'7:35',Flag:'11:08',End:'19:26'},
 'the-giant':{End:'1:03.50'},
 'der-eisendrache':{Bow:'4:37',Crackle:'6:56',TP:'9:45',Key:'14:52','Boss Enter':'20:29',End:'25:42.70'},
 'zetsubou-no-shima':{Bunker:'3:50',Skull:'7:39','KT4/Rainbow Round End':'11:54','Boss Enter':'16:32',End:'20:06.05'},
 'gorod-krovi':{'Fly 1':'4:59',Spit:'6:40','Fly 2':'8:56',Challenges:'15:58',Download:'23:24',End:'31:01.30'},
 revelations:{Keeper:'3:07',Exit:'7:49',House:'11:58','Boss 1':'17:35',Basketball:'20:15','Boss 2':'21:51',End:'23:04.25'},
 moon:{Power:'0:44.50','Samantha Says':'4:34.75',Terminals:'5:51.95','Vril Sphere':'10:28.20','Canister 1':'11:14.00','Canister 2':'14:51.25',End:'18:59.90'},
 origins:{'Ice Staff':'6:35','Fire Enter':'11:18','Lightning Enter':'14:38','Fire Dupe':'15:44','Ice Leave':'18:58',Upgrade:'21:50',End:'30:49.55'},
 'shangri-la':{Tiles:'1:38',Crystal:'3:16',Napalm:'5:48',Radio:'8:20',End:'10:16'},
 'super-easter-egg':{'Shadows of Evil':'20:28','The Giant':'22:10','Der Eisendrache':'49:19','Zetsubou no Shima':'1:11:52','Gorod Krovi':'1:44:52',Revelations:'2:12:56.15'},
};
export const WR_CHECKPOINTS=Object.entries(reviewed).map(([map,splits])=>{
 const category=map==='shangri-la'?'Any%':'Mega Gums';
 const record=baseline.find(r=>r.profile.map===map&&r.profile.category===category);
 return {profile:record.profile,recordId:record.recordId,holder:record.holder,listedMs:record.ms,
  splits:Object.entries(splits).map(([name,value])=>({name,ms:Math.round(milliseconds(value)/50)*50,precisionMs:value.includes('.')?50:1000}))};
});
export function wrCheckpoint(store,profile,name){
 const record=store.get('metadata',`zwr:${profileKey(profile)}`);
 const reviewed=WR_CHECKPOINTS.find(r=>profileKey(r.profile)===profileKey(profile));
 if(!reviewed||!record||record.recordId!==reviewed.recordId||record.holder!==reviewed.holder||record.ms!==reviewed.listedMs)return null;
 // LiveSplit subsplit markers are display syntax, not part of the checkpoint name.
 const clean=String(name??'').replace(/^\s*(?:\{[^}]*\})?\s*-?\s*/,'');
 const canonical=profile.map==='super-easter-egg'?(superStage(clean,true)??(/^end$/i.test(clean)?'revelations':null)):splitName(profile,clean).toLowerCase();
 return reviewed.splits.find(s=>(profile.map==='super-easter-egg'?superStage(s.name,true):s.name.toLowerCase())===canonical)??null;
}
