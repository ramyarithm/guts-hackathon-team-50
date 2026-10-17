import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './test-loader.mjs';
const { generateSequence, createGame, createState, place, tick, ROUND_MS } = load('./logic.ts');
const solution = sequence => sequence.map((type, i) => type === sequence[Math.floor(i / 6) * 6] ? 'LEFT' : 'RIGHT');
function solve(game, runId) {
  for (const button of solution(generateSequence(runId))) { game.press(button); game.step(350); }
}
test('four shuffled 3+3 rounds: all four types, deterministic, varied and solvable across 1000 run IDs', () => {
  const unique = new Set();
  for (let i = 0; i < 1000; i++) {
    const runId = `shelf-proof-${i}`;
    const sequence = generateSequence(runId);
    assert.equal(sequence.length, 24); assert.equal(new Set(sequence).size, 4);
    assert.deepEqual(sequence, generateSequence(runId)); unique.add(sequence.join(','));
    for (let start = 0; start < 24; start += 6) {
      const round = sequence.slice(start, start + 6);
      const types = [...new Set(round)]; assert.equal(types.length, 2);
      for (const type of types) assert.equal(round.filter(item => item === type).length, 3);
    }
    let completed = 0;
    const game = createGame({ runId, onComplete: () => completed++ });
    solve(game, runId);
    assert.equal(game.state.phase, 'SUCCESS'); assert.equal(game.state.matches, 8);
    assert.deepEqual(game.state.shelves, [[], []]); assert.equal(game.state.placed, 24);
    game.step(1000); game.step(1000); game.press('LEFT'); assert.equal(completed, 1);
  }
  assert.ok(unique.size > 950, 'new runs should not repeat one fixed puzzle');
});
test('LEFT and RIGHT place only on the chosen shelf; placement cannot double-fire during its animation', () => {
  const state = createState('BATTERY');
  place(state, 'LEFT', 'DRIVE'); assert.deepEqual(state.shelves, [['BATTERY'], []]);
  place(state, 'RIGHT', 'BOX'); assert.equal(state.placed, 1);
  tick(state, 150); place(state, 'RIGHT', 'BOX'); assert.deepEqual(state.shelves, [['BATTERY'], ['DRIVE']]);
});
test('a run of three clears once, preserves lower items, and produces match feedback', () => {
  const state = createState('BATTERY');
  for (const type of ['BATTERY', 'DRIVE', 'DRIVE', 'DRIVE']) {
    state.current = type; place(state, 'LEFT', 'WRENCH'); tick(state, 150);
  }
  assert.deepEqual(state.shelves, [['BATTERY'], []]); assert.equal(state.matches, 1);
  assert.ok(state.effects.some(fx => fx.kind === 'MATCH'));
  tick(state, 1000); tick(state, 1000); assert.equal(state.matches, 1);
});
test('nonconsecutive identical items do not match; four slots are allowed, a fifth fails without storing it', () => {
  const state = createState('BATTERY');
  for (const type of ['BATTERY', 'DRIVE', 'BATTERY', 'BOX']) {
    state.current = type; place(state, 'LEFT', 'WRENCH'); tick(state, 200);
  }
  assert.equal(state.phase, 'PLAYING'); assert.equal(state.shelves[0].length, 4); assert.equal(state.matches, 0);
  place(state, 'LEFT', null); assert.equal(state.phase, 'FAILED'); assert.equal(state.failure, 'OVERFLOW');
  assert.equal(state.failedShelf, 0); assert.equal(state.shelves[0].length, 4);
});
test('timer waits for the first placement, counts real elapsed time and expires exactly at 40 seconds', () => {
  const game = createGame({ runId: 'timer' }); game.step(999999);
  assert.equal(game.state.remainingMs, ROUND_MS); assert.equal(game.state.phase, 'READY');
  game.press('RIGHT'); game.step(39999); assert.equal(game.state.remainingMs, 1);
  game.step(1); assert.equal(game.state.phase, 'FAILED'); assert.equal(game.state.failure, 'TIMEOUT');
});
test('exhausted but uncleared shelves fail explicitly', () => {
  const state = createState('DRIVE'); state.phase = 'PLAYING'; state.placed = 23; state.matches = 7;
  state.shelves = [['BATTERY'], []]; place(state, 'RIGHT', null);
  assert.equal(state.phase, 'FAILED'); assert.equal(state.failure, 'UNCLEARED');
});
test('either retry button fully resets the timer, effects, shelves, matches and deterministic sequence', () => {
  for (const button of ['LEFT', 'RIGHT']) {
    const labels = []; const game = createGame({ runId: 'retry', onLabels: l => labels.push(l) });
    game.press('LEFT'); game.step(40000); assert.equal(game.state.phase, 'FAILED');
    assert.deepEqual(labels.at(-1), { left: 'Retry', right: 'Retry' });
    game.press(button); assert.equal(game.state.phase, 'READY'); assert.equal(game.state.remainingMs, 40000);
    assert.equal(game.state.placed, 0); assert.equal(game.state.matches, 0); assert.deepEqual(game.state.shelves, [[], []]);
    assert.deepEqual(game.state.effects, []); assert.equal(game.state.current, generateSequence('retry')[0]);
    solve(game, 'retry'); assert.equal(game.state.phase, 'SUCCESS');
  }
});
test('no sequence or upcoming objects are exposed through render state; invalid input is ignored', () => {
  const game = createGame({ runId: 'private' });
  assert.equal('sequence' in game.state, false); assert.equal('queue' in game.state, false);
  assert.equal('next' in game.state, false); assert.equal('upcoming' in game.state, false);
  game.press('CONFIRM'); assert.equal(game.state.phase, 'READY'); assert.equal(game.state.placed, 0);
});
test('disposing prevents further input, ticking, labels or delayed completion', () => {
  let completed = 0; const game = createGame({ runId: 'dispose', onComplete: () => completed++ });
  solve(game, 'dispose'); game.dispose(); game.dispose(); game.step(9000); game.press('RIGHT'); assert.equal(completed, 0);
});
