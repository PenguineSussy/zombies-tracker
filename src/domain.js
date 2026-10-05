export const MAPS = [
  ['shadows-of-evil', 'Shadows of Evil'], ['the-giant', 'The Giant'],
  ['der-eisendrache', 'Der Eisendrache'], ['zetsubou-no-shima', 'Zetsubou No Shima'],
  ['gorod-krovi', 'Gorod Krovi'], ['revelations', 'Revelations'],
  ['nacht-der-untoten', 'Nacht der Untoten'], ['verruckt', 'Verrückt'],
  ['shi-no-numa', 'Shi No Numa'], ['kino-der-toten', 'Kino der Toten'],
  ['ascension', 'Ascension'], ['shangri-la', 'Shangri-La'], ['moon', 'Moon'], ['origins', 'Origins'],
].map(([id, name]) => ({ id, name, enabled: ![
  'nacht-der-untoten', 'verruckt', 'shi-no-numa', 'kino-der-toten',
].includes(id) }));

export const ENABLED_MAPS = MAPS.filter(map => map.enabled);
export function requireEnabledMap(id) {
  check(ENABLED_MAPS.some(map => map.id === id), 'This map is disabled for new runs. Choose an enabled map.');
}

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function check(value, message, status) { if (!value) throw new InputError(message, status); }
export function clean(value, max = 80) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f<>@]/.test(value), 'Invalid text value.');
  return value.trim();
}
export function key(value) { return clean(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' '); }
export function profile(input) {
  check(input && typeof input === 'object', 'Choose a run profile.');
  check(MAPS.some(m => m.id === input.map), 'Choose an official BO3 map.');
  check(Number.isInteger(input.players) && input.players >= 1 && input.players <= 4, 'Players must be 1–4.');
  check(['RealTime', 'GameTime'].includes(input.timing), 'Choose RealTime or GameTime.');
  return { map: input.map, objective: key(input.objective), players: input.players,
    rules: key(input.rules), route: key(input.route), timing: input.timing };
}
export function profileKey(p) { return JSON.stringify(profile(p)); }
export function profileLabel(p) {
  return `${MAPS.find(m => m.id === p.map)?.name ?? p.map} · ${p.players === 1 ? 'Solo' : p.players + 'P'} · ${p.objective} · ${p.rules} · ${p.route} · ${p.timing}`;
}
export function milliseconds(value) {
  if (value == null || value === '-' || value === '') return null;
  const text = String(value).trim().replace(',', '.').replace('−', '-');
  if (!/^-?\d+(?::\d{1,2}){0,2}(?:\.\d{1,7})?$/.test(text)) throw new InputError('Invalid timer value.');
  const sign = text.startsWith('-') ? -1 : 1;
  const parts = text.replace('-', '').split(':').map(Number);
  if (parts.length > 1) check(parts.slice(1).every(v => v < 60), 'Invalid timer value.');
  return Math.round(parts.reduce((n, part) => n * 60 + part, 0) * 1000 * sign);
}
export function time(ms) {
  if (ms == null) return 'unavailable';
  const sign = ms < 0 ? '-' : '';
  let s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const fraction = Math.abs(ms) % 1000;
  return `${sign}${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}${fraction ? '.' + String(fraction).padStart(3, '0').replace(/0+$/, '') : ''}`;
}
export function snapshot(input) {
  check(input && typeof input === 'object', 'Snapshot required.');
  check(/^[\w-]{8,80}$/.test(input.attemptId), 'Invalid attempt ID.');
  check(Number.isSafeInteger(input.sequence) && input.sequence >= 0, 'Invalid sequence.');
  check(['Running', 'Paused', 'Ended', 'NotRunning'].includes(input.phase), 'Invalid timer phase.');
  check(Number.isInteger(input.index) && input.index >= -1 && input.index <= 500, 'Invalid split index.');
  check(Number.isSafeInteger(input.elapsedMs) && input.elapsedMs >= -3600000 && input.elapsedMs <= 604800000, 'Invalid elapsed time.');
  check(Array.isArray(input.splits) && input.splits.length <= 500, 'Invalid splits.');
  let previous = -1, previousTime = -1;
  const splits = input.splits.map(s => {
    check(Number.isInteger(s.index) && s.index > previous && s.index < input.index, 'Splits must be ordered, unique, and completed.');
    check(Number.isSafeInteger(s.ms) && s.ms >= 0 && s.ms >= previousTime && s.ms <= input.elapsedMs, 'Invalid checkpoint time.');
    previous = s.index; previousTime = s.ms;
    return { index: s.index, name: key(s.name), ms: s.ms };
  });
  check(new Set(splits.map(s => s.name)).size === splits.length, 'Milestone names must be unique. Map repeated splits to distinct names.');
  const result = { attemptId: input.attemptId, sequence: input.sequence, profile: profile(input.profile),
    phase: input.phase, index: input.index, elapsedMs: input.elapsedMs,
    current: input.current && input.current !== '-' ? clean(input.current) : null,
    splits, practice: input.practice === true, complete: input.complete === true, suppressAlerts: input.suppressAlerts === true,
    observedAt: Number.isSafeInteger(input.observedAt) ? input.observedAt : Date.now() };
  if (result.phase === 'NotRunning') check(splits.length === 0, 'Idle snapshots cannot contain splits.');
  result.complete = result.complete && result.index >= 0 && result.splits.length === result.index;
  return result;
}

export function parseCommand(text) {
  const words = String(text).trim().match(/"[^"]+"|\S+/g)?.map(s => s.replace(/^"|"$/g, '')) ?? [];
  if (words[0]?.startsWith('@')) words.shift();
  const command = words.shift()?.toLowerCase();
  if (!['!current', '!best', '!splits', '!pace', '!session', '!pb', '!help'].includes(command)) return null;
  if (command === '!help') return { command: 'help' };
  const player = words.shift()?.replace(/^@/, '').toLowerCase();
  if (!player || !/^[a-z0-9_]{3,30}$/.test(player)) return { command: 'help' };
  let scope = 'session';
  if (['session', 'alltime'].includes(words.at(-1)?.toLowerCase())) scope = words.pop().toLowerCase();
  return { command: command.slice(1), player, split: words.join(' '), scope };
}
