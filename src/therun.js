import { createHash } from 'node:crypto';
import { check, clean, key, profile, profileKey, requireEnabledMap } from './domain.js';

export function sourceConfig(input) {
  if (input.type === 'direct') return { type: 'direct' };
  check(input.type === 'therun', 'Choose direct or therun.');
  requireEnabledMap(input.profile?.map);
  check(/^[a-zA-Z0-9_]{3,30}$/.test(input.username), 'Invalid therun.gg username.');
  const variables = {};
  for (const [name, value] of Object.entries(input.variables ?? {})) variables[clean(name)] = clean(value);
  const aliases = {};
  for (const [name, value] of Object.entries(input.aliases ?? {})) aliases[clean(name)] = key(value);
  return { type: 'therun', username: input.username, game: clean(input.game, 150), category: clean(input.category, 150),
    profile: profile(input.profile), variables, aliases, practice: input.practice === true };
}

export function translateRun(run, source, previous, now = Date.now()) {
  check(run && typeof run === 'object', 'No live run found on therun.gg.');
  check(String(run.login ?? run.user).toLowerCase() === source.username.toLowerCase(), 'Source username mismatch.');
  check(run.game === source.game && run.category === source.category, 'Source game/category does not match the configured mapping.');
  check((run.gameTime ? 'GameTime' : 'RealTime') === source.profile.timing, 'Source timing method mismatch.');
  for (const [k,v] of Object.entries(source.variables)) check(run.variables?.[k] === v, `Source category variable mismatch: ${k}.`);
  const observedAt = Number(run.insertedAt);
  check(Number.isSafeInteger(observedAt) && observedAt > 0 && observedAt <= now + 60000, 'Source has no valid update timestamp.');
  check(Array.isArray(run.splits) && run.splits.length <= 500, 'Source split data unavailable.');
  const idle = run.hasReset === true || run.currentSplitIndex === -1;
  const ended = !!run.endedAt || (!idle && run.currentSplitIndex === run.splits.length);
  const index = idle ? -1 : run.currentSplitIndex;
  check(Number.isInteger(index) && index >= -1 && index <= run.splits.length, 'Invalid source split index.');
  check(run.startedAt || idle, 'Source attempt has no stable start identifier.');
  const identity = [source.username, source.connectionId ?? '', profileKey(source.profile), run.startedAt ?? 'idle', idle ? 'reset' : 'run'];
  const attemptId = 'therun-' + createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,32);
  const splits = idle ? [] : run.splits.slice(0, index).flatMap((s,i) => {
    if (s.splitTime == null) return [];
    check(typeof s.splitTime === 'number' && Number.isFinite(s.splitTime), 'Invalid source split time.');
    return [{ index: i, name: key(source.aliases[s.name] ?? s.name), ms: Math.round(s.splitTime) }];
  });
  check(typeof run.currentTime === 'number' && Number.isFinite(run.currentTime), 'Source timer unavailable.');
  return { attemptId, sequence: observedAt, profile: source.profile, phase: idle ? 'NotRunning' : ended ? 'Ended' : 'Running',
    index, elapsedMs: idle ? 0 : Math.round(run.currentTime), current: idle || ended ? null : run.currentSplitName,
    splits, complete: !idle && splits.length === index, practice: source.practice, observedAt,
    suppressAlerts: !previous || now - observedAt > 30000 };
}

export function startTheRun(store, fetcher = fetch, log = console.log) {
  let stopped = false, timer, busy = false;
  const seen = new Set();
  async function poll() {
    if (busy || stopped) return; busy = true;
    try {
      for (const player of store.list('players').filter(p => p.source?.type === 'therun')) {
        if (stopped) break;
        const source = player.source;
        try {
          const response = await fetcher(`https://therun.gg/api/live/${encodeURIComponent(source.username)}`, { signal: AbortSignal.timeout(8000) });
          if (response.status === 429) { log('therun.gg rate limit; waiting before polling again.'); break; }
          if (!response.ok) throw new Error(`therun.gg HTTP ${response.status}`);
          const raw = await response.json();
          const run = Array.isArray(raw) ? raw.find(r => String(r.login ?? r.user).toLowerCase() === source.username.toLowerCase()) : raw;
          const current = store.get('players', player.id);
          if (!current || JSON.stringify(current.source) !== JSON.stringify(source)) continue;
          const event = translateRun(run, source, seen.has(player.id) ? current.activeAttempt : null, store.clock());
          store.ingest(player.id, event); seen.add(player.id);
          current.sourceError = null;
          const updated = store.get('players', player.id); updated.sourceError = null; store.savePlayer(updated);
        } catch (error) {
          const current = store.get('players', player.id);
          if (current) { current.sourceError = error.status ? error.message : 'therun.gg connection unavailable.'; store.savePlayer(current); }
        }
      }
    } finally { busy = false; if (!stopped) timer = setTimeout(poll, 15000); }
  }
  void poll();
  return () => { stopped = true; clearTimeout(timer); };
}
