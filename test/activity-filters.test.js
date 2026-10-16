import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterActivity} from '../public/activity-filters.js';
const events=[{id:1,game:'bo2',type:'reset'},{id:2,game:'bo3',type:'split'},{id:3,game:'bo2',type:'pb'},{id:4,game:'bo3',type:'finish'}];
test('activity game and event filters combine without altering source events',()=>{assert.deepEqual(filterActivity(events,'bo2','no-resets').map(e=>e.id),[3]);assert.deepEqual(filterActivity(events,'bo3','all').map(e=>e.id),[2,4]);assert.deepEqual(filterActivity(events,'all','reset').map(e=>e.id),[1]);assert.equal(events.length,4);assert.equal(filterActivity(events,'bo2','finish').length,0);});
test('legacy activity uses timing to distinguish games and all defaults retain resets',()=>{assert.equal(filterActivity(events).length,4);assert.equal(filterActivity([{timing:'GameTime',type:'split'}],'bo2').length,1);assert.equal(filterActivity([{type:'reset'}],'bo3').length,1);});
