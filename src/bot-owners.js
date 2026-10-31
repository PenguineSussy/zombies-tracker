import {randomBytes,createHash} from 'node:crypto';
import {check} from './domain.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const duration=30*24*60*60;
export function botOwner(store,req,env,res){
 const value=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('monty_bot='))?.slice(10);
 const saved=value&&store.get('metadata','bot-owner:'+hash(value));
 if(saved?.kind==='bot-owner'&&saved.expires>store.clock())return {id:saved.id,botOnly:true};
 const secret=randomBytes(32).toString('base64url'),id='bot-owner:'+hash(secret);
 store.put('metadata',id,{id,kind:'bot-owner',keyHash:hash(randomBytes(32)),expires:store.clock()+duration*1000});
 res.setHeader('Set-Cookie',`monty_bot=${secret}; HttpOnly; SameSite=Lax; Path=/api/me/; Max-Age=${duration}${env.PUBLIC_ORIGIN?.startsWith('https:')?'; Secure':''}`);
 return {id,botOnly:true};
}
export function ownerKey(store,id){
 if(id?.startsWith('bot-owner:')){const o=store.get('metadata',id);return o?.kind==='bot-owner'&&o.expires>store.clock()?o.keyHash:null;}
 return store.db.prepare('SELECT token FROM players WHERE id=?').get(id)?.token;
}
export function checkOwner(store,id,key){check(key&&ownerKey(store,id)===key,'Your sign-in changed or expired. Connect again.',401);}
export function connectionOwnerExists(store,id){return !!store.get('players',id)||store.get('metadata',id)?.kind==='bot-owner';}

// End browser management access without removing installed bots or their settings.
export function forgetBotOwner(store,req,env,res){
 const value=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('monty_bot='))?.slice(10);
 const id=value&&'bot-owner:'+hash(value),owner=id&&store.get('metadata',id);
 if(owner?.kind==='bot-owner')store.put('metadata',id,{...owner,expires:0});
 res.setHeader('Set-Cookie',`monty_bot=; HttpOnly; SameSite=Lax; Path=/api/me/; Max-Age=0${env.PUBLIC_ORIGIN?.startsWith('https:')?'; Secure':''}`);
}
