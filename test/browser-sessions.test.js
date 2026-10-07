import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {createApp} from '../src/server.js';
import {LOGIN_DURATION,browserCookie} from '../src/browser-sessions.js';
async function fixture(t){let now=1700000000000;const store=new Store(':memory:',()=>now),app=createApp({store});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.stop();store.close();});const base=`http://127.0.0.1:${app.server.address().port}`,runner=store.register('Runner');const request=(path,options={})=>fetch(base+path,options);const login=()=>request('/api/login',{method:'POST',headers:{Origin:base,Authorization:`Bearer ${runner.token}`}});return {store,app,base,runner,request,login,advance:ms=>now+=ms,now:()=>now};}
test('browser login uses an HttpOnly cookie, survives new requests, and expires at 30 days without sliding',async t=>{
 const f=await fixture(t),r=await f.login();assert.equal(r.status,200);const data=await r.json(),cookie=r.headers.get('set-cookie');assert.equal(data.expiresAt,f.now()+LOGIN_DURATION);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Max-Age=2592000/);assert.ok(!cookie.includes(f.runner.token));assert.ok(!JSON.stringify(f.store.list('metadata')).includes(f.runner.token));
 const headers={Cookie:cookie.split(';')[0]};let me=await f.request('/api/me',{headers});assert.equal(me.status,200);assert.equal((await me.json()).loginExpiresAt,data.expiresAt);
 f.advance(LOGIN_DURATION-1);me=await f.request('/api/me',{headers});assert.equal(me.status,200);assert.equal((await me.json()).loginExpiresAt,data.expiresAt);
 f.advance(1);assert.equal((await f.request('/api/me',{headers})).status,401);
 assert.equal((await f.request('/api/me',{headers:{Authorization:`Bearer ${f.runner.token}`}})).status,200);
 assert.match(browserCookie('example',{PUBLIC_ORIGIN:'https://doctormonty.beer'}),/; Secure$/);
});
test('saved sessions reject cross-site writes and logout invalidates the session without revoking the runner key',async t=>{
 const f=await fixture(t);const r=await f.login(),cookie=r.headers.get('set-cookie').split(';')[0];
 for(const origin of ['https://evil.example',null]){const result=await f.request('/api/me/privacy',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:'{"public":false}'});assert.equal(result.status,403);}
 assert.equal((await f.request('/api/me/privacy',{method:'POST',headers:{Cookie:cookie,Origin:f.base,'Content-Type':'application/json'},body:'{"public":false}'})).status,200);
 const out=await f.request('/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:f.base}});assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await f.request('/api/me',{headers:{Cookie:cookie}})).status,401);assert.equal(f.store.authenticate(f.runner.token).id,'runner');
});
test('rotation and deletion invalidate saved browser sessions; separate browser sessions remain independent',async t=>{
 const f=await fixture(t);const a=await f.login(),b=await f.login(),cookieA=a.headers.get('set-cookie').split(';')[0],cookieB=b.headers.get('set-cookie').split(';')[0];
 await f.request('/api/logout',{method:'POST',headers:{Cookie:cookieA,Origin:f.base}});assert.equal((await f.request('/api/me',{headers:{Cookie:cookieB}})).status,200);
 f.store.rotate(f.runner.player);assert.equal((await f.request('/api/me',{headers:{Cookie:cookieB}})).status,401);
 f.store.removePlayer(f.runner.player);assert.equal(f.store.list('metadata').filter(v=>v.kind==='browser-session').length,0);
});
