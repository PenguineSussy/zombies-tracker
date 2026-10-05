import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { milliseconds, key, profileKey } from '../src/domain.js';

// One request at a time: LiveSplit's TCP protocol has no response identifiers.
export class LiveSplitClient {
  constructor({ host = '127.0.0.1', port = 16834, timeout = 2000, fallbackTiming = null, onWarning = console.warn } = {}) {
    Object.assign(this, { host, port, timeout, fallbackTiming, onWarning, buffer: '', pending: null, supportsTimingMethod: undefined });
  }
  async connect() {
    this.close(); this.buffer = '';
    const socket = this.socket = net.createConnection({ host: this.host, port: this.port });
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      this.buffer += chunk;
      if (this.buffer.length > 65536) return this.close();
      let end;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end).replace(/\r$/, ''); this.buffer = this.buffer.slice(end + 1);
        const pending = this.pending; this.pending = null;
        if (pending) { clearTimeout(pending.timer); pending.resolve(line); }
      }
    });
    socket.on('error', () => this.close()); socket.on('close', () => { if (this.socket === socket) this.close(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('LiveSplit connection timed out.')); }, this.timeout);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
  }
  close() {
    const pending = this.pending; this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('LiveSplit disconnected.')); }
    const socket = this.socket; this.socket = null; socket?.destroy();
  }
  command(command) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error('LiveSplit is not connected.'));
    if (this.pending) return Promise.reject(new Error('Concurrent LiveSplit request.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null; this.close();
        const error = new Error(`LiveSplit did not answer ${command}. Check its TCP server and command support.`);
        error.code = 'COMMAND_TIMEOUT'; reject(error);
      }, this.timeout);
      this.pending = { resolve, reject, timer }; this.socket.write(command + '\r\n');
    });
  }
  async timingMethod() {
    if (this.supportsTimingMethod === undefined) {
      // Probe on a separate socket: an unanswered legacy command must never
      // leave a delayed response in the timer snapshot's response stream.
      const probe = new LiveSplitClient({ host: this.host, port: this.port, timeout: this.timeout });
      try {
        await probe.connect();
        const value = await probe.command('gettimingmethod');
        if (!['RealTime', 'GameTime'].includes(value)) throw new Error('Unrecognized LiveSplit timing method.');
        this.supportsTimingMethod = true;
      } catch (error) {
        if (error.code !== 'COMMAND_TIMEOUT' || !['RealTime', 'GameTime'].includes(this.fallbackTiming)) throw error;
        this.supportsTimingMethod = false;
        this.onWarning(`Compatibility mode: this LiveSplit server cannot report its timing method. Using configured ${this.fallbackTiming}. Make sure LiveSplit uses the same timing method; automatic verification is unavailable.`);
      } finally { probe.close(); }
    }
    return this.supportsTimingMethod ? this.command('gettimingmethod') : this.fallbackTiming;
  }
  async read() {
    // Negotiate before sampling so the one-time legacy timeout doesn't span a split.
    await this.timingMethod();
    for (let tries = 0; tries < 3; tries++) {
      const attemptCount = await this.command('getattemptcount');
      const phase = await this.command('getcurrenttimerphase');
      const index = Number(await this.command('getsplitindex'));
      const timing = await this.timingMethod();
      const elapsedMs = milliseconds(await this.command('getcurrenttime'));
      const current = await this.command('getcurrentsplitname');
      const previous = await this.command('getprevioussplitname');
      const previousMs = milliseconds(await this.command('getlastsplittime'));
      const countAfter = await this.command('getattemptcount');
      const indexAfter = Number(await this.command('getsplitindex'));
      const phaseAfter = await this.command('getcurrenttimerphase');
      if (attemptCount === countAfter && index === indexAfter && phase === phaseAfter) {
        if (!/^\d+$/.test(attemptCount) || !Number.isInteger(index) || elapsedMs == null) throw new Error('Unsupported LiveSplit server response.');
        return { attemptCount, phase, index, timing, elapsedMs, current, previous, previousMs };
      }
    }
    throw new Error('Timer changed during sample; retrying.');
  }
}

export class Reconciler {
  constructor(config, saved = {}) { this.config = config; this.state = saved; this.reconnecting = true; }
  disconnected() { this.reconnecting = true; }
  update(sample) {
    if (sample.timing !== this.config.profile.timing) throw new Error('LiveSplit timing method differs from your selected profile. Fix the profile or timer before continuing.');
    const s = this.state, last = s.last;
    const fingerprint = profileKey(this.config.profile) + ':' + JSON.stringify(this.config.aliases ?? {}) + ':' + !!this.config.practice;
    const active = ['Running', 'Paused', 'Ended'].includes(sample.phase);
    const changed = !last || s.fingerprint !== fingerprint || last.attemptCount !== sample.attemptCount ||
      (sample.phase === 'NotRunning' && last.phase !== 'NotRunning') ||
      (last.phase === 'NotRunning' && active) || (sample.elapsedMs + 1000 < last.elapsedMs && sample.index <= 0);
    if (changed) {
      s.id = randomUUID(); s.splits = []; s.complete = active && sample.index === 0;
      s.sequence = 0; s.fingerprint = fingerprint;
    }
    if (sample.phase === 'NotRunning') { s.splits = []; s.complete = false; }
    else {
      if (last && !changed && sample.index > last.index + 1) s.complete = false;
      if (this.reconnecting && sample.index > 0 && (!last || sample.index !== last.index)) s.complete = false;
      s.splits = s.splits.filter(split => split.index < sample.index);
      if (sample.index > 0) {
        s.splits = s.splits.filter(split => split.index !== sample.index - 1);
        if (sample.previousMs != null && sample.previousMs >= 0 && sample.previous !== '-') {
          const aliases = this.config.aliases ?? {};
          const name = aliases[sample.previous] ?? aliases[sample.previous.toLowerCase()] ?? sample.previous;
          s.splits.push({ index: sample.index - 1, name: key(name), ms: sample.previousMs });
        } else s.complete = false;
      }
      if (s.splits.length !== sample.index) s.complete = false;
    }
    const result = { attemptId: s.id, sequence: ++s.sequence, profile: this.config.profile,
      phase: sample.phase, index: sample.index, elapsedMs: sample.elapsedMs, current: sample.current,
      splits: structuredClone(s.splits), complete: s.complete, practice: this.config.practice === true,
      suppressAlerts: this.reconnecting, observedAt: Date.now() };
    s.last = sample; this.reconnecting = false; return result;
  }
}
