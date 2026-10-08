import {discordCommands} from '../src/discord.js';
import {setTimeout as wait} from 'node:timers/promises';
const {DISCORD_APP_ID:id,DISCORD_BOT_TOKEN:token,DISCORD_TEST_GUILD:guild}=process.env;
if(!id||!token)throw new Error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN in the environment.');
const url=`https://discord.com/api/v10/applications/${id}/${guild?'guilds/'+guild+'/':''}commands`;
// Upsert only tracker commands; preserve unrelated commands on the shared bot.
for(const command of discordCommands){
 for(let attempt=0;;attempt++){
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)});
  if(response.status===429 && attempt<5){
   const data=await response.json();const seconds=Number(data.retry_after??response.headers.get('retry-after')??5);
   if(!Number.isFinite(seconds)||seconds<0||seconds>300)throw new Error('Unexpected Discord retry interval; retry registration later.');
   console.log(`Discord rate limit; retrying ${command.name} in ${Math.ceil(seconds)} seconds.`);
   await wait(Math.ceil(seconds*1000)+250);continue;
  }
  if(!response.ok)throw new Error(`Registration stopped at ${command.name} (HTTP ${response.status}). Existing commands were not deleted.`);
  if(response.headers.get('x-ratelimit-remaining')==='0'){
   const seconds=Number(response.headers.get('x-ratelimit-reset-after')??5);
   await wait(Math.min(300000,Math.max(1000,Number.isFinite(seconds)?seconds*1000+250:5000)));
  }
  break;
 }
}
console.log(`Registered ${discordCommands.length} tracker commands ${guild?'in test guild '+guild:'globally'}; unrelated commands preserved.`);
