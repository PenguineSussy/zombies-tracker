import {replyProfile,duration,lastSeen,achievedDate,replyTiming as timingLabel} from './reply-format.js';
import {recordActivity} from './activity.js';
import {capturePacePB,paceAnswer} from './pace.js';
import {queueAnnouncements} from './announcements.js';
import {splitName,resolveSplits,resolveRecords,displayAttempt} from './split-rules.js';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { check, clean, key, snapshot, profile, profileKey, profileLabel, time, parseCommand, requireEnabledMap } from './domain.js';
import {streamLink} from './streams.js';
import {wrCheckpoint} from './wr-checkpoints.js';

const hash = token => createHash('sha256').update(String(token)).digest('hex');
const decode = row => row ? JSON.parse(row.body) : null;
export class Store {
  constructor(path = ':memory:', clock = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.clock = clock; this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, player TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_player ON attempts(player);
      CREATE TABLE IF NOT EXISTS benchmarks (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(table, id) { return decode(this.db.prepare(`SELECT body FROM ${table} WHERE id=?`).get(id)); }
  put(table, id, body) { this.db.prepare(`INSERT INTO ${table}(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`).run(id, JSON.stringify(body)); }
  list(table) { return this.db.prepare(`SELECT body FROM ${table}`).all().map(decode); }
  savePlayer(p) { this.db.prepare('UPDATE players SET body=? WHERE id=?').run(JSON.stringify(p), p.id); }
  saveAttempt(a) { this.db.prepare('INSERT INTO attempts(id,player,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(a.id, a.player, JSON.stringify(a)); }
  register(name) {
    check(typeof name === 'string' && /^[a-zA-Z0-9_]{3,30}$/.test(name), 'Username must be 3–30 letters, numbers, or underscores.');
    const id = name.toLowerCase(); check(!this.get('players', id), 'Username already registered.', 409);
    const token = randomBytes(32).toString('base64url');
    const p = { id, name, public: true, createdAt: this.clock(), lastSeen: null, sessionId: null, activeAttempt: null, profile: null };
    this.db.prepare('INSERT INTO players(id,token,body) VALUES(?,?,?)').run(id, hash(token), JSON.stringify(p));
    return { player: p, token };
  }
  authenticate(token) {
    check(typeof token === 'string' && token.length >= 32, 'Runner key required.', 401);
    const p = decode(this.db.prepare('SELECT body FROM players WHERE token=?').get(hash(token)));
    check(p, 'Invalid runner key.', 401); return p;
  }
  rotate(p) {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('UPDATE players SET token=? WHERE id=?').run(hash(token), p.id); return token;
  }
  privacy(p, isPublic) { check(typeof isPublic === 'boolean', 'public must be true or false.'); p.public = isPublic; this.savePlayer(p); return p; }
  streams(p, input) {
    check(typeof input.live === 'boolean', 'Choose whether your stream is live.');
    const accounts={};
    for(const provider of ['twitch','youtube']) {
      const values=input[provider+'Accounts']??[input[provider]??'',null,null];
      check(Array.isArray(values)&&values.length<=3,'You can add one main account and two alternates per platform.');
      accounts[provider]=[0,1,2].map(i=>{const value=values[i];check(value==null||(typeof value==='string'&&value.length<=500),'Invalid stream URL.');return streamLink(value,provider);});
      const urls=accounts[provider].filter(Boolean).map(s=>s.url);
      check(new Set(urls).size===urls.length,'Each account must use a different stream link.');
    }
    const [twitch]=accounts.twitch,[youtube]=accounts.youtube;
    check(!input.live||accounts.youtube.some(Boolean),'Add a YouTube broadcast link before marking it live. Twitch is verified automatically.');
    p.streams={twitch,youtube,twitchAccounts:accounts.twitch,youtubeAccounts:accounts.youtube,liveUntil:input.live?this.clock()+12*3600000:null};
    this.savePlayer(p); return p;
  }
  sessionWindow(p) {
    if(!p.sessionId)return p.lastSession??null;
    const attempts=this.attempts(p.id).filter(a=>a.sessionId===p.sessionId&&a.phase!=='NotRunning');
    const lastActivity=Math.max(p.sessionStarted??0,...attempts.map(a=>Math.max(a.activityAt??a.observedAt??a.updatedAt,a.closedAt??0)));
    const expired=this.clock()-lastActivity>2*3600000;
    return {id:p.sessionId,startedAt:p.sessionStarted,endedAt:expired?lastActivity:null,reason:expired?'inactive':null};
  }
  session(p, action) {
    check(['start', 'end'].includes(action), 'Use start or end.');
    const a = p.activeAttempt && this.get('attempts', p.activeAttempt);
    check(!a || !['Running', 'Paused'].includes(a.phase) || this.clock() - p.lastSeen > 30000, 'Reset or finish the active attempt before changing sessions.', 409);
    if(p.sessionId) p.lastSession={id:p.sessionId,startedAt:p.sessionStarted,endedAt:this.clock()};
    p.sessionId = action === 'start' ? randomUUID() : null;
    p.sessionStarted = action === 'start' ? this.clock() : null;
    this.savePlayer(p); return p;
  }
  attempts(player) { return this.db.prepare('SELECT body FROM attempts WHERE player=?').all(player).map(decode).map(displayAttempt); }
  ingest(playerId, raw) {
    const s = snapshot(raw);
    return this.transaction(() => {
      const now = this.clock(), p = this.get('players', playerId);
      check(p, 'Unknown runner.', 404);
      const id = `${p.id}:${s.attemptId}`;
      let a = this.get('attempts', id);
      if (!a) requireEnabledMap(s.profile.map);
      if (a && s.sequence <= a.sequence) return { accepted: false, reason: 'duplicate-or-old' };
      if (a) {
        check(profileKey(a.profile) === profileKey(s.profile) && a.practice === s.practice, 'An attempt cannot change category or practice mode.', 409);
        check(p.activeAttempt === id && !a.closed, 'Attempt already closed; start a new attempt.', 409);
      }
      const window=this.sessionWindow(p);
      if(window?.endedAt!=null&&p.sessionId) {
        p.lastSession=window;p.sessionId=null;p.sessionStarted=null;
      }
      const old = p.activeAttempt && this.get('attempts', p.activeAttempt);
      if (old && old.id !== id) {
        old.closed = true; old.closedAt=window?.reason==='inactive'||old.phase==='Ended'?(old.activityAt??old.observedAt??old.updatedAt):Math.min(now,s.observedAt);
        if (old.phase !== 'Ended' && old.phase !== 'NotRunning') {
          old.resetObserved = s.phase === 'NotRunning' && (s.resetEvent??true); old.phase = 'Reset';
        }
        this.saveAttempt(old);
      }
      if ((!p.sessionId && s.phase !== 'NotRunning' && (!a || (window?.reason==='inactive'&&['Running','Paused'].includes(s.phase)))) || (p.lastSeen && now - p.lastSeen > 2 * 3600000 && !a && s.phase !== 'NotRunning')) {
        if(p.sessionId) p.lastSession={id:p.sessionId,startedAt:p.sessionStarted,endedAt:p.lastSeen};
        p.sessionId = randomUUID(); p.sessionStarted = now;
      }
      const previousAttempt=a;
      const previousSplits = a?.splits ?? [];
      const baseline = this.list('benchmarks').filter(b => profileKey(b.profile) === profileKey(s.profile)).sort((x,y) => y.createdAt - x.createdAt)[0];
      a = { ...s, id, player: p.id, sessionId: p.sessionId ?? a?.sessionId,
        startedAt: a?.startedAt ?? now, updatedAt: now,
        activityAt: s.phase==='Ended'&&a?.phase==='Ended'?(a.activityAt??a.observedAt??a.updatedAt):Math.min(now,s.observedAt),
        benchmark: a ? a.benchmark : baseline ?? null, pacePb: a ? a.pacePb : s.phase==='Ended'?null:capturePacePB(this,p,s,id), closed: false,
        notified: a?.notified ?? [] };
      // A reset ends the old attempt above, then reports an empty idle state in a new ID.
      if (a.phase === 'NotRunning') a.complete = false;
      check(s.observedAt <= now + 60000, 'Runner clock is ahead of server time.');
      p.profile = s.profile; p.activeAttempt = id; p.lastSeen = p.source?.type === 'therun' ? Math.min(now, s.observedAt) : now;
      if(s.addonVersion && (p.source?.type??'direct')==='direct' && s.observedAt >= (p.addon?.reportedAt??0)) p.addon={version:s.addonVersion,reportedAt:Math.min(now,s.observedAt)};
      queueAnnouncements(this,p,a,previousAttempt);
      recordActivity(this,p,a,previousAttempt,old);
      if(s.records && !s.practice) {
        const recordId=`saved-records:${p.id}:${profileKey(s.profile)}`;
        const previous=this.get('metadata',recordId);
        if(!previous || s.observedAt>=previous.observedAt) this.put('metadata',recordId,{...s.records,id:recordId,kind:'saved-records',player:p.id,profile:s.profile,observedAt:s.observedAt});
      }
      delete a.records;
      // Cancel queued alerts for checkpoints removed by undo; don't retract already delivered pings.
      for (const job of this.list('outbox')) {
        if (job.attempt === id && job.status === 'pending' && !a.splits.some(x => x.index === job.split.index && x.ms === job.split.ms)) {
          job.status = 'cancelled'; this.put('outbox', job.id, job);
        }
      }
      if (!a.practice && p.public && !s.suppressAlerts && now - s.observedAt <= 30000) {
        // Alerts match the checkpoint name shown on the site (aliases resolved) or the runner's own split name.
        const resolved = resolveSplits(a.profile, a.splits, { finished: a.phase === 'Ended' && a.complete });
        for (const [i, split] of resolved.entries()) {
          if (previousSplits.some(x => x.index === split.index && x.ms === split.ms)) continue;
          const label = split.displayName ?? split.name;
          for (const sub of this.list('subscriptions')) {
            if (!sub.enabled || (sub.player !== '*' && sub.player !== p.id) || profileKey(sub.profile) !== profileKey(a.profile) || (sub.split !== split.name && sub.split !== a.splits[i].name)) continue;
            const confirmed = wrCheckpoint(this, a.profile, split.manualName ?? split.originalName ?? split.name);
            const ref = confirmed?.ms ?? a.benchmark?.splits[split.name] ?? a.benchmark?.splits[a.splits[i].name];
            const precision = confirmed?.precisionMs ?? 1, actual = Math.round(split.ms / precision) * precision;
            const qualifies = sub.mode === 'milestone' || (sub.mode === 'under' && split.ms <= sub.thresholdMs) || (sub.mode === 'wr' && ref != null && actual < ref);
            const dedup = `${sub.id}:${split.index}`;
            if (!qualifies || a.notified.includes(dedup)) continue;
            a.notified.push(dedup);
            const jobId = `${a.id}:${dedup}`;
            const comparison = ref == null ? 'WR checkpoint comparison unavailable.' : `${precision === 1000 ? '~' : ''}${time(Math.abs(ref - actual))} ${actual < ref ? 'ahead of' : actual > ref ? 'behind' : 'level with'} WR`;
            this.put('outbox', jobId, { id: jobId, attempt: id, player: p.id, subscription: sub.id,
              split, channel: sub.channel, role: sub.role, status: 'pending', tries: 0, nextTry: now, createdAt: now,
              content: `${p.name} | ${profileLabel(a.profile)}\n${label}: ${time(split.ms)}\n${comparison}${!confirmed && a.benchmark ? '\nBenchmark source: ' + a.benchmark.source : ''}` });
          }
        }
      }
      this.saveAttempt(a); this.savePlayer(p);
      return { accepted: true, sessionId: p.sessionId, attemptId: id };
    });
  }
  view(id) {
    const p = this.get('players', String(id).replace(/^@/, '').toLowerCase());
    check(p, 'Player has not registered.', 404);
    if (!p.public) return { id: p.id, name: p.name, private: true };
    const a = p.activeAttempt ? displayAttempt(this.get('attempts', p.activeAttempt)) : null;
    if(a?.current) {
      const saved=this.savedRecords(p)?.splits.find(s=>(s.originalName??s.name).toLowerCase()===a.current.toLowerCase());
      if(saved?.displayName)a.current=saved.displayName;
    }
    return { ...p, status: !p.lastSeen || this.clock() - p.lastSeen > (p.source?.type === 'therun' ? 120000 : 30000) ? 'offline' : a?.phase ?? 'NotRunning', attempt: a };
  }
  best(p, split, scope, selectedProfile = p.profile) {
    if (!selectedProfile) return null;
    const candidates = this.attempts(p.id).filter(a => !a.practice && profileKey(a.profile) === profileKey(selectedProfile) && (scope === 'alltime' || a.sessionId === p.sessionId));
    const requested=key(split);
    split=splitName(selectedProfile,split);
    const matches=s=>s.name===key(split)||key(s.originalName??s.displayName??s.name)===requested;
    const saved=scope==='alltime'?this.savedRecords(p,selectedProfile)?.splits.find(matches):null;
    const rows=candidates.flatMap(a=>a.splits.filter(matches).map(s=>({...s,attemptId:a.id,at:a.updatedAt})));
    const segments=[];
    for(const a of candidates)for(const s of a.splits.filter(matches)) {
      const previous=a.splits.find(v=>v.index===s.index-1);
      const expected=saved && this.savedRecords(p,selectedProfile).splits[saved.index-1]?.name;
      if(saved && (s.index===0)!==(saved.index===0))continue;
      if(saved && s.index>0 && previous?.name!==expected)continue;
      if(s.index===0)segments.push(s.ms);
      else if(previous)segments.push(s.ms-previous.ms);
    }
    if(saved?.bestSplitMs!=null)rows.push({...saved,ms:saved.bestSplitMs});
    if(saved?.bestSegmentMs!=null)segments.push(saved.bestSegmentMs);
    const best=rows.sort((a,b)=>a.ms-b.ms)[0];
    return best||saved ? {...(best??saved),ms:best?.ms??null,displayName:saved?.displayName??best?.displayName??best?.name,bestSegmentMs:segments.length?Math.min(...segments):null}:null;
  }
  savedRecords(p,selected=p.profile){const records=selected?this.get('metadata',`saved-records:${p.id}:${profileKey(selected)}`):null;return records?{...records,splits:resolveRecords(selected,records.splits)}:null;}
  sessionStats(p, selected=p.profile) {
    const session=this.sessionWindow(p);
    if(!session) return null;
    const attempts=this.attempts(p.id).filter(a=>a.sessionId===session.id && a.phase!=='NotRunning');
    const active=p.activeAttempt&&this.get('attempts',p.activeAttempt);
    const status=this.view(p.id).status;
    const current=session.endedAt==null && active?.sessionId===session.id && ['Running','Paused'].includes(status)?active.profile:null;
    const groups=new Map();
    for(const a of attempts) {
      const id=profileKey(a.profile);
      if(!groups.has(id)) groups.set(id,{profile:a.profile,label:profileLabel(a.profile),attempts:0,resets:0,finishes:0,fastestMs:null,durationMs:0,furthest:null,splits:new Map()});
      const group=groups.get(id); group.attempts++;
      group.durationMs+=Math.max(0,Math.min(a.closedAt??a.activityAt??a.observedAt??a.updatedAt,session.endedAt??this.clock())-a.startedAt);
      if(a.resetObserved===true)group.resets++;
      if(a.practice)continue;
      if(a.phase==='Ended' && a.complete){group.finishes++;group.fastestMs=Math.min(group.fastestMs??Infinity,a.elapsedMs);}
      for(const split of a.splits) {
        if(!group.furthest||split.index>group.furthest.index)group.furthest={index:split.index,name:split.displayName??split.name};
        const stats=group.splits.get(split.name)??{name:split.displayName??split.name,count:0,totalMs:0,bestMs:Infinity};
        stats.count++;stats.totalMs+=split.ms;stats.bestMs=Math.min(stats.bestMs,split.ms);group.splits.set(split.name,stats);
      }
    }
    return {...session,active:session.endedAt==null,durationMs:Math.max(0,(session.endedAt??this.clock())-session.startedAt),current,
      attempts:attempts.length,resets:attempts.filter(a=>a.resetObserved===true).length,
      unconfirmedEnds:attempts.filter(a=>a.phase==='Reset'&&a.resetObserved!==true).length,
      groups:[...groups.values()].map(g=>{const isCurrentProfile=selected&&profileKey(g.profile)===profileKey(selected);return {...g,isCurrentProfile,fastestMs:isCurrentProfile?g.fastestMs:null,furthest:isCurrentProfile?g.furthest:null,splits:isCurrentProfile?[...g.splits.values()].map(({totalMs,...s})=>({...s,averageMs:Math.round(totalMs/s.count)})):[]};})};
  }
  sessionAnswer(p, compact=false, selected=null) {
    const s=this.sessionStats(p,selected??p.profile);
    if(!s)return `${p.name}: No recorded session.`;
    const group=s.groups.find(g=>g.isCurrentProfile);
    const summary=`${p.name} | ${s.active?'Session':'Last session'}: ${duration(s.durationMs)} · ${s.attempts} attempts · ${s.resets} resets`;
    const lines=[summary,...(selected?[`Selected: ${replyProfile(selected)}`]:[]),s.current?`Playing: ${replyProfile(s.current)}`:'No active tracked run',`Fastest finish: ${time(group?.fastestMs)}`];
    const splitRows=group?.splits??[];
    lines.push(...(compact?splitRows.slice(0,1):splitRows).map(v=>`${v.name}: average ${time(v.averageMs)}, best ${time(v.bestMs)}`));
    if(!compact){
      for(const g of s.groups.filter(g=>!g.isCurrentProfile))lines.push(`Previously: ${replyProfile(g.profile)} · ${g.resets} resets · ${duration(g.durationMs)} tracked`);
      if(s.unconfirmedEnds)lines.push(`${s.unconfirmedEnds} unconfirmed endings excluded from resets`);
    }
    return lines.join(' | ');
  }
  answer(input) {
    const q=typeof input==='string'?parseCommand(input,undefined,this.list('players').map(p=>p.id)):input;
    const reply=this.answerCore(q);
    if(!q?.player||q.error||!['current','best','splits','pace','session'].includes(q.command))return reply;
    try {
      const p=this.view(q.player);if(p.private)return reply;
      const selected=q.profile?profile(q.profile):p.profile;
      if(q.profile&&['current','pace'].includes(q.command)&&profileKey(selected)!==profileKey(p.profile))return reply;
      let rows=[];
      if(q.command==='best'){const b=this.best(p,q.split,q.scope,selected);if(b)rows=[b];}
      else if(q.command==='splits'&&q.scope==='alltime')rows=this.savedRecords(p,selected)?.splits??[];
      else if(q.command==='session'||(q.command==='splits'&&q.scopeExplicit))rows=this.attempts(p.id).filter(a=>a.sessionId===this.sessionWindow(p)?.id&&profileKey(a.profile)===profileKey(selected)).flatMap(a=>a.splits);
      else if(p.status!=='offline')rows=q.command==='pace'?p.attempt?.splits.slice(-1)??[]:p.attempt?.splits??[];
      return rows.some(r=>r.needsAlias)?'Split not recognized. Set its alias in LiveSplit → Zombies Tracker → Split aliases. | '+reply:reply;
    } catch {return reply;}
  }
  answerCore(input) {
    const q = typeof input === 'string' ? parseCommand(input,undefined,this.list('players').map(p=>p.id)) : input;
    if (!q) return null;
    if (q.command === 'help') return 'Commands: !current · !pb map · !wr map [category] · !best split session/alltime · !splits [alltime] · !pace · !session · !sessionpb. In linked chats, omit @name for that runner; add name or @name for anyone else. On the site, include a runner name. Add a map and optional category to select saved stats; otherwise the detected profile is used. Map PB/WR defaults to Mega Gums for BO3.';
    try {
      if(q.error)return q.error;
      if(q.command!=='wr'&&!q.player)return 'This chat is not linked to a runner. Add @runner to your command, or connect your channel on the Chatbot page.';
      if(q.command==='wr') {
        if(q.error) return q.error;
        const owner=!q.profile&&q.player?this.view(q.player):null;
        if(owner?.private)return `${owner.name} isn't sharing tracking data.`;
        const selected=profile(q.profile??owner?.profile);
        requireEnabledMap(selected.map);
        const wr=this.get('metadata',`zwr:${profileKey(selected)}`);
        return `${replyProfile(selected)} | ${wr?.ms!=null?`SOLO WR: ${time(wr.ms)} ${timingLabel(selected)} — ${wr.holder} | Achieved: ${achievedDate(wr.achievedDate)}`:'Solo WR unavailable for this category.'}`;
      }
      const p = this.view(q.player);
      if (p.private) return `${p.name} isn't sharing tracking data.`;
      const selected=q.profile?profile(q.profile):p.profile;
      if(q.profile)requireEnabledMap(selected.map);
      const matches=!selected||!p.profile||profileKey(selected)===profileKey(p.profile);
      if(!matches&&['current','pace'].includes(q.command))return `${p.name} | ${replyProfile(selected)} | No current run for this map and category. Playing: ${replyProfile(p.profile)}`;
      const a = matches?p.attempt:null, label = replyProfile(selected);
      const last = a?.splits.at(-1);
      if (q.command === 'current') {
        if (p.status === 'offline') return `${p.name}'s tracker is offline.${p.lastSeen?' Last connected '+lastSeen(p.lastSeen,this.clock())+'.':''}${p.source?.type==='therun'?' No recent therun.gg update; playing status unknown.':''}`;
        if (!a || a.phase === 'NotRunning') return `${p.name} is connected and waiting to start a run.`;
        return `${p.name} | ${label} | ${a.phase==='Ended'?'Finished':a.phase==='Paused'?'Paused':p.source?.type==='therun'?'Last reported timer':'Running'}: ${time(a.elapsedMs)} ${timingLabel(p.profile)}${last?' | Last split: '+(last.displayName??last.name)+' — '+time(last.ms):''}${a.current&&a.phase!=='Ended'?' | Next: '+a.current:''} | Resets: ${this.sessionStats(p)?.groups.find(g=>g.isCurrentProfile)?.resets??0}${a.practice?' | Practice attempt':''}`;
      }
      if (q.command === 'best') {
        check(q.split, 'Specify a split, e.g. !best @player bow session.');
        const selected = q.profile ? profile(q.profile) : p.profile;
        const b = this.best(p, q.split, q.scope, selected);
        return `${p.name} | ${selected ? replyProfile(selected) : label} | ${q.scope === 'alltime' ? 'All-time' : 'Session'} best ${b?.displayName??clean(q.split)}: ${b?.ms!=null ? time(b.ms) : 'unavailable'} (${time(b?.bestSegmentMs)} segment) ${timingLabel(selected??p.profile)}`;
      }
      if(q.command==='splits'&&q.scope==='alltime') {
        const names=new Set([...(this.savedRecords(p,selected)?.splits.map(s=>s.name)??[]),...this.attempts(p.id).filter(a=>!a.practice&&profileKey(a.profile)===profileKey(selected)).flatMap(a=>a.splits.map(s=>s.name))]);
        const rows=[...names].map(name=>this.best(p,name,'alltime',selected)).filter(Boolean);
        return p.name+' | '+label+' | All-time bests (split/segment): '+(rows.map(b=>(b.displayName??b.name)+' — '+time(b.ms)+' ('+time(b.bestSegmentMs)+')').join(' · ')||'unavailable');
      }
      if(q.command==='splits'&&q.scope==='session'&&(q.scopeExplicit||q.profile)) {
        const group=this.sessionStats(p,selected)?.groups.find(g=>g.isCurrentProfile);
        return `${p.name} | ${label} | Session bests (split/segment): `+(group?.splits.map(s=>{const b=this.best(p,s.name,'session',selected);return `${b?.displayName??s.name} — ${time(b?.ms)} (${time(b?.bestSegmentMs)})`;}).join(' · ')||'unavailable');
      }
      if(q.command==='splits'&&!matches)return `${p.name} | ${label} | No current run for this map and category. Use !splits ${p.id} ${selected.map} alltime for saved bests.`;
      if (q.command === 'splits') return `${p.name} | ${label} | Current run: ${a?.splits.length ? a.splits.map(s => (s.displayName??s.name) + ' — ' + time(s.ms)).join(' · ') : 'No checkpoints recorded.'}${a && !a.complete ? ' Partial history.' : ''}`;
      if (q.command === 'pace') return paceAnswer(this,p);
      if (q.command === 'session') {
        return this.sessionAnswer(p,false,q.profile?selected:null);
      }
      if(q.command==='sessionpb') {
        const group=this.sessionStats(p,selected)?.groups.find(g=>g.isCurrentProfile);
        return `${p.name} | ${label} | Session PB: ${time(group?.fastestMs)} ${timingLabel(selected)}`;
      }
      if (q.command === 'pb') {
        const selected=q.profile?profile(q.profile):p.profile;
        if(q.profile)requireEnabledMap(selected.map);
        if(!selected)return `${p.name}: PB unavailable; no run profile selected. Use !pb @${p.id} DE.`;
        const best = this.attempts(p.id).filter(a => a.phase === 'Ended' && a.complete && !a.practice && profileKey(a.profile) === profileKey(selected)).sort((a,b) => a.elapsedMs - b.elapsedMs)[0];
        const saved=this.savedRecords(p,selected)?.pbMs;
        const fromSaved=saved!=null && (!best || saved<=best.elapsedMs);
        return `${p.name} | ${replyProfile(selected)} | PB: ${fromSaved?time(saved):best?time(best.elapsedMs):'unavailable'} ${timingLabel(selected)}`;
      }
      return 'Unknown command.';
    } catch (error) { if (error.status) return error.message; throw error; }
  }
  benchmark(input) {
    const p = profile(input.profile), splits = {};
    check(input.splits && typeof input.splits === 'object' && !Array.isArray(input.splits), 'Checkpoint times required.');
    for (const [name, ms] of Object.entries(input.splits)) { check(Number.isSafeInteger(ms) && ms >= 0 && ms <= 604800000, 'Invalid benchmark time.'); splits[key(name)] = ms; }
    check(Object.keys(splits).length > 0 && Object.keys(splits).length <= 500, 'Supply 1–500 checkpoints.');
    let source; try { source = new URL(input.source); } catch { check(false, 'Benchmark source URL required.'); }
    check(source.protocol === 'https:' && !source.username && !source.password, 'Use an HTTPS source URL.');
    const b = { id: randomUUID(), profile: p, splits, source: source.href, holder: clean(input.holder), verifiedDate: clean(input.verifiedDate), createdAt: this.clock() };
    this.put('benchmarks', b.id, b); return b;
  }
  subscribe(input) {
    check(/^\d{5,25}$/.test(input.guild) && /^\d{5,25}$/.test(input.channel), 'Discord guild and channel IDs required.');
    check(!input.role || /^\d{5,25}$/.test(input.role), 'Invalid role ID.');
    check(input.player === '*' || /^[a-z0-9_]{3,30}$/.test(input.player), 'Invalid player.');
    check(['wr', 'under', 'milestone'].includes(input.mode), 'Choose wr, under, or milestone.');
    if (input.mode === 'under') check(Number.isSafeInteger(input.thresholdMs) && input.thresholdMs >= 0, 'Threshold in milliseconds required.');
    const selected = profile(input.profile);
    const sub = { id: randomUUID(), profile: selected, guild: input.guild, channel: input.channel,
      role: input.role || null, player: input.player, split: key(splitName(selected, input.split)), mode: input.mode,
      thresholdMs: input.thresholdMs ?? null, enabled: true };
    this.put('subscriptions', sub.id, sub); return sub;
  }
  removePlayer(p) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM attempts WHERE player=?').run(p.id);
      for (const job of this.list('outbox')) if (job.player === p.id) this.db.prepare('DELETE FROM outbox WHERE id=?').run(job.id);
      for (const sub of this.list('subscriptions')) if (sub.player === p.id) this.db.prepare('DELETE FROM subscriptions WHERE id=?').run(sub.id);
      this.db.prepare('DELETE FROM players WHERE id=?').run(p.id);
      for(const row of this.list('metadata'))if(['saved-records','chat-announcement','browser-session','discord-recovery','discord-session'].includes(row.kind)&&row.player===p.id)this.db.prepare('DELETE FROM metadata WHERE id=?').run(row.id);
    });
  }
}
