import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runnerArchived} from '../src/runner-visibility.js';
test('runner archive waits for five minutes offline and restores on reconnect',()=>{const p={createdAt:1000,lastSeen:1000};assert.equal(runnerArchived(p,331000),false);assert.equal(runnerArchived(p,331001),true);assert.equal(runnerArchived({...p,lastSeen:331001},331001),false);assert.equal(runnerArchived({...p,source:{type:'therun'}},421000),false);assert.equal(runnerArchived({...p,source:{type:'therun'}},421001),true);assert.equal(runnerArchived({createdAt:1000,lastSeen:null},301001),true);});
