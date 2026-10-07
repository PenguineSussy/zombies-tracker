const $=id=>document.getElementById(id), body=$('activity-body'),toggle=$('activity-toggle'),scroll=$('activity-scroll'),items=$('activity-items');
let hidden=false,paused=false,hover=false,focused=false,busy=false,lastIds='',lastFrame=0;
try{hidden=localStorage.getItem('montyActivityHidden')==='true';}catch{}
function visibility(){body.hidden=hidden;toggle.textContent=hidden?'▾':'▴';toggle.setAttribute('aria-expanded',String(!hidden));toggle.setAttribute('aria-label',hidden?'Show live activity':'Hide live activity');}
visibility();toggle.addEventListener('click',()=>{hidden=!hidden;visibility();try{localStorage.setItem('montyActivityHidden',String(hidden));}catch{}if(!hidden)void update();});
$('activity-pause').addEventListener('click',()=>{paused=!paused;$('activity-pause').textContent=paused?'Resume scrolling':'Pause scrolling';$('activity-pause').setAttribute('aria-pressed',String(paused));});
scroll.addEventListener('mouseenter',()=>hover=true);scroll.addEventListener('mouseleave',()=>hover=false);scroll.addEventListener('focusin',()=>focused=true);scroll.addEventListener('focusout',()=>focused=false);
scroll.addEventListener('touchstart',()=>{paused=true;$('activity-pause').textContent='Resume scrolling';$('activity-pause').setAttribute('aria-pressed','true');},{passive:true});
const time=ms=>{const sec=Math.floor(ms/1000);return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;};
function el(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;}
async function update(){
 if(busy||document.hidden||hidden)return;busy=true;
 try{const response=await fetch('/api/activity');if(!response.ok)throw Error();const events=await response.json();const ids=JSON.stringify(events);
 $('activity-status').textContent='Public runner updates · refreshes every 5 seconds';
 if(ids===lastIds)return;lastIds=ids;items.replaceChildren();
 if(!events.length){items.append(el('p','No recent activity. Splits, resets and PBs will appear here.','muted'));return;}
 for(const event of events){const card=el('article','',`activity-item ${event.type}`);card.append(el('span',({pb:'NEW PB',finish:'FINISHED',reset:'RESET',split:'CHECKPOINT'})[event.type]??'UPDATE','activity-type'));const text=el('p','');text.append(el('strong',event.runner+' '),document.createTextNode(event.type==='split'?`hit ${event.split} · ${time(event.ms)} RTA`:event.type==='reset'?`reset at ${time(event.ms)}`:event.type==='pb'?`set a PB · ${time(event.ms)} RTA`:`finished · ${time(event.ms)} RTA`));card.append(text,el('small',`${event.map} · ${event.category}`),el('p',new Date(event.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),'small muted'));items.append(card);}
 }catch{$('activity-status').textContent='Updates unavailable · retrying shortly';}finally{busy=false;}
}
let travel=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function animate(now){const delta=Math.min(now-lastFrame,80);lastFrame=now;if(!paused&&!hover&&!focused&&!hidden&&!document.hidden&&!reduced.matches&&scroll.scrollWidth>scroll.clientWidth){travel+=delta*.035;if(travel>=1){scroll.scrollLeft+=Math.floor(travel);travel%=1;}if(scroll.scrollLeft>=scroll.scrollWidth-scroll.clientWidth-1)scroll.scrollLeft=0;}requestAnimationFrame(animate);}
void update();setInterval(()=>void update(),5000);requestAnimationFrame(animate);

