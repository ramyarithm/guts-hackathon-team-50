import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './test-loader.mjs';
const { generateSequence } = load('./logic.ts');
const { createG8Adapter, g8Entry } = load('./index.ts');
const { getGame, getTwoButtonGames } = load('../registry.ts');
function environment(t) {
  const originals = new Map(); let now = 0; let next = 0;
  const frames = new Map(); const observers = new Set(); const listeners = new Set();
  const ctx = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {}, set: (o, k, v) => (o[k] = v, true) });
  const host = { clientWidth: 280, clientHeight: 320, children: [], appendChild(c) { this.children.push(c); } };
  const replace = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  replace('performance', { now: () => now });
  replace('requestAnimationFrame', cb => { const id = ++next; frames.set(id, cb); return id; });
  replace('cancelAnimationFrame', id => frames.delete(id));
  replace('ResizeObserver', class { observe() { observers.add(this); } disconnect() { observers.delete(this); } });
  replace('window', { addEventListener: (_name, cb) => listeners.add(cb), removeEventListener: (_name, cb) => listeners.delete(cb) });
  replace('document', { getElementById: () => host, createElement: () => ({ dataset: {}, style: {}, attrs: {},
    setAttribute(k,v) { this.attrs[k] = v; }, getContext: () => ctx,
    remove() { host.children = host.children.filter(c => c !== this); },
  }) });
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; } });
  return { host, frames, observers, listeners, pump(ms) { now += ms; const pending = [...frames.values()]; frames.clear(); for (const cb of pending) cb(now); }, elapse(ms) { now += ms; } };
}
test('registration declares the unused G8 slot and two inputs', () => {
  assert.equal(getGame('G8'), g8Entry); assert.equal(g8Entry.inputCount, 2);
  assert.equal(g8Entry.ready, true);
  assert.ok(getTwoButtonGames().some(game => game.id === g8Entry.id));
});
test('adapter mounts one canvas, sets labels immediately, restarts safely, and disposes all resources', t => {
  const env = environment(t); const labels = []; const adapter = createG8Adapter();
  const args = { gameId: 'G8', stageId: 'ANY_STAGE', runId: 'mount', container: env.host, onComplete() {}, setControlLabels: l => labels.push(l) };
  adapter.handleInput('LEFT'); adapter.startMinigame(args);
  assert.deepEqual(labels[0], { left: 'Left shelf', right: 'Right shelf' });
  assert.equal(env.host.children.length,1); assert.equal(env.frames.size,1); assert.equal(env.observers.size,1);
  adapter.startMinigame(args); assert.equal(env.host.children.length,1); assert.equal(env.frames.size,1); assert.equal(env.observers.size,1);
  adapter.dispose(); adapter.dispose(); assert.equal(env.host.children.length,0); assert.equal(env.frames.size,0); assert.equal(env.observers.size,0); assert.equal(env.listeners.size,0);
  adapter.handleInput('RIGHT'); env.pump(1000); assert.equal(env.frames.size,0);
  adapter.startMinigame(args); assert.equal(env.host.children.length,1); adapter.dispose();
});
test('adapter checks the real deadline before accepting an input between frames; retry uses the same two buttons', t => {
  const env = environment(t); const labels = []; const adapter = createG8Adapter();
  adapter.startMinigame({ gameId:'G8',stageId:'IGNORED',runId:'deadline',container:env.host,onComplete(){},setControlLabels:l=>labels.push(l) });
  env.elapse(99999); adapter.handleInput('RIGHT'); // READY time must not be counted.
  env.elapse(40001); adapter.handleInput('LEFT');
  // A just-expired input must show the failure before a later press retries.
  assert.ok(labels.some(l => l.left === 'Retry'));
  assert.match(env.host.children[0].attrs['aria-label'], /FAILED/);
  adapter.handleInput('RIGHT');assert.match(env.host.children[0].attrs['aria-label'], /READY/);
  adapter.dispose();
});
test('controller-style completion fires once and tolerates immediate synchronous disposal', t => {
  const env = environment(t); let calls = 0; const adapter = createG8Adapter(); const runId='integration-win';
  adapter.startMinigame({gameId:'G8',stageId:'ANY',runId,container:env.host,setControlLabels(){},onComplete(){calls++;adapter.dispose();}});
  const sequence=generateSequence(runId);
  for(let i=0;i<24;i++) { adapter.handleInput(sequence[i]===sequence[Math.floor(i/6)*6]?'LEFT':'RIGHT');env.pump(350); }
  env.pump(1000); assert.equal(calls,1); assert.equal(env.frames.size,0); assert.equal(env.host.children.length,0);
  adapter.handleInput('LEFT');env.pump(5000);assert.equal(calls,1);
});
test('leaving before success hold cancels the callback and all pending frames', t => {
  const env = environment(t);let calls=0;const adapter=createG8Adapter();const runId='leave';
  adapter.startMinigame({gameId:'G8',stageId:'ANY',runId,container:env.host,setControlLabels(){},onComplete(){calls++;}});
  const seq=generateSequence(runId);for(let i=0;i<24;i++){adapter.handleInput(seq[i]===seq[Math.floor(i/6)*6]?'LEFT':'RIGHT');env.pump(350);}
  adapter.dispose();env.pump(10000);assert.equal(calls,0);assert.equal(env.frames.size,0);
});
test('missing canvas context cleans up rather than retaining a canvas', t => {
  const env=environment(t);const original=document.createElement;
  document.createElement=()=>{const c=original();c.getContext=()=>null;return c;};
  const adapter=createG8Adapter();assert.throws(()=>adapter.startMinigame({gameId:'G8',stageId:'ANY',runId:'x',container:env.host,setControlLabels(){},onComplete(){}}));
  assert.equal(env.host.children.length,0);assert.equal(env.frames.size,0);adapter.dispose();
});
