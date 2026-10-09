import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupDiscord} from '../public/discord-panel.js';
test('Discord form retains channel and role after saving and isolates each server',async t=>{
 class Element {
  constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.value='';this.textContent='';this.hidden=false;this.options=[];}
  addEventListener(name,fn){this.events[name]=fn;}setAttribute(){}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;if(this.tagName==='SELECT'){this.options=children;this.value=children[0]?.value??'';}}
  async fire(type='click'){await this.events[type]?.({preventDefault(){},currentTarget:this});}
 }
 const ids=['map','category','split','custom-label','custom','role','channel','guild','runner','mode','threshold','threshold-label','alert-form','alerts','invite','connect','disconnect','refresh','controls','server-controls','server-invite','server-note','status','recovery-note','recovery-disable'];
 const selects=['map','category','split','role','channel','guild','mode'];const elements=Object.fromEntries(ids.map(id=>[id,new Element(selects.includes(id)?'SELECT':'DIV')]));
 const memory=new Map(),oldDoc=globalThis.document,oldStorage=globalThis.localStorage;
 globalThis.document={getElementById:id=>elements[id.replace('discord-','')],createElement:tag=>new Element(tag)};
 globalThis.localStorage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
 t.after(()=>{globalThis.document=oldDoc;globalThis.localStorage=oldStorage;});
 let saved;
 const api=async(path,options={})=>{
  if(path==='/api/me/discord')return {available:true,connected:true,name:'Example'};
  if(path==='/api/me/discord/guilds')return ['11111','77777'].map(id=>({id,name:id,installed:true}));
  if(options.method==='POST'){saved=options.body;return {};}
  const other=path.endsWith('77777');return {channels:other?[{id:'88888',name:'other',roleIds:['99999']}]:[{id:'22222',name:'first',roleIds:['33333']},{id:'66666',name:'second',roleIds:['33333']}],roles:[{id:other?'99999':'33333',name:'Alerts'}],alerts:[]};
 };
 const panel=setupDiscord({api,notice:message=>{if(/error/i.test(message))throw Error(message)},player:()=>({id:'runner'}),catalog:()=>({maps:[{id:'de',name:'DE'},{id:'soe',name:'SOE'}],categoriesByMap:{de:['Mega Gums'],soe:['Mega Gums']},checkpointsByMap:{de:['Bow','Rocket'],soe:['Rift','Sword']}})});
 await panel.refresh();assert.equal(elements.runner.value,'*');assert.deepEqual(elements.split.options.map(o=>o.value),['Bow','Rocket','__custom']);
 elements.guild.value='11111';await elements.guild.fire('change');elements.channel.value='66666';await elements.channel.fire('change');elements.role.value='33333';await elements.role.fire('change');
 elements.runner.value='Runner, Second';elements.mode.value='milestone';await elements['alert-form'].fire('submit');assert.equal(saved.player,'Runner, Second');assert.equal(elements.channel.value,'66666');assert.equal(elements.role.value,'33333');
 elements.guild.value='77777';await elements.guild.fire('change');assert.equal(elements.channel.value,'88888');assert.equal(elements.role.value,'');
 elements.guild.value='11111';await elements.guild.fire('change');assert.equal(elements.channel.value,'66666');assert.equal(elements.role.value,'33333');
 elements.map.value='soe';await elements.map.fire('change');assert.deepEqual(elements.split.options.map(o=>o.value),['Rift','Sword','__custom']);
 await panel.refresh();assert.equal(elements.channel.value,'66666');assert.equal(elements.role.value,'33333');
});
