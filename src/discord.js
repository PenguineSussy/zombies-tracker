import {verifiedLiveStreams} from './streams.js';
import { createPublicKey, verify, createHash } from 'node:crypto';
import { check, milliseconds, ENABLED_MAPS, CATEGORIES, categoriesForMap, profile, profileLabel } from './domain.js';
import { SPLIT_RULES, splitName } from './split-rules.js';

export function verifyDiscord(publicKey, timestamp, signature, raw, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/i.test(publicKey ?? '') || !/^\d+$/.test(timestamp ?? '') || !/^[a-f0-9]{128}$/i.test(signature ?? '') || Math.abs(now/1000 - Number(timestamp)) > 300) return false;
  try {
    const key = createPublicKey({ key: Buffer.from('302a300506032b6570032100' + publicKey, 'hex'), format: 'der', type: 'spki' });
    return verify(null, Buffer.concat([Buffer.from(timestamp), raw]), key, Buffer.from(signature, 'hex'));
  } catch { return false; }
}
const stringOption = (name, description, required = true) => ({ name, description, type: 3, required });
export const discordCommands = [
  ...['current', 'splits', 'pace', 'session', 'pb'].map(name => ({ name, description: `Show a runner's ${name}`, options: [stringOption('player', 'Registered tracker username')] })),
  { name: 'best', description: 'Session or all-time recorded checkpoint best', options: [stringOption('player', 'Registered tracker username'), stringOption('split', 'Milestone name, e.g. bow'), { ...stringOption('scope', 'Record scope', false), choices: [{name:'Session',value:'session'}, {name:'All-time recorded',value:'alltime'}] }] },
  { name: 'track-alert', description: 'Post in this channel (and optionally ping a role) when a runner reaches a split', default_member_permissions: '32', dm_permission: false,
    options: [stringOption('player','Registered tracker username, or * for every public runner'), stringOption('split','Checkpoint name, e.g. Boss Enter'),
      {name:'role',description:'Role to ping',type:8,required:false},
      { ...stringOption('mode','When to notify (default: every time the split is reached)',false), choices:[{name:'Every time the split is reached',value:'milestone'},{name:'At or under a time',value:'under'},{name:'Ahead of WR checkpoint',value:'wr'}] },
      stringOption('threshold','Required for under: e.g. 7:35',false),
      { ...stringOption('map','Map (default: the runner’s current map)',false), choices:ENABLED_MAPS.map(m=>({name:m.name,value:m.id})) },
      { ...stringOption('category','Category (default: the runner’s current category, or Mega Gums)',false), choices:CATEGORIES.map(c=>({name:c,value:c})) }] },
  { name: 'track-alerts', description: 'List this server’s alert subscription IDs', default_member_permissions: '32', dm_permission: false },
  { name: 'track-unalert', description: 'Remove an alert', default_member_permissions: '32', dm_permission: false, options:[stringOption('id','Subscription ID from /track-alerts')] }
];
export function discordInteraction(store, interaction) {
  if (interaction.type === 1) return { type: 1 };
  if (interaction.type !== 2) return { type: 4, data: { content: 'Unsupported interaction.', flags: 64 } };
  const options = Object.fromEntries((interaction.data.options ?? []).map(o => [o.name,o.value]));
  let content;
  try {
    const name = interaction.data.name;
    if (name.startsWith('track-')) {
      const permissions = BigInt(interaction.member?.permissions ?? '0');
      check(interaction.guild_id && ((permissions & 32n) !== 0n || (permissions & 8n) !== 0n), 'Manage Server permission required.', 403);
      if (name === 'track-alert') {
        const anyone = options.player === '*', player = anyone ? null : store.view(options.player);
        check(anyone || !player.private, 'That runner is not sharing tracking data.');
        const map = options.map ?? player?.profile?.map;
        check(map, anyone ? 'Choose a map for an alert covering every runner.' : 'Choose a map, or have the runner connect LiveSplit once first.');
        const category = options.category ?? (player?.profile?.map === map ? player.profile.category : categoriesForMap(map).includes('Mega Gums') ? 'Mega Gums' : categoriesForMap(map)[0]);
        const selected = profile({ map, category }), mode = options.mode ?? 'milestone';
        check(mode !== 'under' || options.threshold, 'Add a threshold for an under alert, e.g. 7:35.');
        const sub = store.subscribe({ split:options.split, role:options.role, mode, player:anyone ? '*' : player.id, guild:interaction.guild_id, channel:interaction.channel_id, profile:selected, thresholdMs: options.threshold ? milliseconds(options.threshold) : null });
        const rules = SPLIT_RULES[selected.map] ?? [], label = splitName(selected, options.split);
        content = `Alert created (${sub.id}): ${anyone ? 'any public runner' : player.name} / ${label} / ${profileLabel(selected)}${sub.role ? ` / pings <@&${sub.role}>` : ''}.`
          + (rules.length && !rules.some(r => r.name === label) ? `\nNote: "${label}" is not a standard checkpoint for this map, so it only matches a LiveSplit split with exactly that name. Standard: ${rules.map(r => r.name).join(', ')}.` : '')
          + (sub.role ? '\nThe bot needs Send Messages here, and the role must be mentionable (or the bot needs Mention All Roles).' : '');
      } else if (name === 'track-alerts') {
        content = store.list('subscriptions').filter(s => s.guild === interaction.guild_id).map(s => `${s.id}: ${s.player === '*' ? 'any runner' : s.player} / ${s.split} / ${s.mode} / ${profileLabel(s.profile)} / <#${s.channel}>${s.role ? ` / <@&${s.role}>` : ''}`).join('\n') || 'No alerts configured.';
      } else {
        const sub = store.get('subscriptions', options.id); check(sub?.guild === interaction.guild_id, 'Alert not found.', 404);
        store.db.prepare('DELETE FROM subscriptions WHERE id=?').run(sub.id); content = 'Alert removed.';
      }
    } else content = store.answer({ command:name, ...options, scope:options.scope ?? 'session' });
  } catch (error) { if (!error.status) throw error; content = error.message; }
  return { type:4, data:{ content:String(content ?? 'Unknown command.').slice(0,1900), allowed_mentions:{parse:[]}, ...(interaction.data.name.startsWith('track-') ? {flags:64} : {}) } };
}
export async function deliverAlerts(store, token, fetcher = fetch) {
  if (!token) return;
  const now = store.clock();
  for (const job of store.list('outbox').filter(j => j.status === 'pending' && j.nextTry <= now).slice(0,10)) {
    const p = store.get('players',job.player), sub = store.get('subscriptions',job.subscription);
    if (!p?.public || !sub?.enabled || p.activeAttempt !== job.attempt || now - job.createdAt > 120000) { job.status='cancelled'; store.put('outbox',job.id,job); continue; }
    const live=verifiedLiveStreams(store,p,now)[0];
    const streamLine=live?'\nWatch live: '+live.url:'\nCurrently Offline';
    const nonce = BigInt('0x' + createHash('sha256').update(job.id).digest('hex').slice(0,15)).toString();
    try {
      const response = await fetcher(`https://discord.com/api/v10/channels/${job.channel}/messages`, { method:'POST', headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({content:`${job.role ? '<@&'+job.role+'>\n' : ''}${job.content}`.slice(0,1900-streamLine.length)+streamLine, allowed_mentions:{parse:[],roles:job.role?[job.role]:[]}, nonce, enforce_nonce:true}), signal:AbortSignal.timeout(8000) });
      if (response.ok) job.status='sent';
      else if (response.status === 429) {
        const data = await response.json(); job.nextTry = now + Math.max(1000, Number(data.retry_after ?? 5)*1000);
        store.put('outbox',job.id,job); break;
      } else if (response.status >= 400 && response.status < 500) { job.status='failed'; job.error=`Discord HTTP ${response.status}`; }
      else throw new Error('Discord unavailable');
    } catch { job.tries++; job.nextTry=now+Math.min(60000,1000*2**job.tries); if(job.tries>=6) job.status='failed'; }
    store.put('outbox',job.id,job);
  }
}
