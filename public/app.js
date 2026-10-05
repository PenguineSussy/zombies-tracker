import {streamCandidates,distinctSlots,playerUrl} from './watch.js?v=0.3.0';
const $=id=>document.getElementById(id);
let token=sessionStorage.getItem('runnerKey')??'', me=null, catalog, selected=new URLSearchParams(location.search).get('runner');
const format=ms=>{const s=Math.floor(Math.abs(ms)/1000),h=Math.floor(s/3600);return `${ms<0?'-':''}${h?h+':'+String(Math.floor(s/60)%60).padStart(2,'0'):Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;}
async function api(path,{method='GET',body,key=token}={}){
  const r=await fetch(path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:`Bearer ${key}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw new Error(data.error??`Request failed (${r.status})`);return data;
}
function action(id,fn,event='click'){$(id).addEventListener(event,async e=>{e.preventDefault();const target=e.submitter??(e.currentTarget.tagName==='BUTTON'?e.currentTarget:null);if(target)target.disabled=true;try{await fn();}catch(error){notice(error.message,true);}finally{if(target)target.disabled=false;}});}
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
let candidates=[],streamKeys=['',''],streamDefaults=true;
function fillStreams(){
  $('twitch-url').value=me?.streams?.twitch?.url??'';$('youtube-url').value=me?.streams?.youtube?.url??'';
  $('youtube-live').checked=(me?.streams?.liveUntil??0)>Date.now();
  $('stream-check').textContent=me?.streams?.twitch?'Twitch: '+(me.streamStatus?.channel===me.streams.twitch.channel&&me.streamStatus?.checkedAt>Date.now()-120000?me.streamStatus.status:'awaiting bot verification'):'';
}
action('streams-form',async()=>{requireLogin();await api('/api/me/streams',{method:'POST',body:{twitch:$('twitch-url').value,youtube:$('youtube-url').value,live:$('youtube-live').checked}});await loadMe();fillStreams();await refresh();notice('Stream links saved. Twitch visibility requires a successful live check; YouTube uses your live setting.');},'submit');
function updateStreams(players){
  candidates=streamCandidates(players);
  if(streamDefaults&&candidates.length){streamKeys=[candidates[0].key,candidates.find(c=>c.id!==candidates[0].id&&c.url!==candidates[0].url)?.key??''];streamDefaults=false;}
  renderStreams();
}
function renderStreams(){
  $('stream-empty').hidden=candidates.length>0;$('second-stream').hidden=!$('two-streams').checked;
  const chosen=distinctSlots(candidates,streamKeys);
  for(let i=0;i<2;i++) {
    const select=$(i?'stream-two':'stream-one'),box=$(i?'player-two':'player-one'),other=$('two-streams').checked?chosen[1-i]:null;
    const opts=[node('option','No stream')];opts[0].value='';
    for(const c of candidates){const o=node('option',`${c.name} · ${c.platform==='twitch'?'Twitch · verified live':'YouTube · runner-reported'}`);o.value=c.key;o.disabled=!!other&&(other.id===c.id||other.url===c.url);opts.push(o);}
    select.replaceChildren(...opts);select.value=chosen[i]?.key??'';
    const c=i&&!$('two-streams').checked?null:chosen[i];
    const renderKey=c?c.key+'|'+c.url:'';
    if(box.dataset.stream===renderKey)continue;
    box.dataset.stream=renderKey;box.replaceChildren();
    if(!c)continue;
    const link=node('a','Open on '+(c.platform==='twitch'?'Twitch':'YouTube'),'stream-link');link.href=c.url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);
    const load=node('button','Load player','secondary');box.append(load);
    load.addEventListener('click',()=>{
      if(c.platform==='twitch'&&box.clientWidth<400){notice('Open Twitch using the link above on this narrow screen.');return;}
      const frame=node('iframe');frame.title=c.name+' '+c.platform+' stream';frame.src=playerUrl(c,location.hostname);frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';frame.className='stream-player';box.append(frame);load.remove();
    });
  }
}
for(const [i,id]of ['stream-one','stream-two'].entries())$(id).addEventListener('change',()=>{streamKeys[i]=$(id).value;const chosen=candidates.find(c=>c.key===streamKeys[i]),other=candidates.find(c=>c.key===streamKeys[1-i]);if(chosen&&other&&(chosen.id===other.id||chosen.url===other.url))streamKeys[1-i]='';streamDefaults=false;renderStreams();});
$('two-streams').addEventListener('change',renderStreams);
function renderSession(box,s){
  const section=node('section',null,'session-stats');section.append(node('h3',s?.active?'This session':'Last session'));
  if(!s){section.append(node('p','No recorded session yet.','muted'));box.append(section);return;}
  section.append(node('p',`${format(s.durationMs)} elapsed · ${s.attempts} attempts · ${s.resets} observed resets`));
  if(s.current)section.append(node('p',`Currently: ${catalog.maps.find(m=>m.id===s.current.map)?.name??s.current.map} · ${s.current.category}`,'muted'));
  for(const g of s.groups){
    const group=node('details');group.append(node('summary',`${catalog.allMaps.find(m=>m.id===g.profile.map)?.name??g.profile.map} · ${g.profile.category??'Legacy'} · ${g.attempts} attempts`));
    group.append(node('p',`${g.finishes} complete finishes · Fastest: ${g.fastestMs==null?'not recorded':format(g.fastestMs)}`));
    const table=node('table'),head=node('tr');for(const label of ['Checkpoint','Average','Fastest','Samples'])head.append(node('th',label));table.append(head);
    for(const s of g.splits){const row=node('tr');for(const v of [s.name,format(s.averageMs),format(s.bestMs),s.count])row.append(node('td',v));table.append(row);}group.append(table);section.append(group);
  }
  section.append(node('p','Times are cumulative RTA checkpoints, grouped by map and category. Practice and missing splits are excluded from time statistics.','small muted'));
  if(s.unconfirmedEnds)section.append(node('p',`${s.unconfirmedEnds} attempt endings were not observed; they are not counted as confirmed resets.`,'small muted'));
  box.append(section);
}
function profile(){return {map:$('map').value,category:$('category').value,players:1,timing:'RealTime'};}
function updateCategories(preferred=$('category').value){
  const map=$('map').value;
  const allowed=catalog.categoriesByMap?.[map]??(['ascension','shangri-la'].includes(map)?['Any%']:['zetsubou-no-shima','super-easter-egg'].includes(map)?['Classic Gums','Mega Gums','Any%']:['No Gums','Classic Gums','Mega Gums','Any%']);
  $('category').replaceChildren(...allowed.map(c=>{const o=node('option',c);o.value=c;return o;}));
  $('category').value=allowed.includes(preferred)?preferred:allowed[0];
}
$('map').addEventListener('change',()=>updateCategories());
function json(id){try{return JSON.parse($(id).value);}catch{throw new Error(`${id}: enter valid JSON.`);}}
function requireLogin(){if(!me)throw new Error('Register or sign in with your runner key first.');}
function saveKey(value){token=value;sessionStorage.setItem('runnerKey',value);$('runner-key').value='';}
function revealKey(value){$('new-key').textContent=value;$('new-key-box').hidden=false;}
function download(name,data){const link=node('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function loadMe(){
  if(!token)return;
  me=await api('/api/me');$('account-state').textContent=`${me.name} · ${me.public?'Public':'Private'}`;
  $('privacy').textContent=me.public?'Make tracking private':'Make tracking public';
  $('source-status').textContent=`Source: ${me.source?.type??'direct'}${me.sourceError?' · '+me.sourceError:''}. Session: ${me.sessionStarted?new Date(me.sessionStarted).toLocaleString():'not started'}.`;
}
function showTab(id){document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==id);document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('selected',t.dataset.tab===id));}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>showTab(t.dataset.tab)));
document.querySelectorAll('input[name="source"]').forEach(r=>r.addEventListener('change',()=>{$('direct-fields').hidden=r.value!=='direct';$('therun-fields').hidden=r.value!=='therun';}));
async function refresh(){
  const players=await api('/api/players');const list=$('runner-list');list.replaceChildren();
  if(!players.length){const box=node('div',null,'empty');box.append(node('h3','Your community starts here.'),node('p','Register a runner in Runner setup, or run the local demo from the project folder.'));list.append(box);}
  for(const p of players){const b=node('button',null,'runner');const state=p.status==='Running'?'RUNNING':p.status==='NotRunning'?'IDLE':p.status.toUpperCase();b.append(node('span',state,'pill'+(p.status==='Running'?' live':'')),node('strong',p.name),node('small',(catalog.allMaps??catalog.maps).find(m=>m.id===p.profile?.map)?.name??'Waiting for first connection'),node('small',`${p.source==='therun'?'therun.gg':'LiveSplit'}${p.profile?' · '+(p.profile.category?'Solo · '+p.profile.category+' · RTA':'Legacy category'):''}`));b.addEventListener('click',()=>void details(p.id).catch(e=>notice(e.message,true)));list.append(b);}
  updateStreams(players);if(selected)await details(selected);
}
async function details(id){
  selected=id;const p=await api('/api/players/'+encodeURIComponent(id));$('detail-title').textContent=p.name;const box=$('detail');box.replaceChildren();
  if(p.private){box.append(node('p','This runner is no longer sharing tracking data.','muted'));return;}
  box.append(node('p',`${p.status}${p.attempt?.current?' · Current: '+p.attempt.current:''}`,'muted'));
  if(p.attempt)box.append(node('p',`LiveSplit RTA at last update: ${format(p.attempt.elapsedMs)}${p.attempt.stageMap?' · '+catalog.maps.find(m=>m.id===p.attempt.stageMap)?.name:''}`,'muted'));
  renderSession(box,p.session);
  if(p.attempt?.splits.length){const table=node('table'),head=node('tr');head.append(node('th','Checkpoint'),node('th','Run time'));table.append(head);for(const split of p.attempt.splits){const row=node('tr');row.append(node('td',split.name),node('td',format(split.ms)));table.append(row);}box.append(table);}else box.append(node('p','No checkpoints recorded yet.','muted'));
  if(p.attempt?.practice)box.append(node('p','Practice attempt — excluded from records.','small muted'));
  if(p.attempt&&!p.attempt.complete&&p.attempt.phase==='Ended')box.append(node('p','Incomplete run: required checkpoints may be missing.','small muted'));
}
action('refresh',refresh);
action('query-form',async()=>{$('answer').textContent=(await api('/api/query',{method:'POST',body:{command:$('command').value}})).reply;},'submit');
action('register-form',async()=>{const result=await api('/api/register',{method:'POST',body:{username:$('username').value},key:''});saveKey(result.token);revealKey(result.token);await loadMe();await refresh();notice('Account created. Save your private runner key, then configure your data source.');},'submit');
action('login-form',async()=>{const candidate=$('runner-key').value.trim();await api('/api/me',{key:candidate});saveKey(candidate);await loadMe();if(me.profile)for(const [k,v]of Object.entries(me.profile))if($(k))$(k).value=v;updateCategories(me.profile?.category);fillStreams();notice('Signed in.');},'submit');
action('copy-key',async()=>{await navigator.clipboard.writeText($('new-key').textContent);notice('Runner key copied.');});
action('enable-addon',async()=>{requireLogin();await api('/api/me/source',{method:'POST',body:{type:'direct'}});await loadMe();notice('LiveSplit upload enabled. Paste your runner key into the addon, enable uploads, and Apply. Use only one data source.');});
action('connect-therun',async()=>{requireLogin();await api('/api/me/source',{method:'POST',body:{type:'therun',username:$('therun-user').value,game:$('therun-game').value,category:$('therun-category').value,variables:json('therun-variables'),aliases:json('aliases'),profile:profile(),practice:$('practice').checked}});await loadMe();notice('therun.gg source saved. Matching public live updates are checked about every 15 seconds.');});
for(const mode of ['start','end'])action(mode+'-session',async()=>{requireLogin();await api('/api/me/session',{method:'POST',body:{action:mode}});await loadMe();notice(mode==='start'?'New session started.':'Session ended. Disable addon uploads or disconnect therun.gg to keep it ended.');});
action('privacy',async()=>{requireLogin();await api('/api/me/privacy',{method:'POST',body:{public:!me.public}});await loadMe();await refresh();notice(me.public?'Public tracking enabled.':'Tracking is private; chat queries and new role alerts are hidden.');});
action('export',async()=>{requireLogin();download(me.id+'-history.json',await api('/api/me/history'));});
action('rotate',async()=>{requireLogin();const r=await api('/api/me/rotate',{method:'POST',body:{}});saveKey(r.token);revealKey(r.token);notice('Key rotated. Old keys no longer work. Update your key in the LiveSplit addon.');});
action('logout',async()=>{token='';me=null;sessionStorage.removeItem('runnerKey');$('new-key').textContent='';$('new-key-box').hidden=true;$('account-state').textContent='Not signed in';$('source-status').textContent='';notice('Signed out of this tab.');});
action('delete',async()=>{requireLogin();if($('delete-name').value.toLowerCase()!==me.id)throw new Error('Type your tracker username to confirm deletion.');await api('/api/me',{method:'DELETE'});$('logout').click();await refresh();notice('Account and recorded history deleted.');});
async function init(){catalog=await api('/api/catalog');for(const m of catalog.maps){const o=node('option',m.name);o.value=m.id;$('map').append(o);}$('map').value='der-eisendrache';updateCategories();$('server-state').textContent='Tracker online';for(const id of ['twitch','discord','youtube'])$(id+'-status').textContent=catalog.integrations[id]?'Configured — check authorization':'Not configured';if(token)try{await loadMe();fillStreams();}catch{token='';sessionStorage.removeItem('runnerKey');}await refresh();}
void init().catch(e=>notice(e.message,true));
setInterval(()=>{if(!document.hidden&&catalog){void refresh().catch(()=>{$('server-state').textContent='Connection unavailable';});if(me)void loadMe().catch(()=>{});}},10000);
