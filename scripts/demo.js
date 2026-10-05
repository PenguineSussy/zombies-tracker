// Synthetic local data only. Never contacts or posts to a chat platform.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const server='http://127.0.0.1:3000',path='data/demo-account.json';
const request=async(route,body,token)=>{const r=await fetch(server+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
mkdirSync('data',{recursive:true});
let account=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
if(!account){account=await request('/api/register',{username:'DemoRunner'});writeFileSync(path,JSON.stringify(account));}
const profile={map:'der-eisendrache',objective:'demo easter egg',players:1,rules:'synthetic demo',route:'standard',timing:'RealTime'};
await request('/api/ingest',{attemptId:randomUUID(),sequence:1,profile,phase:'Running',index:2,elapsedMs:458000,current:'Next milestone',splits:[{index:0,name:'bow',ms:283000},{index:1,name:'crackle',ms:451000}],complete:true,observedAt:Date.now()},account.token);
for(const command of ['!current @DemoRunner','!best @DemoRunner bow session','!best @DemoRunner bow alltime','!pace @DemoRunner'])console.log((await request('/api/query',{command})).reply);
console.log('Synthetic demo complete. The runner correctly becomes offline after 30 seconds without updates.');
