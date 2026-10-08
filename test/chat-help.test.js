import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {ChatResponder} from '../src/chat.js';
test('chat help uses the concise text without changing website help',t=>{
 const store=new Store(':memory:');t.after(()=>store.close());
 const expected='Commands: !current · !pb map · !wr map [category] · !best split session/alltime · !splits [alltime] · !pace · !session · !sessionpb · add player name to specify player';
 for(const [provider,limit] of [['twitch',450],['youtube',190]]){
  const reply=new ChatResponder(store,limit,Date.now,()=>15,provider).respond('channel','viewer','help','!help');
  assert.equal(reply,expected);assert.ok(reply.length<=limit);
 }
 assert.match(store.answer('!help'),/On the site, include a runner name/);
});
