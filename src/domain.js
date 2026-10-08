import {validAddonVersion} from './addon-updates.js';
export const MAPS = [
  ['super-easter-egg', 'Super Easter Egg (6 maps)'],
  ['shadows-of-evil', 'Shadows of Evil'], ['the-giant', 'The Giant'],
  ['der-eisendrache', 'Der Eisendrache'], ['zetsubou-no-shima', 'Zetsubou No Shima'],
  ['gorod-krovi', 'Gorod Krovi'], ['revelations', 'Revelations'],
  ['nacht-der-untoten', 'Nacht der Untoten'], ['verruckt', 'Verrückt'],
  ['shi-no-numa', 'Shi No Numa'], ['kino-der-toten', 'Kino der Toten'],
  ['ascension', 'Ascension'], ['shangri-la', 'Shangri-La'], ['moon', 'Moon'], ['origins', 'Origins'],
].map(([id, name]) => ({ id, name, enabled: ![
  'nacht-der-untoten', 'verruckt', 'shi-no-numa', 'kino-der-toten',
].includes(id) }));

export const ENABLED_MAPS = MAPS.filter(map => map.enabled);
export const CATEGORIES = ['No Gums', 'Classic Gums', 'Mega Gums', 'Any%'];
export function categoriesForMap(map) {
  if (['ascension', 'shangri-la'].includes(map)) return ['Any%'];
  return ['zetsubou-no-shima','super-easter-egg'].includes(map) ? CATEGORIES.filter(c => c !== 'No Gums') : [...CATEGORIES];
}
const CORE_MAP_ALIASES = {
  'shadows-of-evil':['shadows of evil','soe'], 'the-giant':['the giant','giant'],
  'der-eisendrache':['der eisendrache','de'], 'zetsubou-no-shima':['zetsubou no shima','zetsubou','zns'],
  'gorod-krovi':['gorod krovi','gk'], revelations:['revelations','rev'],
};
const stageWords = value => String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function superStage(name, completion=false) {
  const text=stageWords(name);
  return Object.entries(CORE_MAP_ALIASES).find(([,aliases])=>aliases.some(alias=>completion ? [alias,alias+' complete',alias+' ee',alias+' finish'].includes(text) : text===alias||text.startsWith(alias+' ')))?.[0]??null;
}
export function requireEnabledMap(id) {
  check(ENABLED_MAPS.some(map => map.id === id), 'This map is disabled for new runs. Choose an enabled map.');
}

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function check(value, message, status) { if (!value) throw new InputError(message, status); }
export function clean(value, max = 80) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f<>@]/.test(value), 'Invalid text value.');
  return value.trim();
}
export function key(value) { return clean(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' '); }
export function profile(input) {
  check(input && typeof input === 'object', 'Choose a run profile.');
  check(MAPS.some(m => m.id === input.map), 'Choose an official BO3 map.');
  check(input.players === undefined || input.players === 1, 'This tracker supports Solo Easter Egg runs only.');
  const category = CATEGORIES.find(c => c.toLowerCase() === String(input.category).trim().toLowerCase());
  check(category, 'Choose No Gums, Classic Gums, Mega Gums, or Any%. Update older companion configurations in Runner setup.');
  check(categoriesForMap(input.map).includes(category), `This map allows only: ${categoriesForMap(input.map).join(', ')}.`);
  check(input.timing === undefined || input.timing === 'RealTime', 'This tracker uses RTA (Real Time) only.');
  return { map: input.map, category, players: 1, timing: 'RealTime' };
}
// Retain historical categories without silently assigning old records to a gum category.
export function profileKey(p) { return p.category ? JSON.stringify({map:p.map,category:p.category,players:p.players??1,timing:p.timing??'RealTime'}) : JSON.stringify({map:p.map,objective:p.objective,players:p.players,rules:p.rules,route:p.route,timing:p.timing}); }
export function profileLabel(p) {
  return `${MAPS.find(m => m.id === p.map)?.name ?? p.map} · ${p.category ? 'Solo · Easter Egg · '+p.category : 'Legacy · '+p.players+'P · '+p.objective+' · '+p.rules+' · '+p.route} · ${p.timing === 'RealTime' ? 'RTA' : p.timing}`;
}
export function milliseconds(value) {
  if (value == null || value === '-' || value === '') return null;
  const text = String(value).trim().replace(',', '.').replace('−', '-');
  if (!/^-?\d+(?::\d{1,2}){0,2}(?:\.\d{1,7})?$/.test(text)) throw new InputError('Invalid timer value.');
  const sign = text.startsWith('-') ? -1 : 1;
  const parts = text.replace('-', '').split(':').map(Number);
  if (parts.length > 1) check(parts.slice(1).every(v => v < 60), 'Invalid timer value.');
  return Math.round(parts.reduce((n, part) => n * 60 + part, 0) * 1000 * sign);
}
export function time(ms) {
  if (ms == null) return 'unavailable';
  const sign = ms < 0 ? '-' : '';
  let s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const fraction = Math.abs(ms) % 1000;
  return `${sign}${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}${fraction ? '.' + String(fraction).padStart(3, '0').replace(/0+$/, '') : ''}`;
}
export function snapshot(input) {
  check(input && typeof input === 'object', 'Snapshot required.');
  check(/^[\w-]{8,80}$/.test(input.attemptId), 'Invalid attempt ID.');
  check(Number.isSafeInteger(input.sequence) && input.sequence >= 0, 'Invalid sequence.');
  check(['Running', 'Paused', 'Ended', 'NotRunning'].includes(input.phase), 'Invalid timer phase.');
  check(Number.isInteger(input.index) && input.index >= -1 && input.index <= 500, 'Invalid split index.');
  check(Number.isSafeInteger(input.elapsedMs) && input.elapsedMs >= -3600000 && input.elapsedMs <= 604800000, 'Invalid elapsed time.');
  check(Array.isArray(input.splits) && input.splits.length <= 500, 'Invalid splits.');
  let previous = -1, previousTime = -1;
  const splits = input.splits.map(s => {
    check(Number.isInteger(s.index) && s.index > previous && s.index < input.index, 'Splits must be ordered, unique, and completed.');
    check(Number.isSafeInteger(s.ms) && s.ms >= 0 && s.ms >= previousTime && s.ms <= input.elapsedMs, 'Invalid checkpoint time.');
    previous = s.index; previousTime = s.ms;
    return { index: s.index, name: key(s.name), displayName: clean(s.name), ms: s.ms };
  });
  check(new Set(splits.map(s => s.name)).size === splits.length, 'Milestone names must be unique. Map repeated splits to distinct names.');
  const result = { attemptId: input.attemptId, sequence: input.sequence, profile: profile(input.profile),
    phase: input.phase, index: input.index, elapsedMs: input.elapsedMs,
    current: input.current && input.current !== '-' ? clean(input.current) : null,
    splits, practice: input.practice === true, complete: input.complete === true, suppressAlerts: input.suppressAlerts === true,
    observedAt: Number.isSafeInteger(input.observedAt) ? input.observedAt : Date.now() };
  if(input.addonVersion!=null){check(validAddonVersion(input.addonVersion),'Invalid addon version.');result.addonVersion=input.addonVersion;}
  if (result.phase === 'NotRunning') check(splits.length === 0, 'Idle snapshots cannot contain splits.');
  result.complete = result.complete && result.index >= 0 && result.splits.length === result.index;
  if(result.profile.map==='super-easter-egg') {
    const completed=result.splits.map(s=>superStage(s.name,true)).filter(Boolean);
    result.stageMap=superStage(result.current)??(result.phase==='Ended'?'revelations':null);
    result.complete=result.complete&&new Set(completed).size===6&&completed.length===6&&completed.at(-1)==='revelations';
  }
  if(input.resetEvent!=null){check(typeof input.resetEvent==='boolean','Invalid reset event.');result.resetEvent=input.resetEvent;}
  if(input.attemptCount!=null) {
    check(Number.isSafeInteger(input.attemptCount)&&input.attemptCount>=0&&input.attemptCount<=2147483647,'Invalid LiveSplit attempt count.');
    result.attemptCount=input.attemptCount;
  }
  if(input.records != null) {
    check(Array.isArray(input.records.splits) && input.records.splits.length>0 && input.records.splits.length<=500,'Invalid saved splits.');
    const validTime=v=>{check(v==null || (Number.isSafeInteger(v)&&v>=0&&v<=604800000),'Invalid saved time.');return v??null;};
    const saved=input.records.splits.map((s,i)=>{check(s.index===i,'Saved splits must be in order.');return {index:i,name:key(s.name),displayName:clean(s.name),pbSplitMs:validTime(s.pbSplitMs),bestSplitMs:validTime(s.bestSplitMs),bestSegmentMs:validTime(s.bestSegmentMs)};});
    check(new Set(saved.map(s=>s.name)).size===saved.length,'Saved split names must be unique.');
    result.records={pbMs:validTime(input.records.pbMs),splits:saved};
  }
  return result;
}

