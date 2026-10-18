import { describe, expect, it } from 'vitest';
import {
  DOUBLE_PRESS_GUARD_MS,
  ELLIPSIS_PAUSE_MS,
  FULL_STOP_PAUSE_MS,
  MS_PER_CHAR,
  createPlayer,
  type DialogueItem,
} from './player';
import { SUBTITLE_HOLD_MS, createSubtitleQueue } from './subtitles';

const line = (id: string, text: string, speaker = 'ENGINEER' as const): DialogueItem => ({
  kind: 'line',
  id,
  speaker,
  text,
});
const ITEMS: DialogueItem[] = [
  line('1', 'One.'),
  line('2', 'Hang on… two'),
  { kind: 'digit', position: 1, digit: '7', slots: ['7', '?', '?', '?'] },
];

function harness(items = ITEMS) {
  const labels: string[] = [];
  let done = 0;
  const p = createPlayer(items, {
    onLabels: (l) => labels.push(`${l.left}/${l.right}`),
    onDone: () => done++,
  });
  return { p, labels, done: () => done };
}

describe('player', () => {
  it('types at the named speed, pausing at ellipses and full stops', () => {
    const { p } = harness();
    expect(p.visibleText()).toBe('');
    p.tick(MS_PER_CHAR * 3 + 1);
    expect(p.visibleText()).toBe('One');
    p.tick(MS_PER_CHAR + 1); // the full stop appears...
    expect(p.visibleText()).toBe('One.');
    expect(p.state.typing).toBe(true); // ...and holds for its pause before the line counts as shown
    p.tick(FULL_STOP_PAUSE_MS + 1);
    expect(p.state.typing).toBe(false);
    p.press('RIGHT'); // next line
    p.tick(DOUBLE_PRESS_GUARD_MS);
    p.tick(MS_PER_CHAR * 8 + 1);
    expect(p.visibleText()).toBe('Hang on…');
    p.tick(MS_PER_CHAR * 3);
    expect(p.visibleText()).toBe('Hang on…'); // paused at the ellipsis
    p.tick(ELLIPSIS_PAUSE_MS + MS_PER_CHAR * 4 + 2);
    expect(p.visibleText()).toBe('Hang on… two');
  });

  it('labels: Skip while typing, Next when shown, Continue on the last item; Back always', () => {
    const { p, labels } = harness();
    expect(labels.at(-1)).toBe('Back/Skip');
    p.press('RIGHT'); // skip
    expect(p.visibleText()).toBe('One.');
    expect(labels.at(-1)).toBe('Back/Next');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1);
    p.press('RIGHT'); // to line 2 (typing)
    expect(labels.at(-1)).toBe('Back/Skip');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1);
    p.press('RIGHT'); // skip
    p.tick(DOUBLE_PRESS_GUARD_MS + 1);
    p.press('RIGHT'); // to the digit card
    expect(p.state.index).toBe(2);
    expect(labels.at(-1)).toBe('Back/Continue');
  });

  it('Back goes to the previous line shown in full and never past the first', () => {
    const { p, done } = harness();
    p.press('LEFT');
    expect(p.state.index).toBe(0);
    p.press('RIGHT');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1);
    p.press('RIGHT');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1); // line 2 typing
    p.press('LEFT');
    expect(p.state.index).toBe(0);
    expect(p.visibleText()).toBe('One.');
    expect(p.state.typing).toBe(false);
    p.press('LEFT');
    expect(p.state.index).toBe(0);
    expect(done()).toBe(0);
  });

  it('a double press advances only once, and the last Continue ends the section exactly once', () => {
    const { p, done } = harness();
    p.press('RIGHT'); // skip line 1
    p.press('RIGHT'); // within the guard: ignored
    expect(p.state.index).toBe(0);
    p.tick(DOUBLE_PRESS_GUARD_MS + 1);
    p.press('RIGHT');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1); // line 2
    p.press('RIGHT');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1); // skip
    p.press('RIGHT');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1); // card
    p.press('RIGHT'); // continue -> done
    p.press('RIGHT');
    p.tick(DOUBLE_PRESS_GUARD_MS + 1);
    p.press('RIGHT');
    expect(done()).toBe(1);
    expect(p.state.done).toBe(true);
  });

  it('an empty section finishes immediately and dispose stops callbacks', () => {
    const { done } = harness([]);
    expect(done()).toBe(1);
    const { p, labels } = harness();
    p.dispose();
    const n = labels.length;
    p.press('RIGHT');
    p.tick(1000);
    expect(labels.length).toBe(n);
  });
});

describe('tunnel subtitles', () => {
  it('shows each trigger once, queues close triggers, auto-hides, and takes no input', () => {
    const q = createSubtitleQueue();
    expect(q.current()).toBeNull();
    expect(q.fire('tunnel_enter', { id: '21', speaker: 'ENGINEER', text: 'A' })).toBe(true);
    expect(q.fire('monster_first_detected', { id: '22', speaker: 'ENGINEER', text: 'B' })).toBe(
      true,
    );
    expect(q.fire('tunnel_enter', { id: '21', speaker: 'ENGINEER', text: 'A' })).toBe(false); // once per attempt
    expect(q.current()?.text).toBe('A');
    q.tick(SUBTITLE_HOLD_MS - 1);
    expect(q.current()?.text).toBe('A');
    q.tick(2);
    expect(q.current()?.text).toBe('B');
    q.tick(SUBTITLE_HOLD_MS + 1);
    expect(q.current()).toBeNull();
    expect('press' in q).toBe(false);
    expect('handleInput' in q).toBe(false);
  });
});
