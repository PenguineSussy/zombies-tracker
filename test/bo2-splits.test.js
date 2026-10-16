import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitName,resolveSplits} from '../src/split-rules.js';
import {bo2Splits} from '../src/bo2-splits.js';
test('T6 Solo aliases follow the correct TranZit side and preserve BO3 Origins',()=>{
 const p=category=>({map:'bo2-tranzit',category});
 for(const category of ['Bank Richtofen','No Bank Richtofen'])assert.deepEqual(bo2Splits(p(category)).map(s=>s.name),['Jetgun','Tower','End']);
 for(const category of ['Bank Maxis','No Bank Maxis'])assert.deepEqual(bo2Splits(p(category)).map(s=>s.name),['Power off','End']);
 assert.equal(splitName(p('Bank Maxis'),'Jetgun/Power off'),'Power off');
 assert.equal(splitName(p('No Bank Richtofen'),'End'),'End');
 assert.equal(splitName({map:'bo2-mob-of-the-dead'},'Plane II'),'Fly 2');
 assert.equal(splitName({map:'bo2-origins'},'Staff IV'),'Staff 4');
 assert.equal(splitName({map:'bo2-origins'},'AFD'),'Ascend from Darkness');
 assert.equal(splitName({map:'origins',category:'Mega Gums'},'AFD'),'AFD');
 const raw=resolveSplits({map:'bo2-origins',category:'Standard'},[{index:0,name:'My unknown split',ms:100000}]);
 assert.equal(raw[0].name,'My unknown split');
});

test('BO2 final labels and old flight labels remain compatible',()=>{
 for(const [map,old] of [['bo2-die-rise','High Maintenance'],['bo2-buried','Sharpshooter'],['bo2-mob-of-the-dead','Headphones'],['bo2-origins','Freedom']])assert.equal(splitName({map},old),'End');
 assert.equal(splitName({map:'bo2-mob-of-the-dead'},'Flight 3'),'Fly 3');
});
