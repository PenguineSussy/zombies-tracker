import {discordCommands} from '../src/discord.js';
const {DISCORD_APP_ID:id,DISCORD_BOT_TOKEN:token,DISCORD_TEST_GUILD:guild}=process.env;
if(!id||!token)throw new Error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN in the environment.');
const url=`https://discord.com/api/v10/applications/${id}/${guild?'guilds/'+guild+'/':''}commands`;
// Upsert only tracker commands; preserve unrelated commands on the shared bot.
for(const command of discordCommands){
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Registration stopped at ${command.name} (HTTP ${response.status}). Existing commands were not deleted.`);
}
console.log(`Registered ${discordCommands.length} tracker commands ${guild?'in test guild '+guild:'globally'}; unrelated commands preserved.`);
