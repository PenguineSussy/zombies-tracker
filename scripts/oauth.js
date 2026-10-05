// Interactive operator setup, launched explicitly by the owner. No credentials are printed.
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const provider=process.argv[2];if(!['twitch','youtube'].includes(provider))throw new Error('Usage: node --env-file-if-exists=.env scripts/oauth.js twitch|youtube');
const prefix=provider==='twitch'?'TWITCH':'YOUTUBE';const clientId=process.env[prefix+'_CLIENT_ID'],clientSecret=process.env[prefix+'_CLIENT_SECRET'];
if(!clientId||!clientSecret)throw new Error(`Set ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET in .env first.`);
const state=randomBytes(32).toString('hex'),redirect='http://localhost:8787/callback';
const url=new URL(provider==='twitch'?'https://id.twitch.tv/oauth2/authorize':'https://accounts.google.com/o/oauth2/v2/auth');
for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirect,response_type:'code',state,scope:provider==='twitch'?'user:read:chat user:write:chat':'https://www.googleapis.com/auth/youtube.force-ssl'}))url.searchParams.set(k,v);
if(provider==='youtube'){url.searchParams.set('access_type','offline');url.searchParams.set('prompt','select_account consent');}
let used=false;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');
  const callback=new URL(req.url,'http://localhost:8787');
  if(callback.pathname!=='/callback'){res.writeHead(404);res.end('Not found');return;}
  const received=callback.searchParams.get('state')??'';
  if(used||!/^[a-f0-9]{64}$/.test(received)||!timingSafeEqual(Buffer.from(received),Buffer.from(state))){res.writeHead(400);res.end('Invalid or expired OAuth state.');return;}
  used=true;
  try{
    const code=callback.searchParams.get('code');if(!code)throw new Error('Authorization was not granted.');
    const r=await fetch(provider==='twitch'?'https://id.twitch.tv/oauth2/token':'https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirect}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error(`Token exchange failed (${r.status}).`);
    const data=await r.json();const updates={[prefix+'_ACCESS_TOKEN']:data.access_token};if(data.refresh_token)updates[prefix+'_REFRESH_TOKEN']=data.refresh_token;
    if(provider==='twitch'){
      const identity=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${data.access_token}`},signal:AbortSignal.timeout(10000)});
      if(identity.ok)updates.TWITCH_BOT_USER_ID=(await identity.json()).user_id;
    }else{
      const identity=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers:{Authorization:`Bearer ${data.access_token}`},signal:AbortSignal.timeout(10000)});
      if(identity.ok)updates.YOUTUBE_BOT_CHANNEL_ID=(await identity.json()).items?.[0]?.id;
    }
    let env=existsSync('.env')?readFileSync('.env','utf8'):'';
    for(const [key,value]of Object.entries(updates)){
      if(!value)continue;if(/[\r\n"\\]/.test(value))throw new Error('Unexpected token format.');
      const line=`${key}="${value}"`,pattern=new RegExp('^'+key+'=.*$','m');env=pattern.test(env)?env.replace(pattern,()=>line):env+'\n'+line;
    }
    writeFileSync('.env',env,{mode:0o600});
    // Remove an older rotated-token cache for this provider without exposing its contents.
    const {Store}=await import('../src/store.js');const store=new Store(process.env.DATA_PATH??'data/tracker.sqlite');store.db.prepare('DELETE FROM metadata WHERE id=?').run(provider+'-oauth');store.close();
    res.end(`${provider} authorization saved to the local .env file. Restart the tracker. You can close this tab.`);console.log('Authorization saved locally. Restart the tracker.');
  }catch(error){res.writeHead(400);res.end(error.message);console.error(error.message);}
  finally{server.close();clearTimeout(timeout);}
});
const timeout=setTimeout(()=>{console.error('OAuth setup expired. Run the command again.');server.close();},10*60*1000);
server.listen(8787,'127.0.0.1',()=>console.log(`Open this link and sign in as the account that should post bot replies:\n${url.href}\nWaiting up to 10 minutes. Credentials will be saved locally, not printed.`));
