import {randomBytes,createHash} from 'node:crypto';
import {check} from './domain.js';
export const LOGIN_DURATION=30*24*60*60*1000;
const hash=v=>createHash('sha256').update(v).digest('hex');
const cookieName='monty_session';
const cookieValue=req=>String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
const sessionId=req=>{const value=cookieValue(req);return value&&/^[A-Za-z0-9_-]{43}$/.test(value)?`browser-session:${hash(value)}`:null;};
export function browserCookie(value,env,clear=false){return `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear?0:LOGIN_DURATION/1000}${env.PUBLIC_ORIGIN?.startsWith('https:')?'; Secure':''}`;}
export function clearBrowserSession(store,req){const id=sessionId(req);if(id)store.db.prepare('DELETE FROM metadata WHERE id=?').run(id);}
export function createBrowserSession(store,req,p){
 clearBrowserSession(store,req);
 const now=store.clock();
 for(const s of store.list('metadata'))if(s.kind==='browser-session'&&s.expiresAt<=now)store.db.prepare('DELETE FROM metadata WHERE id=?').run(s.id);
 const value=randomBytes(32).toString('base64url'),id=`browser-session:${hash(value)}`,expiresAt=now+LOGIN_DURATION;
 const keyHash=store.db.prepare('SELECT token FROM players WHERE id=?').get(p.id).token;
 store.put('metadata',id,{id,kind:'browser-session',player:p.id,keyHash,expiresAt});return {value,expiresAt};
}
export function browserSession(store,req){
 const id=sessionId(req),s=id&&store.get('metadata',id);
 if(!s||s.expiresAt<=store.clock()||!store.db.prepare('SELECT id FROM players WHERE id=? AND token=?').get(s.player,s.keyHash)){
  if(s)store.db.prepare('DELETE FROM metadata WHERE id=?').run(id);
  check(false,'Your saved sign-in has expired or is no longer valid. Sign in again with your runner key.',401);
 }
 return {...s,player:store.get('players',s.player)};
}
export function checkBrowserOrigin(req,env){
 // Cookies are accepted only for same-origin browser requests. Bearer-key clients
 // (including the addon) continue to use the existing authentication flow.
 const origin=req.headers.origin;
 if(!['GET','HEAD'].includes(req.method))check(origin&&(origin===(env.PUBLIC_ORIGIN??`http://${req.headers.host}`)),'Request must come from this website.',403);
 check(req.headers['sec-fetch-site']!=='cross-site','Request must come from this website.',403);
}
