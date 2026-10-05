import {discordCommands} from '../src/discord.js';
const {DISCORD_APP_ID:id,DISCORD_BOT_TOKEN:token,DISCORD_TEST_GUILD:guild}=process.env;
if(!id||!token)throw new Error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN in .env.');
const url=`https://discord.com/api/v10/applications/${id}/${guild?'guilds/'+guild+'/':''}commands`;
const response=await fetch(url,{method:'PUT',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},body:JSON.stringify(discordCommands)});
if(!response.ok)throw new Error(`Discord command registration failed (${response.status}). Check app ID and bot token.`);
console.log(`Registered ${discordCommands.length} commands ${guild?'in test guild '+guild:'globally'}.`);