function legacyCommand(text, defaultPlayer) {
  const words = String(text).trim().match(/"[^"]+"|\S+/g)?.map(s => s.replace(/^"|"$/g, '')) ?? [];
  if (words[0]?.startsWith('@')) words.shift();
  const command = words.shift()?.toLowerCase();
  if (!['!current', '!best', '!splits', '!pace', '!session', '!pb', '!wr', '!sessionpb', '!help'].includes(command)) return null;
  if (command === '!help') return { command: 'help' };
  if(command==='!sessionpb'){const player=words.shift()?.replace(/^@/,'').toLowerCase();return !words.length&&(!player||/^[a-z0-9_]{3,30}$/.test(player))?{command:'sessionpb',player}:{command:'help'};}
  if (command === '!pb') {
    let player;
    if(words[0]?.startsWith('@')) {
      player=words.shift().slice(1).toLowerCase();
      if(!/^[a-z0-9_]{3,30}$/.test(player))return {command:'pb',error:'Use !pb [@runner] [map] [category].'};
    }
    if(!words.length)return {command:'pb',player};
    const selected=legacyCommand('!wr '+words.join(' '));
    // Retain the old unmentioned username syntax only when it is not a map.
    if(!player&&words.length===1&&selected.error?.startsWith('Use !wr')&&/^[a-z0-9_]{3,30}$/i.test(words[0]))return {command:'pb',player:words[0].toLowerCase()};
    return {command:'pb',player,...(selected.error?{error:selected.error.replace('!wr <map>','!pb [@runner] <map>').replace('!wr Der Eisendrache','!pb @Penguine Der Eisendrache')}:{profile:selected.profile})};
  }
  if (command === '!wr') {
    const text=stageWords(words.join(' '));
    const candidates=ENABLED_MAPS.flatMap(m=>[m.name,m.id,...(CORE_MAP_ALIASES[m.id]??[]),...(m.id==='super-easter-egg'?['super easter egg','super ee']:[])].map(alias=>({map:m.id,alias:stageWords(alias)}))).sort((a,b)=>b.alias.length-a.alias.length);
    const match=candidates.find(m=>text===m.alias||text.startsWith(m.alias+' '));
    if(!match) return {command:'wr',error:'Use !wr <map> [category], e.g. !wr Der Eisendrache Any%. Mega Gums is the default.'};
    const suffix=text.slice(match.alias.length).trim();
    const category=suffix ? CATEGORIES.find(c=>stageWords(c)===suffix) : 'Mega Gums';
    if(!category) return {command:'wr',error:'Choose No Gums, Classic Gums, Mega Gums, or Any%.'};
    return {command:'wr',profile:{map:match.map,category}};
  }
  const player = defaultPlayer!==undefined&&!words[0]?.startsWith('@')?(defaultPlayer??undefined):words.shift()?.replace(/^@/, '').toLowerCase();
  if (player && !/^[a-z0-9_]{3,30}$/.test(player)) return { command: 'help' };
  let scope = 'session';
  if (['session', 'alltime'].includes(words.at(-1)?.toLowerCase())) scope = words.pop().toLowerCase();
  return { command: command.slice(1), player, split: words.join(' '), scope };
}

