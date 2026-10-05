import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { check, clean, key, snapshot, profile, profileKey, profileLabel, time, parseCommand, requireEnabledMap } from './domain.js';
import {streamLink} from './streams.js';

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
    for (const value of [input.twitch,input.youtube]) check(value == null || (typeof value === 'string' && value.length <= 500), 'Invalid stream URL.');
    const twitch=streamLink(input.twitch,'twitch'), youtube=streamLink(input.youtube,'youtube');
    check(!input.live || youtube, 'Add a YouTube broadcast link before marking it live. Twitch is verified automatically.');
    p.streams={twitch,youtube,liveUntil:input.live?this.clock()+12*3600000:null};
    this.savePlayer(p); return p;
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
  attempts(player) { return this.db.prepare('SELECT body FROM attempts WHERE player=?').all(player).map(decode); }
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
      const old = p.activeAttempt && this.get('attempts', p.activeAttempt);
      if (old && old.id !== id) {
        old.closed = true;
        if (old.phase !== 'Ended' && old.phase !== 'NotRunning') {
          old.resetObserved = s.phase === 'NotRunning'; old.phase = 'Reset';
        }
        this.saveAttempt(old);
      }
      if ((!p.sessionId && !a && s.phase !== 'NotRunning') || (p.lastSeen && now - p.lastSeen > 2 * 3600000 && !a && s.phase !== 'NotRunning')) {
        if(p.sessionId) p.lastSession={id:p.sessionId,startedAt:p.sessionStarted,endedAt:p.lastSeen};
        p.sessionId = randomUUID(); p.sessionStarted = now;
      }
      const previousSplits = a?.splits ?? [];
      const baseline = this.list('benchmarks').filter(b => profileKey(b.profile) === profileKey(s.profile)).sort((x,y) => y.createdAt - x.createdAt)[0];
      a = { ...s, id, player: p.id, sessionId: a?.sessionId ?? p.sessionId,
        startedAt: a?.startedAt ?? now, updatedAt: now,
        benchmark: a ? a.benchmark : baseline ?? null, closed: false,
        notified: a?.notified ?? [] };
      // A reset ends the old attempt above, then reports an empty idle state in a new ID.
      if (a.phase === 'NotRunning') a.complete = false;
      check(s.observedAt <= now + 60000, 'Runner clock is ahead of server time.');
      p.profile = s.profile; p.activeAttempt = id; p.lastSeen = Math.min(now, s.observedAt);
      // Cancel queued alerts for checkpoints removed by undo; don't retract already delivered pings.
      for (const job of this.list('outbox')) {
        if (job.attempt === id && job.status === 'pending' && !a.splits.some(x => x.index === job.split.index && x.ms === job.split.ms)) {
          job.status = 'cancelled'; this.put('outbox', job.id, job);
        }
      }
      if (!a.practice && p.public && !s.suppressAlerts && now - s.observedAt <= 30000) {
        for (const split of a.splits) {
          if (previousSplits.some(x => x.index === split.index && x.ms === split.ms)) continue;
          for (const sub of this.list('subscriptions')) {
            if (!sub.enabled || (sub.player !== '*' && sub.player !== p.id) || profileKey(sub.profile) !== profileKey(a.profile) || sub.split !== split.name) continue;
            const ref = a.benchmark?.splits[split.name];
            const qualifies = sub.mode === 'milestone' || (sub.mode === 'under' && split.ms <= sub.thresholdMs) || (sub.mode === 'wr' && ref != null && split.ms < ref);
            const dedup = `${sub.id}:${split.index}`;
            if (!qualifies || a.notified.includes(dedup)) continue;
            a.notified.push(dedup);
            const jobId = `${a.id}:${dedup}`;
            const comparison = ref == null ? 'WR checkpoint comparison unavailable.' : `${time(Math.abs(ref - split.ms))} ${split.ms < ref ? 'ahead of' : split.ms > ref ? 'behind' : 'level with'} the configured WR checkpoint.`;
            this.put('outbox', jobId, { id: jobId, attempt: id, player: p.id, subscription: sub.id,
              split, channel: sub.channel, role: sub.role, status: 'pending', tries: 0, nextTry: now, createdAt: now,
              content: `${p.name} | ${profileLabel(a.profile)}\n${split.name}: ${time(split.ms)}\n${comparison}\nSelf-reported timer data.${a.benchmark ? '\nBenchmark source: ' + a.benchmark.source : ''}` });
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
    const a = p.activeAttempt ? this.get('attempts', p.activeAttempt) : null;
    return { ...p, status: !p.lastSeen || this.clock() - p.lastSeen > (p.source?.type === 'therun' ? 120000 : 30000) ? 'offline' : a?.phase ?? 'NotRunning', attempt: a };
  }
  best(p, split, scope, selectedProfile = p.profile) {
    if (!selectedProfile) return null;
    const candidates = this.attempts(p.id).filter(a => !a.practice && profileKey(a.profile) === profileKey(selectedProfile) && (scope === 'alltime' || a.sessionId === p.sessionId));
    return candidates.flatMap(a => a.splits.filter(s => s.name === key(split)).map(s => ({ ...s, attemptId: a.id, at: a.updatedAt }))).sort((a,b) => a.ms - b.ms)[0] ?? null;
  }
  sessionStats(p) {
    const session=p.sessionId?{id:p.sessionId,startedAt:p.sessionStarted,endedAt:null}:p.lastSession;
    if(!session) return null;
    const attempts=this.attempts(p.id).filter(a=>a.sessionId===session.id && a.phase!=='NotRunning');
    const active=p.activeAttempt&&this.get('attempts',p.activeAttempt);
    const status=this.view(p.id).status;
    const current=active?.sessionId===session.id && ['Running','Paused'].includes(status)?active.profile:null;
    const groups=new Map();
    for(const a of attempts) {
      const id=profileKey(a.profile);
      if(!groups.has(id)) groups.set(id,{profile:a.profile,label:profileLabel(a.profile),attempts:0,resets:0,finishes:0,fastestMs:null,splits:new Map()});
      const group=groups.get(id); group.attempts++;
      if(a.resetObserved===true)group.resets++;
      if(a.practice)continue;
      if(a.phase==='Ended' && a.complete){group.finishes++;group.fastestMs=Math.min(group.fastestMs??Infinity,a.elapsedMs);}
      for(const split of a.splits) {
        const stats=group.splits.get(split.name)??{name:split.name,count:0,totalMs:0,bestMs:Infinity};
        stats.count++;stats.totalMs+=split.ms;stats.bestMs=Math.min(stats.bestMs,split.ms);group.splits.set(split.name,stats);
      }
    }
    return {...session,active:!!p.sessionId,durationMs:Math.max(0,(session.endedAt??this.clock())-session.startedAt),current,
      attempts:attempts.length,resets:attempts.filter(a=>a.resetObserved===true).length,
      unconfirmedEnds:attempts.filter(a=>a.phase==='Reset'&&a.resetObserved!==true).length,
      groups:[...groups.values()].map(g=>({...g,splits:[...g.splits.values()].map(({totalMs,...s})=>({...s,averageMs:Math.round(totalMs/s.count)}))}))};
  }
  sessionAnswer(p, compact=false) {
    const s=this.sessionStats(p);
    if(!s)return `${p.name}: No recorded session.`;
    const link=`https://doctormonty.beer/?runner=${encodeURIComponent(p.id)}`;
    const summary=`${p.name}: ${s.active?'Session':'Last session'} ${time(s.durationMs)}; ${s.resets} resets; ${s.attempts} attempts.`;
    if(compact)return `${summary} Stats: ${link}`;
    const lines=[summary,`Full session: ${link}`,s.current?`Currently: ${profileLabel(s.current)}`:'Currently: no active tracked run.'];
    for(const g of s.groups) {
      lines.push(`${g.label}: ${g.attempts} attempts, ${g.finishes} complete finishes; fastest finish ${g.fastestMs==null?'unavailable':time(g.fastestMs)}.`);
      lines.push(...g.splits.map(v=>`${v.name}: average ${time(v.averageMs)}, fastest ${time(v.bestMs)} (${v.count} samples).`));
    }
    lines.push('Split times are cumulative RTA checkpoints; practice and missing splits are excluded from time statistics. Reset count includes observed resets only.');
    if(s.unconfirmedEnds)lines.push(`${s.unconfirmedEnds} attempt endings were not observed and are not counted as confirmed resets.`);
    return lines.join('\n');
  }
  answer(input) {
    const q = typeof input === 'string' ? parseCommand(input) : input;
    if (!q) return null;
    if (q.command === 'help') return 'Commands: !current @player | !best @player bow session/alltime | !splits @player | !pace @player | !pb @player | !session @player. Use registered tracker usernames.';
    try {
      const p = this.view(q.player);
      if (p.private) return `${p.name} isn't sharing tracking data.`;
      const a = p.attempt, label = p.profile ? profileLabel(p.profile) : 'No category selected';
      const last = a?.splits.at(-1);
      if (q.command === 'current') {
        if (p.status === 'offline') return `${p.name}: ${p.source?.type === 'therun' ? 'no recent therun.gg update (playing status unknown)' : 'tracker offline'}${p.lastSeen ? '; last seen ' + new Date(p.lastSeen).toISOString() : ''}.`;
        if (!a || a.phase === 'NotRunning') return `${p.name}: connected, no active run. ${label}`;
        return `${p.name} | ${label} | ${a.phase === 'Ended' ? 'Finished' : a.phase === 'Paused' ? 'Paused' : p.source?.type === 'therun' ? 'Last reported timer' : 'Running'} at ${time(a.elapsedMs)}. ${last ? 'Last completed: ' + last.name + ' at ' + time(last.ms) + '. ' : ''}${a.current && a.phase !== 'Ended' ? 'Current: ' + a.current + '.' : ''}${a.practice ? ' Practice attempt.' : ''}`;
      }
      if (q.command === 'best') {
        check(q.split, 'Specify a split, e.g. !best @player bow session.');
        const selected = q.profile ? profile(q.profile) : p.profile;
        const b = this.best(p, q.split, q.scope, selected);
        return `${p.name} | ${selected ? profileLabel(selected) : label} | ${q.scope === 'alltime' ? 'All-time recorded' : 'Session'} best ${clean(q.split)}: ${b ? time(b.ms) : 'no recorded time'}.`;
      }
      if (q.command === 'splits') return `${p.name} | ${label} | ${a?.splits.length ? a.splits.map(s => s.name + ' ' + time(s.ms)).join(' · ') : 'No checkpoints recorded.'}${a && !a.complete ? ' Partial history.' : ''}`;
      if (q.command === 'pace') {
        const ref = last && a.benchmark?.splits[last.name];
        return `${p.name} | ${label} | ${ref == null ? 'WR checkpoint comparison unavailable.' : `${last.name} ${time(last.ms)}: ${time(Math.abs(ref-last.ms))} ${last.ms < ref ? 'ahead' : last.ms > ref ? 'behind' : 'level'} at this checkpoint. Benchmark: ${a.benchmark.source}`}${p.status === 'offline' ? ' Tracker offline; this is the last recorded attempt.' : ''}`;
      }
      if (q.command === 'session') {
        return this.sessionAnswer(p);
      }
      if (q.command === 'pb') {
        const best = this.attempts(p.id).filter(a => a.phase === 'Ended' && a.complete && !a.practice && profileKey(a.profile) === profileKey(p.profile)).sort((a,b) => a.elapsedMs - b.elapsedMs)[0];
        return `${p.name} | ${label} | Completed-run recorded PB: ${best ? time(best.elapsedMs) : 'unavailable'}.`;
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
    const sub = { id: randomUUID(), profile: profile(input.profile), guild: input.guild, channel: input.channel,
      role: input.role || null, player: input.player, split: key(input.split), mode: input.mode,
      thresholdMs: input.thresholdMs ?? null, enabled: true };
    this.put('subscriptions', sub.id, sub); return sub;
  }
  removePlayer(p) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM attempts WHERE player=?').run(p.id);
      for (const job of this.list('outbox')) if (job.player === p.id) this.db.prepare('DELETE FROM outbox WHERE id=?').run(job.id);
      for (const sub of this.list('subscriptions')) if (sub.player === p.id) this.db.prepare('DELETE FROM subscriptions WHERE id=?').run(sub.id);
      this.db.prepare('DELETE FROM players WHERE id=?').run(p.id);
    });
  }
}
