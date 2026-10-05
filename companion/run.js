import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { LiveSplitClient, Reconciler } from './livesplit.js';
import { profile } from '../src/domain.js';

const file = resolve(process.argv[2] ?? 'companion/config.json');
if (!existsSync(file)) { console.error('Create companion/config.json using the dashboard download, then run npm run companion. See README.md.'); process.exit(1); }
const config = JSON.parse(readFileSync(file, 'utf8'));
config.profile = profile(config.profile);
const url = new URL(config.server);
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS for a remote tracker server.');
if (url.username || url.password || !config.token) throw new Error('Invalid server URL or missing runner key.');
const statePath = resolve(dirname(file), 'state.json');
const saved = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const reconciler = new Reconciler(config, saved.reconciler ?? {});
const queue = saved.queue ?? [];
const client = new LiveSplitClient({ ...config.livesplit, fallbackTiming: config.profile.timing });
let stopped = false, lastMessage = '', sending = false;
const log = message => { if (message !== lastMessage) { console.log(message); lastMessage = message; } };
const persist = () => { writeFileSync(statePath + '.tmp', JSON.stringify({ reconciler: reconciler.state, queue })); renameSync(statePath + '.tmp', statePath); };
async function flush() {
  if (sending) return; sending = true;
  try {
    while (queue.length && !stopped) {
      const item = queue[0];
      const response = await fetch(new URL('/api/ingest', url), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` }, body: JSON.stringify(item), signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        if ([400, 401, 403, 409].includes(response.status)) {
          const reason=(await response.json()).error;
          if (response.status===409 && reason.includes('Attempt already closed')) {
            queue.splice(0); reconciler.state={}; reconciler.disconnected(); persist();
            log('Previous attempt was closed by a source change. Starting a fresh observation.'); return;
          }
          console.error(`Tracker rejected an update (${response.status}): ${reason}. Stop, correct configuration, and inspect companion/state.json before retrying.`);
          stopped = true; client.close(); return;
        }
        throw new Error(`Tracker HTTP ${response.status}`);
      }
      queue.shift(); persist();
    }
  } catch { log('Tracker unavailable. Saving updates locally and retrying.'); }
  finally { sending = false; }
}
process.on('SIGINT', () => { stopped = true; client.close(); persist(); });
console.log('Zombies Tracker companion. Keep this window open. Ctrl+C stops tracking.');
let lastSignature = '', lastSend = 0;
while (!stopped) {
  try {
    if (!client.socket) { await client.connect(); reconciler.disconnected(); }
    const sample = await client.read();
    const event = reconciler.update(sample);
    const signature = JSON.stringify([event.attemptId, event.phase, event.index, event.splits, event.current]);
    if (signature !== lastSignature || Date.now() - lastSend >= 5000) {
      // Collapse consecutive heartbeat-only updates; retain every split/reset/undo transition.
      const last = queue.at(-1);
      if (last && last.attemptId === event.attemptId && JSON.stringify([last.phase,last.index,last.splits,last.current]) === JSON.stringify([event.phase,event.index,event.splits,event.current])) queue.pop();
      if (queue.length >= 10000) throw new Error('Local queue full. Reconnect to the tracker before continuing.');
      queue.push(event); persist(); lastSignature = signature; lastSend = Date.now();
    }
    void flush();
    if (!queue.length) log(`Connected • ${sample.phase} • ${sample.current === '-' ? 'waiting for run' : sample.current}`);
  } catch (error) { log(error.message); client.close(); reconciler.disconnected(); void flush(); }
  await sleep(500);
}
persist();
