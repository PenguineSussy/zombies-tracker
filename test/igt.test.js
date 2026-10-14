import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {snapshot} from '../src/domain.js';
import {announcementText} from '../src/announcements.js';
import {publicActivity} from '../src/activity.js';

const profile={map:'der-eisendrache',category:'Mega Gums',players:1,timing:'RealTime'};
const event=(extra={})=>({attemptId:'igt-attempt-001',sequence:1,profile,phase:'Running',index:1,elapsedMs:512000,igtMs:431000,current:'Crackle',splits:[{index:0,name:'Rocket',ms:500000,igtMs:420000}],...extra});
test('IGT reaches public run, commands and Discord split alerts without changing RTA thresholds',t=>{
 const store=new Store();t.after(()=>store.close());const {player}=store.register('Runner');
 store.subscribe({guild:'123456',channel:'234567',player:player.id,profile,split:'Rocket',mode:'under',thresholdMs:450000});
 store.ingest(player.id,event());
 assert.equal(store.view(player.id).attempt.igtMs,431000);
 assert.equal(store.view(player.id).attempt.splits[0].igtMs,420000);
 assert.match(store.answer('!current Runner'),/8:32 RTA \(7:11 IGT\)/);
 assert.match(store.answer('!splits Runner'),/8:20 RTA \(7:00 IGT\)/);
 assert.equal(store.list('outbox').length,0,'IGT must not qualify an RTA threshold');
 store.subscribe({guild:'123456',channel:'345678',player:player.id,profile,split:'Crackle',mode:'milestone'});
 store.ingest(player.id,event({sequence:2,index:2,elapsedMs:550000,igtMs:460000,splits:[...event().splits,{index:1,name:'Crackle',ms:540000,igtMs:450000}]}));
 assert.match(store.list('outbox')[0].content,/9:00 RTA \(7:30 IGT\)/);
 assert.equal(publicActivity(store)[0].igtMs,450000);
});
test('missing IGT stays absent; malformed and decreasing IGT is rejected',()=>{
 const legacy=event({igtMs:undefined,splits:[{index:0,name:'Rocket',ms:500000}]});
 assert.equal(snapshot(legacy).igtMs,null);assert.equal(snapshot(legacy).splits[0].igtMs,null);
 for(const igtMs of [-1,'431000',Infinity,604800001])assert.throws(()=>snapshot(event({igtMs})),/IGT/);
 assert.throws(()=>snapshot(event({igtMs:400000})),/split IGT/);
 assert.throws(()=>snapshot(event({index:2,splits:[...event().splits,{index:1,name:'Crackle',ms:510000,igtMs:410000}]})),/split IGT/);
 assert.equal(snapshot(event({igtMs:0,splits:[{index:0,name:'Rocket',ms:500000,igtMs:0}]})).igtMs,0);
 assert.equal(snapshot(event({phase:'NotRunning',index:-1,splits:[],elapsedMs:0})).igtMs,null);
});
test('announcements display only the IGT paired with their RTA result',()=>{
 const job={runner:'Runner',type:'pb',profile,ms:512000,igtMs:431000,before:520000};
 assert.match(announcementText(job),/8:32 RTA \(7:11 IGT\)/);
 assert.doesNotMatch(announcementText({...job,igtMs:null}),/IGT/);
});
test('saved PB IGT stays paired with the saved RTA, not the current run',t=>{
 const store=new Store();t.after(()=>store.close());const {player}=store.register('Runner');
 store.ingest(player.id,event({records:{pbMs:600000,pbIgtMs:480000,splits:[{index:0,name:'Rocket',pbSplitMs:600000}]}}));
 assert.match(store.answer('!pb Runner'),/10:00 RTA \(8:00 IGT\)/);
 assert.doesNotMatch(store.answer('!pb Runner'),/7:11 IGT/);
});
