import {setupDiscord} from './discord-panel.js';
import {streamCandidates,distinctSlots,playerUrl} from './watch.js?v=0.3.0';
const $=id=>document.getElementById(id);
let token='', me=null, loginExpiresAt=null, catalog, selected=new URLSearchParams(location.search).get('runner');
const format=ms=>{const s=Math.floor(Math.abs(ms)/1000),h=Math.floor(s/3600);return `${ms<0?'-':''}${h?h+':'+String(Math.floor(s/60)%60).padStart(2,'0'):Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;}
async function api(path,{method='GET',body,key=''}={}){
  const r=await fetch(path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:`Bearer ${key}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok){if(r.status===401&&!key&&me){clearLogin();notice('Your saved sign-in has expired or is no longer valid. Enter your runner key to sign in again.',true);}const error=new Error(data.error??`Request failed (${r.status})`);error.status=r.status;throw error;}return data;
}
function action(id,fn,event='click'){$(id).addEventListener(event,async e=>{e.preventDefault();const target=e.submitter??(e.currentTarget.tagName==='BUTTON'?e.currentTarget:null);if(target)target.disabled=true;try{await fn();}catch(error){notice(error.message,true);}finally{if(target)target.disabled=false;}});}
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
let candidates=[],streamKeys=['',''],streamDefaults=true;
function fillStreams(){
  for(const provider of ['twitch','youtube'])for(const slot of [0,1,2]) $(provider+'-url'+(slot?'-'+slot:'')).value=(me?.streams?.[provider+'Accounts']??[me?.streams?.[provider]])?.[slot]?.url??'';
}
action('streams-form',async()=>{requireLogin();const body={live:false};for(const provider of ['twitch','youtube'])body[provider+'Accounts']=[0,1,2].map(slot=>$(provider+'-url'+(slot?'-'+slot:'')).value);await api('/api/me/streams',{method:'POST',body});await loadMe();fillStreams();await refresh();notice('Stream links saved. Live status is checked automatically for Twitch and YouTube.');},'submit');
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
    for(const c of candidates){const o=node('option',`${c.name} · ${c.platform==='twitch'?'Twitch':'YouTube'} · ${c.slot?'alternate '+c.slot:'main'} · verified live`);o.value=c.key;o.disabled=!!other&&(other.id===c.id||other.url===c.url);opts.push(o);}
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
  section.append(node('p',`${format(s.durationMs)} elapsed · ${s.attempts} tracked attempts · ${s.resets} session resets`));
  if(s.reason==='inactive')section.append(node('p','Session ended after two hours without run activity. Duration stops at the last activity.','small muted'));
  if(s.current)section.append(node('p',`Currently: ${catalog.maps.find(m=>m.id===s.current.map)?.name??s.current.map} · ${s.current.category}`,'muted'));
  for(const g of s.groups){
    if(!g.isCurrentProfile){section.append(node('p',`${catalog.allMaps.find(m=>m.id===g.profile.map)?.name??g.profile.map} · ${g.profile.category??'Legacy'} — Previously played · ${g.resets} session resets · ${format(g.durationMs)} tracked time`,'muted'));continue;}
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
function rememberExpiry(value){try{if(value)localStorage.setItem('montyLoginExpires',String(value));else localStorage.removeItem('montyLoginExpires');sessionStorage.removeItem('runnerKey');}catch{}}
function syncLoginUI(){
  $('signed-out-panel').hidden=!!me;$('signed-in-panel').hidden=!me;
  $('identity-heading').textContent=me?'Your account':'1. Create your tracker identity';
  $('signed-in-name').textContent=me?'Signed in as '+me.name:'';
}
function expiryNote(){syncLoginUI();
  $('login-status').textContent=loginExpiresAt?'Saved sign-in expires '+new Date(loginExpiresAt).toLocaleString('en-US',{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})+' (your local time). '+(loginExpiresAt-Date.now()<=3*86400000?'Your sign-in expires soon. Keep your runner key ready to sign in again.':'You will need your runner key again after 30 days.'):'';
}
function clearLogin(){token='';me=null;loginExpiresAt=null;rememberExpiry(null);$('new-key').textContent='';$('new-key-box').hidden=true;$('runner-key').value='';$('account-state').textContent='Not signed in';$('source-status').textContent='';expiryNote();void loadChatbot();}
async function saveKey(value){const result=await api('/api/login',{method:'POST',key:value});token='';loginExpiresAt=result.expiresAt;rememberExpiry(loginExpiresAt);$('runner-key').value='';expiryNote();}

const discordPanel=setupDiscord({api,notice,player:()=>me,catalog:()=>catalog});
let chatConfig=null;
async function loadChatbot(){
  void discordPanel.refresh().catch(e=>notice(e.message,true));
  if(!me){chatConfig=null;$('chatbot-login').textContent='Sign in with your runner key in LiveSplit to manage your channels.';}
  else {chatConfig=await api('/api/me/chatbot');$('chatbot-login').textContent=`Managing channels for ${me.name}`;}
  for(const provider of ['twitch','youtube']){
    const c=chatConfig?.[provider]?.accounts?.[Number($(provider+'-account').value)]??chatConfig?.[provider];
    for(const option of $(provider+'-account').options){const a=chatConfig?.[provider]?.accounts?.[Number(option.value)];option.textContent=(option.value==='0'?'Main account':'Alternate '+option.value)+(a?.connected?' · '+a.name:'');}
    $('connect-'+provider).disabled=!chatConfig?.[provider]?.available;
    $('connect-'+provider).textContent=c?.connected?'Reconnect '+(provider==='twitch'?'Twitch':'YouTube'):'Connect '+(provider==='twitch'?'Twitch':'YouTube');
    $('disconnect-'+provider).hidden=!c?.connected;
    $(provider+'-chat-form').hidden=!c?.connected;
    $(provider+'-status').textContent=c?.connected?`${c.name} · ${c.status}`:chatConfig?.[provider]&&!chatConfig[provider].available?'Awaiting server setup':'Not connected';
    $(provider+'-enabled').checked=!!c?.enabled;
    $(provider+'-cooldown').value=c?.cooldownSeconds??15;
    for(const type of ['gold','pb','wr','communityWr'])$(provider+'-announce-'+type).checked=c?.announcements?.[type]===true;
    if(provider==='youtube'){
      const option=node('option',c?.broadcastId?'Selected broadcast: '+c.broadcastId:'Find your active broadcast first');option.value=c?.broadcastId??'';$('youtube-broadcast').replaceChildren(option);
    }
  }
}
for(const provider of ['twitch','youtube']){
  action('connect-'+provider,async()=>{requireLogin();const r=await api(`/api/me/chatbot/${provider}/connect`,{method:'POST',body:{slot:Number($(provider+'-account').value)}});location.assign(r.url);});
  action('disconnect-'+provider,async()=>{requireLogin();await api(`/api/me/chatbot/${provider}?slot=${$(provider+'-account').value}`,{method:'DELETE'});await loadChatbot();notice('Disconnected. Bot replies have been disabled for this connection.');});
  action(provider+'-chat-form',async()=>{requireLogin();await api(`/api/me/chatbot/${provider}/settings`,{method:'POST',body:{slot:Number($(provider+'-account').value),enabled:$(provider+'-enabled').checked,cooldownSeconds:Number($(provider+'-cooldown').value),announcements:Object.fromEntries(['gold','pb','wr','communityWr'].map(type=>[type,$(provider+'-announce-'+type).checked])),...(provider==='youtube'?{broadcastId:$('youtube-broadcast').value}:{})}});await loadChatbot();notice('Chatbot settings saved. Connection status updates after the bot joins.');},'submit');
}
for(const provider of ['twitch','youtube'])action(provider+'-account',loadChatbot,'change');
action('load-broadcasts',async()=>{requireLogin();const broadcasts=await api('/api/me/chatbot/youtube/broadcasts?slot='+$('youtube-account').value);const opts=broadcasts.map(b=>{const o=node('option',b.title);o.value=b.id;return o;});if(!opts.length){const o=node('option','No active broadcasts with live chat');o.value='';opts.push(o);}$('youtube-broadcast').replaceChildren(...opts);});
function revealKey(value){$('new-key').textContent=value;$('new-key-box').hidden=false;}
function download(name,data){const link=node('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function loadMe(){
  me=await api('/api/me');loginExpiresAt=me.loginExpiresAt;rememberExpiry(loginExpiresAt);expiryNote();$('account-state').textContent=`${me.name} · ${me.public?'Public':'Private'}`;
  renderAddonUpdate(me.addonUpdate);
  $('privacy').textContent=me.public?'Make tracking private':'Make tracking public';
  $('source-status').textContent=`Source: ${me.source?.type??'direct'}${me.sourceError?' · '+me.sourceError:''}. Session: ${me.sessionStarted?new Date(me.sessionStarted).toLocaleString():'not started'}.`;
}
function renderAddonUpdate(update){
  const box=$('addon-update');box.replaceChildren();box.hidden=!update||me?.source?.type==='therun';if(box.hidden)return;
  box.classList.toggle('important',update.state==='required');
  const title=update.state==='required'?'Important addon update':update.state==='available'?'Addon update available':update.state==='unknown'?'Check your LiveSplit addon version':'LiveSplit addon is up to date';
  box.append(node('strong',title));
  box.append(node('p',update.installedVersion?`Last reported: ${update.installedVersion} · Latest release: ${update.latestVersion}`:`Latest release: ${update.latestVersion}. Your addon has not reported a version yet. Older addons cannot report their version.`,'small'));
  if(update.lastReportedAt)box.append(node('p','Reported '+new Date(update.lastReportedAt).toLocaleString(),'small muted'));
  if(update.state!=='current'){
    box.append(node('p',update.message+' Save your splits and layout, close LiveSplit, replace the DLL, then reopen it.','small'));
    const link=node('a','Download latest addon');link.href='/downloads/Zombies-Tracker-LiveSplit.zip';link.className='button';box.append(link);
  }
}
function showTab(id){document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==id);document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('selected',t.dataset.tab===id));}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{showTab(t.dataset.tab);if(t.dataset.tab==='integrations')void loadChatbot().catch(e=>notice(e.message,true));}));
document.querySelectorAll('input[name="source"]').forEach(r=>r.addEventListener('change',()=>{$('direct-fields').hidden=r.value!=='direct';$('therun-fields').hidden=r.value!=='therun';}));
let runnerCache=[],runnerPage=0,archivePage=0;
const runnerPageSize=4;
function renderRunners(){
 const query=$('runner-search').value.trim().replace(/^@/,'').toLowerCase();
 const active=runnerCache.filter(p=>!p.archived),archived=runnerCache.filter(p=>p.archived);
 const order=(a,b)=>(a.status==='Running'?0:1)-(b.status==='Running'?0:1)||a.name.localeCompare(b.name);
 const matches=(query?runnerCache.filter(p=>p.name.toLowerCase().includes(query)||p.id.includes(query)):active).sort(order);
 archived.sort((a,b)=>(b.lastSeen??0)-(a.lastSeen??0)||a.name.localeCompare(b.name));
 $('runner-count').textContent=query?matches.length+(matches.length===1?' matching runner':' matching runners'):active.filter(p=>p.status==='Running').length+' running · '+active.length+' recently connected';
 
 function card(p){
  const b=node('button',null,'runner');const state=p.archived?'OFFLINE':p.status==='Running'?'RUNNING':p.status==='NotRunning'?'IDLE':p.status.toUpperCase();
  b.append(node('span',state,'pill'+(p.status==='Running'?' live':'')),node('strong',p.name),node('small',p.archived?'Run history is private':(catalog.allMaps??catalog.maps).find(m=>m.id===p.profile?.map)?.name??'Waiting for first connection'),node('small',p.archived?'':p.profile?.category?'Solo · '+p.profile.category+' · RTA':'No run recorded'));
  const age=p.lastSeen==null?null:Math.max(0,Date.now()-p.lastSeen);
  const ago=age==null?'Never connected':age<60000?'just now':age<3600000?Math.floor(age/60000)+' min ago':age<86400000?Math.floor(age/3600000)+' hr ago':Math.floor(age/86400000)+' days ago';
  const seen=node('small',age==null?ago:'Last seen '+ago,'runner-last-seen');if(p.lastSeen!=null)seen.title=new Date(p.lastSeen).toLocaleString();b.append(seen);
  b.addEventListener('click',()=>void details(p.id).catch(e=>notice(e.message,true)));return b;
 }
 function page(rows,current,listId,controls,label,prev,next){
  const pages=Math.max(1,Math.ceil(rows.length/runnerPageSize));current=Math.min(current,pages-1);
  const list=$(listId);list.replaceChildren();for(const p of rows.slice(current*runnerPageSize,(current+1)*runnerPageSize))list.append(card(p));
  if(!rows.length)list.append(node('p',query?'No runners match that name.':'No recently connected runners. Search a name to check when they were last seen.','muted'));
  $(controls).hidden=rows.length<=runnerPageSize;$(label).textContent='Page '+(current+1)+' of '+pages;$(prev).disabled=current===0;$(next).disabled=current>=pages-1;return current;
 }
 runnerPage=page(matches,runnerPage,'runner-list','runner-pagination','runners-page','runners-prev','runners-next');

}
$('runner-search').addEventListener('input',()=>{runnerPage=0;renderRunners();});
for(const [id,delta,archive]of [['runners-prev',-1,false],['runners-next',1,false]])$(id).addEventListener('click',()=>{if(archive)archivePage+=delta;else runnerPage+=delta;renderRunners();});
async function refresh(){runnerCache=await api('/api/players');renderRunners();updateStreams(runnerCache);if(selected)await details(selected);}
async function details(id){
  selected=id;const p=await api('/api/players/'+encodeURIComponent(id));$('detail-title').textContent=p.name;const box=$('detail');box.replaceChildren();
  if(p.archived){box.append(node('p','Offline · Last seen '+(p.lastSeen?new Date(p.lastSeen).toLocaleString():'never'),'muted'),node('p','Archived run details are private. Sign in to your own account to export your history.','small muted'));return;}
  if(p.private){box.append(node('p','This runner is no longer sharing tracking data.','muted'));return;}
  if(p.lastSeen)box.append(node('p','Last seen: '+new Date(p.lastSeen).toLocaleString(),'small muted'));
  box.append(node('p',`${p.status}${p.attempt?.current?' · Current: '+p.attempt.current:''}`,'muted'));
  if(p.attempt)box.append(node('p',`LiveSplit RTA at last update: ${format(p.attempt.elapsedMs)}${p.attempt.stageMap?' · '+catalog.maps.find(m=>m.id===p.attempt.stageMap)?.name:''}`,'muted'));
  box.append(node('p',p.attempt?.attemptCount!=null?`LiveSplit total attempts (loaded splits): ${p.attempt.attemptCount.toLocaleString()}`:'LiveSplit total attempts: unavailable — update to addon 0.2.5.','muted'));
  renderSession(box,p.session);
  if(p.attempt?.splits.length){const table=node('table'),head=node('tr');head.append(node('th','Checkpoint'),node('th','Run time'));table.append(head);for(const split of p.attempt.splits){const row=node('tr');row.append(node('td',split.displayName??split.name),node('td',format(split.ms)));table.append(row);}box.append(table);}else box.append(node('p','No checkpoints recorded yet.','muted'));
  if(p.attempt?.practice)box.append(node('p','Practice attempt — excluded from records.','small muted'));
  if(p.attempt&&!p.attempt.complete&&p.attempt.phase==='Ended')box.append(node('p','Incomplete run: required checkpoints may be missing.','small muted'));
}
action('refresh',refresh);
action('query-form',async()=>{$('answer').textContent=(await api('/api/query',{method:'POST',body:{command:$('command').value}})).reply;},'submit');
action('register-form',async()=>{const result=await api('/api/register',{method:'POST',body:{username:$('username').value},key:''});await saveKey(result.token);revealKey(result.token);await loadMe();await refresh();notice('Account created. Save your private runner key, then configure your data source.');},'submit');
action('login-form',async()=>{const candidate=$('runner-key').value.trim();await api('/api/me',{key:candidate});await saveKey(candidate);await loadMe();if(me.profile)for(const [k,v]of Object.entries(me.profile))if($(k))$(k).value=v;updateCategories(me.profile?.category);fillStreams();notice('Signed in for 30 days on this browser. Keep your runner key for your next sign-in.');},'submit');
let recoveryAccount='';
action('recover-form',async()=>{const result=await api('/api/recovery/discord/start',{method:'POST',body:{username:$('recover-name').value.trim()}});location.assign(result.url);},'submit');
action('recovery-reset',async()=>{const result=await api('/api/recovery/discord/reset',{method:'POST',body:{username:recoveryAccount}});$('recovery-confirm').hidden=true;rememberExpiry(result.expiresAt);revealKey(result.token);await loadMe();showTab('setup');notice('New key created. Save it and update the key in every LiveSplit layout you use.');});
action('copy-key',async()=>{await navigator.clipboard.writeText($('new-key').textContent);notice('Runner key copied.');});
action('enable-addon',async()=>{requireLogin();await api('/api/me/source',{method:'POST',body:{type:'direct'}});await loadMe();notice('LiveSplit upload enabled. Paste your runner key into the addon, enable uploads, and Apply. Use only one data source.');});
action('connect-therun',async()=>{requireLogin();await api('/api/me/source',{method:'POST',body:{type:'therun',username:$('therun-user').value,game:$('therun-game').value,category:$('therun-category').value,variables:json('therun-variables'),aliases:json('aliases'),profile:profile(),practice:$('practice').checked}});await loadMe();notice('therun.gg source saved. Matching public live updates are checked about every 15 seconds.');});
for(const mode of ['start','end'])action(mode+'-session',async()=>{requireLogin();await api('/api/me/session',{method:'POST',body:{action:mode}});await loadMe();notice(mode==='start'?'New session started.':'Session ended. Disable addon uploads or disconnect therun.gg to keep it ended.');});
action('privacy',async()=>{requireLogin();await api('/api/me/privacy',{method:'POST',body:{public:!me.public}});await loadMe();await refresh();notice(me.public?'Public tracking enabled.':'Tracking is private; chat queries and new role alerts are hidden.');});
action('export',async()=>{requireLogin();download(me.id+'-history.json',await api('/api/me/history'));});
action('rotate',async()=>{requireLogin();const r=await api('/api/me/rotate',{method:'POST',body:{}});await saveKey(r.token);revealKey(r.token);notice('Key rotated. Old keys no longer work. Update your key in the LiveSplit addon.');});
action('logout',async()=>{await api('/api/logout',{method:'POST'});clearLogin();notice('Signed out. This browser will ask for your runner key next time.');});
action('delete',async()=>{requireLogin();if($('delete-name').value.toLowerCase()!==me.id)throw new Error('Type your tracker username to confirm deletion.');await api('/api/me',{method:'DELETE'});$('logout').click();await refresh();notice('Account and recorded history deleted.');});
async function init(){catalog=await api('/api/catalog');for(const m of catalog.maps){const o=node('option',m.name);o.value=m.id;$('map').append(o);}$('map').value='der-eisendrache';updateCategories();$('server-state').textContent='Tracker online';try{let legacy;try{legacy=sessionStorage.getItem('runnerKey');}catch{}if(legacy)await saveKey(legacy);await loadMe();fillStreams();}catch(error){if(error.status===401){let wasSaved=false;try{wasSaved=!!localStorage.getItem('montyLoginExpires');}catch{}clearLogin();if(wasSaved)notice('Your saved sign-in has expired or is no longer valid. Sign in again with your runner key.',true);}else throw error;}await refresh();}
void init().then(async()=>{await loadChatbot();if(location.hash==='#integrations')showTab('integrations');const q=new URLSearchParams(location.search);if(q.has('recovery')){showTab('setup');history.replaceState(null,'','/#setup');if(q.get('recovery')==='ready'){const result=await api('/api/recovery/discord/status');recoveryAccount=result.name.toLowerCase();$('recovery-account').textContent='Discord verified for '+result.name+'.';$('recovery-confirm').hidden=false;}else notice(q.get('reason')??'Recovery failed. Please verify again.',true);}if(q.has('discord')){notice(q.get('discord')==='connected'?'Discord connected. Choose your server to set up alerts.':q.get('reason')??'Discord connection failed.',q.get('discord')!=='connected');history.replaceState(null,'','/#integrations');}if(q.has('chatbot')){notice(q.get('chatbot')==='connected'?'Channel connected. Enable replies when ready.':q.get('reason')??'Connection failed.',q.get('chatbot')!=='connected');history.replaceState(null,'','/#integrations');}}).catch(e=>notice(e.message,true));
setInterval(()=>{if(!document.hidden&&catalog){void refresh().catch(()=>{$('server-state').textContent='Connection unavailable';});if(me)void loadMe().catch(()=>{});}},10000);




window.addEventListener('storage',e=>{if(e.key==='montyLoginExpires'){if(!e.newValue){if(me){clearLogin();notice('Signed out in another tab.');}}else void loadMe().catch(()=>{});}});
setInterval(()=>{if(me&&loginExpiresAt){if(Date.now()>=loginExpiresAt){clearLogin();notice('Your 30-day sign-in has expired. Enter your runner key to sign in again.',true);}else expiryNote();}},10000);

