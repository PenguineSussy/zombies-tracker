const $=id=>document.getElementById(id);
let token=sessionStorage.getItem('runnerKey')??'', me=null, catalog, selected=null;
const format=ms=>{const s=Math.floor(ms/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;}
async function api(path,{method='GET',body,key=token}={}){
  const r=await fetch(path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:`Bearer ${key}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw new Error(data.error??`Request failed (${r.status})`);return data;
}
function action(id,fn,event='click'){$(id).addEventListener(event,async e=>{e.preventDefault();const target=e.submitter??(e.currentTarget.tagName==='BUTTON'?e.currentTarget:null);if(target)target.disabled=true;try{await fn();}catch(error){notice(error.message,true);}finally{if(target)target.disabled=false;}});}
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function profile(){return {map:$('map').value,players:Number($('players').value),objective:$('objective').value,rules:$('rules').value,route:$('route').value,timing:$('timing').value};}
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
  for(const p of players){const b=node('button',null,'runner');const state=p.status==='Running'?'RUNNING':p.status==='NotRunning'?'IDLE':p.status.toUpperCase();b.append(node('span',state,'pill'+(p.status==='Running'?' live':'')),node('strong',p.name),node('small',(catalog.allMaps??catalog.maps).find(m=>m.id===p.profile?.map)?.name??'Waiting for first connection'),node('small',`${p.source==='therun'?'therun.gg':'Direct LiveSplit'}${p.profile?' · '+p.profile.players+'P · '+p.profile.rules:''}`));b.addEventListener('click',()=>void details(p.id).catch(e=>notice(e.message,true)));list.append(b);}
  if(selected)await details(selected);
}
async function details(id){
  selected=id;const p=await api('/api/players/'+encodeURIComponent(id));$('detail-title').textContent=p.name;const box=$('detail');box.replaceChildren();
  if(p.private){box.append(node('p','This runner is no longer sharing tracking data.','muted'));return;}
  box.append(node('p',`${p.status}${p.attempt?.current?' · Current: '+p.attempt.current:''}`,'muted'));
  if(p.attempt?.splits.length){const table=node('table'),head=node('tr');head.append(node('th','Checkpoint'),node('th','Run time'));table.append(head);for(const split of p.attempt.splits){const row=node('tr');row.append(node('td',split.name),node('td',format(split.ms)));table.append(row);}box.append(table);}else box.append(node('p','No checkpoints recorded yet.','muted'));
  if(p.attempt?.practice)box.append(node('p','Practice attempt — excluded from records.','small muted'));
  if(p.attempt&&!p.attempt.complete)box.append(node('p','Partial history: checkpoints may be missing.','small muted'));
}
action('refresh',refresh);
action('query-form',async()=>{$('answer').textContent=(await api('/api/query',{method:'POST',body:{command:$('command').value}})).reply;},'submit');
action('register-form',async()=>{const result=await api('/api/register',{method:'POST',body:{username:$('username').value},key:''});saveKey(result.token);revealKey(result.token);await loadMe();await refresh();notice('Account created. Save your private runner key, then configure your data source.');},'submit');
action('login-form',async()=>{const candidate=$('runner-key').value.trim();await api('/api/me',{key:candidate});saveKey(candidate);await loadMe();if(me.profile)for(const [k,v]of Object.entries(me.profile))if($(k))$(k).value=v;notice('Signed in.');},'submit');
action('copy-key',async()=>{await navigator.clipboard.writeText($('new-key').textContent);notice('Runner key copied.');});
action('download',async()=>{requireLogin();const config={server:$('server-url').value,token,livesplit:{host:'127.0.0.1',port:16834},profile:profile(),practice:$('practice').checked,aliases:json('aliases')};const u=new URL(config.server);if(u.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('Use HTTPS for a remote tracker.');await api('/api/me/source',{method:'POST',body:{type:'direct'}});download('config.json',config);await loadMe();notice('Configuration downloaded. Move config.json to companion/, then run npm run companion. Restart the companion after changing source settings.');});
action('connect-therun',async()=>{requireLogin();await api('/api/me/source',{method:'POST',body:{type:'therun',username:$('therun-user').value,game:$('therun-game').value,category:$('therun-category').value,variables:json('therun-variables'),aliases:json('aliases'),profile:profile(),practice:$('practice').checked}});await loadMe();notice('therun.gg source saved. Matching public live updates are checked about every 15 seconds.');});
for(const mode of ['start','end'])action(mode+'-session',async()=>{requireLogin();await api('/api/me/session',{method:'POST',body:{action:mode}});await loadMe();notice(mode==='start'?'New session started.':'Session ended. Stop the companion or disconnect therun.gg to keep it ended.');});
action('privacy',async()=>{requireLogin();await api('/api/me/privacy',{method:'POST',body:{public:!me.public}});await loadMe();await refresh();notice(me.public?'Public tracking enabled.':'Tracking is private; chat queries and new role alerts are hidden.');});
action('export',async()=>{requireLogin();download(me.id+'-history.json',await api('/api/me/history'));});
action('rotate',async()=>{requireLogin();const r=await api('/api/me/rotate',{method:'POST',body:{}});saveKey(r.token);revealKey(r.token);notice('Key rotated. Old keys no longer work. Update your companion config before restarting it.');});
action('logout',async()=>{token='';me=null;sessionStorage.removeItem('runnerKey');$('new-key').textContent='';$('new-key-box').hidden=true;$('account-state').textContent='Not signed in';$('source-status').textContent='';notice('Signed out of this tab.');});
action('delete',async()=>{requireLogin();if($('delete-name').value.toLowerCase()!==me.id)throw new Error('Type your tracker username to confirm deletion.');await api('/api/me',{method:'DELETE'});$('logout').click();await refresh();notice('Account and recorded history deleted.');});
action('benchmark-form',async()=>{await api('/api/admin/benchmarks',{method:'POST',key:$('admin-key').value,body:{profile:profile(),holder:$('holder').value,source:$('benchmark-url').value,verifiedDate:$('verified-date').value,splits:json('benchmark-splits')}});$('admin-key').value='';notice('Benchmark saved for new attempts in the selected category.');},'submit');
async function init(){catalog=await api('/api/catalog');for(const m of catalog.maps){const o=node('option',m.name);o.value=m.id;$('map').append(o);}$('map').value='der-eisendrache';$('server-url').value=location.origin;$('server-state').textContent='Tracker online';for(const id of ['twitch','discord','youtube'])$(id+'-status').textContent=catalog.integrations[id]?'Configured — check authorization':'Not configured';if(token)try{await loadMe();}catch{token='';sessionStorage.removeItem('runnerKey');}await refresh();}
void init().catch(e=>notice(e.message,true));
setInterval(()=>{if(!document.hidden&&catalog){void refresh().catch(()=>{$('server-state').textContent='Connection unavailable';});if(me)void loadMe().catch(()=>{});}},10000);