// Map and split words take precedence over unmentioned runner names.
export function parseCommand(text, defaultPlayer, runnerIds=[]) {
 const words=String(text).trim().match(/"[^"]+"|\S+/g)?.map(s=>s.replace(/^"|"$/g,''))??[];
 if(words[0]?.startsWith('@'))words.shift();
 const command=words.shift()?.toLowerCase();
 if(!['!current','!best','!splits','!pace','!session','!pb','!wr','!sessionpb','!help'].includes(command))return null;
 if(command==='!help')return {command:'help'};
 const name=command.slice(1);
 if(name==='wr'&&words[0]?.startsWith('@'))return {command:name,error:'Use !wr <map> [category].'};
 let player=defaultPlayer??undefined;
 if(words[0]?.startsWith('@'))player=words.shift().slice(1).toLowerCase();
 else if(words[0] && runnerIds.includes(words[0].toLowerCase()) && legacyCommand('!wr '+words[0]).error)player=words.shift().toLowerCase();
 else if(defaultPlayer===undefined && words[0] && legacyCommand('!wr '+words.join(' ')).error?.startsWith('Use !wr') && /^[a-z0-9_]{3,30}$/i.test(words[0]))player=words.shift().toLowerCase();
 if(player&&!/^[a-z0-9_]{3,30}$/.test(player))return {command:name,error:'Use a valid runner name.'};
 if(name==='wr') {
  if(!words.length)return player?{command:name,player}:{command:name,error:'Use !wr <map> [category], or use !wr in a linked chat.'};
  return legacyCommand('!wr '+words.join(' '));
 }
 let scope='session';
 const scopeAt=words.findIndex(w=>['session','alltime'].includes(w.toLowerCase()));
 if(scopeAt>=0)scope=words.splice(scopeAt,1)[0].toLowerCase();
 let selected;
 for(let i=0;i<words.length;i++) {
  const candidate=legacyCommand('!wr '+words.slice(i).join(' '));
  if(!candidate.error || !candidate.error.startsWith('Use !wr')) {
   if(candidate.error)return {command:name,player,error:candidate.error};
   selected=candidate.profile;words.splice(i);break;
  }
 }
 if(name!=='best'&&words.length)return {command:name,player,error:'Unknown map or category. Use a supported map name or abbreviation.'};
 return {command:name,player,scope,...(scopeAt>=0?{scopeExplicit:true}:{}),split:words.join(' '),...(selected?{profile:selected}:{})};
}
