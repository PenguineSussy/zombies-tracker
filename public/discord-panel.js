export function setupDiscord({api,notice,player,catalog}){
 const $=id=>document.getElementById('discord-'+id);
 let guilds=[],details=null,revision=0;
 const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
 const on=(id,fn,event='click')=>$(id).addEventListener(event,async e=>{e.preventDefault();const button=e.submitter??(e.currentTarget.tagName==='BUTTON'?e.currentTarget:null);if(button)button.disabled=true;try{await fn();}catch(error){notice(error.message,true);}finally{if(button)button.disabled=false;}});
 const required=()=>{if(!player())throw Error('Sign in with your runner key first.');};
 function customCheckpoint(){const custom=$('split').value==='__custom';$('custom-label').hidden=!custom;$('custom').required=custom;}
 function categories(){const values=catalog()?.categoriesByMap?.[$('map').value]??[];$('category').replaceChildren(...values.map(v=>option(v,v)));if(values.includes('Mega Gums'))$('category').value='Mega Gums';$('split').replaceChildren(...(catalog()?.checkpointsByMap?.[$('map').value]??[]).map(n=>option(n,n)),option('__custom','Custom checkpoint…'));$('custom').value='';customCheckpoint();}
 function roles(){const ids=details?.channels.find(c=>c.id===$('channel').value)?.roleIds??[];$('role').replaceChildren(option('','No role ping'),...(details?.roles??[]).filter(r=>ids.includes(r.id)).map(r=>option(r.id,r.name)));}
 async function loadServer(){
  const rev=++revision,id=$('guild').value;details=null;$('server-controls').hidden=true;$('server-invite').hidden=true;$('server-note').textContent='';
  const guild=guilds.find(g=>g.id===id);if(!guild)return;
  if(!guild.installed){$('server-invite').href=guild.inviteUrl;$('server-invite').hidden=false;$('server-note').textContent='Add the bot to this server, approve on Discord, then click Refresh servers.';return;}
  $('server-note').textContent='Loading channels and alerts…';
  const data=await api('/api/me/discord/guilds/'+id);if(rev!==revision||!player())return;
  details=data;$('server-note').textContent=data.channels.length?'':'No available channels. Check View Channel and Send Messages permissions.';
  $('channel').replaceChildren(...data.channels.map(c=>option(c.id,'#'+c.name)));roles();$('server-controls').hidden=!data.channels.length;
  const nodes=data.alerts.map(a=>{
   const box=document.createElement('p'),text=document.createElement('span'),button=document.createElement('button');
   const channel=data.channels.find(c=>c.id===a.channel),role=data.roles.find(r=>r.id===a.role),map=catalog()?.maps.find(m=>m.id===a.profile.map);
   text.textContent=`${a.player==='*'?'All public runners':a.player} · ${map?.name??a.profile.map} · ${a.profile.category} · ${a.split} · #${channel?.name??a.channel}${role?' · @'+role.name:''} · ${a.mode==='wr'?'Faster than WR':a.mode==='under'?'At or under '+Math.floor(a.thresholdMs/60000)+':'+String(Math.floor(a.thresholdMs/1000)%60).padStart(2,'0'):'Every checkpoint completion'} `;
   button.type='button';button.className='secondary';button.textContent='Remove';button.setAttribute('aria-label','Remove alert for '+a.player+' '+a.split+' in '+(channel?.name??a.channel));
   button.addEventListener('click',async()=>{button.disabled=true;try{await api('/api/me/discord/guilds/'+id+'/alerts/'+a.id,{method:'DELETE'});if($('guild').value===id)await loadServer();}catch(e){notice(e.message,true);button.disabled=false;}});
   box.append(text,button);return box;
  });
  if(!nodes.length){const p=document.createElement('p');p.className='muted';p.textContent='No alerts saved for these channels.';nodes.push(p);}$('alerts').replaceChildren(...nodes);
 }
 async function servers(){required();const rev=++revision,old=$('guild').value;const list=await api('/api/me/discord/guilds');if(rev!==revision||!player())return;guilds=list;$('guild').replaceChildren(option('','Choose a server'),...list.map(g=>option(g.id,g.name+(g.installed?'':' — add bot first'))));if(list.some(g=>g.id===old))$('guild').value=old;$('server-note').textContent=list.length?'':'No servers found where you have Manage Server permission.';if($('guild').value)await loadServer();}
 async function refresh(){
  const rev=++revision,owner=player()?.id;const config=await api(owner?'/api/me/discord':'/api/discord/config');if(rev!==revision||player()?.id!==owner)return;
  $('invite').hidden=!config.inviteUrl;if(config.inviteUrl)$('invite').href=config.inviteUrl;
  $('connect').disabled=!owner||!config.available;$('disconnect').hidden=!config.connected;$('controls').hidden=!config.connected;
  $('status').textContent=!owner?'Sign in under LiveSplit to manage server alerts.':!config.available?'Website server controls are awaiting Discord app setup. You can still invite the bot and use /track-alert in Discord.':config.connected?'Connected as '+config.name:'Connect Discord to choose servers and channels.';
  if(!config.connected){guilds=[];details=null;$('guild').replaceChildren(option('','Choose a server'));$('server-controls').hidden=true;return;}
  if(!$('map').options.length){$('map').replaceChildren(...catalog().maps.map(m=>option(m.id,m.name)));categories();}
  if(!$('runner').value)$('runner').value='*';
  await servers();
 }
 on('connect',async()=>{required();location.assign((await api('/api/me/discord/connect',{method:'POST',body:{}})).url);});
 on('disconnect',async()=>{await api('/api/me/discord',{method:'DELETE'});await refresh();notice('Discord management disconnected. Saved server alerts remain active.');});
 on('refresh',servers);on('guild',loadServer,'change');on('channel',roles,'change');on('map',categories,'change');on('split',customCheckpoint,'change');
 on('mode',()=>{const show=$('mode').value==='under';$('threshold-label').hidden=!show;$('threshold').required=show;},'change');
 on('alert-form',async()=>{required();const id=$('guild').value;await api('/api/me/discord/guilds/'+id+'/alerts',{method:'POST',body:{channel:$('channel').value,role:$('role').value,player:$('runner').value,split:$('split').value==='__custom'?$('custom').value:$('split').value,profile:{map:$('map').value,category:$('category').value},mode:$('mode').value,threshold:$('threshold').value}});if($('guild').value===id)await loadServer();notice('Discord alert saved.');},'submit');
 return {refresh};
}
