import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Store} from '../src/store.js';import {ChatResponder} from '../src/chat.js';import {discordCommands,discordInteraction,deliverAlerts} from '../src/discord.js';import {profile} from '../src/domain.js';import {WR_CHECKPOINTS} from '../src/wr-checkpoints.js';
test('new games reply through Twitch, YouTube and Discord; WR alerts deliver to the matching channel',async t=>{
 const records=['iw-zwr-baseline.json','victis-zwr-baseline.json'].flatMap(f=>JSON.parse(readFileSync(new URL('../src/'+f,import.meta.url))));
 for(const record of records){const store=new Store();try{const {player}=store.register('IntegrationRunner');store.put('metadata',record.id,record);const p=profile(record.profile),cp=WR_CHECKPOINTS.find(r=>r.profile.map===p.map&&r.profile.category===p.category).splits[0];
 const response=discordInteraction(store,{type:2,guild_id:'123456',channel_id:'234567',member:{permissions:'32'},data:{name:'track-alert',options:[{name:'player',value:player.id},{name:'map',value:p.map},{name:'category',value:p.category},{name:'split',value:cp.name},{name:'mode',value:'wr'}]}});assert.match(response.data.content,/Alert created/);
 store.ingest(player.id,{attemptId:'integration-attempt',sequence:1,profile:p,phase:'Running',index:1,elapsedMs:cp.ms,current:'Next',splits:[{index:0,name:cp.name,ms:cp.ms-1000}]});
 for(const provider of ['twitch','youtube']){const id='chat-connection:'+provider+':'+player.id;store.put('metadata',id,{id,kind:'chat-connection',provider,player:player.id,target:'test-channel',connected:true,enabled:true});const chat=new ChatResponder(store,450,Date.now,()=>0,provider);assert.match(chat.respond('test-channel','viewer','current','!current'),/IGT/);const wrChat=new ChatResponder(store,450,Date.now,()=>0,provider);assert.ok(wrChat.respond('test-channel','viewer','wr','!wr '+p.map+' '+p.category).includes(record.holder));}
 assert.match(discordInteraction(store,{type:2,data:{name:'current',options:[{name:'player',value:player.id}]}}).data.content,/IGT/);
 const calls=[];await deliverAlerts(store,'test-token',async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response('{}');});assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/channels/234567/messages'));assert.ok(calls[0].body.content.includes(cp.name));
 }finally{store.close();}}
 for(const command of discordCommands)for(const option of command.options??[])if(option.choices)assert.ok(option.choices.length<=25);
});
