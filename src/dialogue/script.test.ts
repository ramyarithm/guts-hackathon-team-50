// Tests for the dialogue script loader and flow. Run from the repo root:
//   ./chicken-cross/node_modules/.bin/vitest run src/dialogue
import { describe, expect, it } from 'vitest';
import raw from '../../assets/Dialogue/dialogue.json';
import { TUNNEL_TRIGGERS, getSection, loadScript, tunnelLine } from './script';
import {
  itemsForIntro,
  itemsForSection,
  itemsForStageCompletion,
  itemsForStageStory,
} from './flow';

const silent = () => {};

describe('script loading', () => {
  it('loads the real dialogue.json with every section in its listed order', () => {
    const warnings: string[] = [];
    const script = loadScript(raw, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(script.title).toBe('DEAD SIGNAL');
    expect(Object.keys(script.stages)).toEqual([
      'intro',
      'c1_complete',
      'c2_complete',
      'c3_complete',
      'c4_complete',
      'pin_entry',
      'pin_wrong',
      'pin_success',
      'tunnel',
      'ending',
    ]);
    const json = raw as { stages: Record<string, { lines: { id: string }[] }> };
    for (const [id, section] of Object.entries(json.stages)) {
      expect(getSection(script, id).map((l) => l.id)).toEqual(section.lines.map((l) => l.id));
    }
    expect(Object.keys(script.reactions)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8']);
    expect(script.reactions.G1!.map((l) => l.id)).toEqual(['G1-01', 'G1-02']);
  });

  it('every tunnel trigger has exactly one line', () => {
    const script = loadScript(raw, silent);
    for (const trigger of TUNNEL_TRIGGERS) {
      expect(tunnelLine(script, trigger)?.trigger).toBe(trigger);
    }
    expect(tunnelLine(script, 'no_such_trigger')).toBeNull();
  });

  it('a missing or malformed section or line warns and is skipped, never thrown', () => {
    const warnings: string[] = [];
    const script = loadScript(
      {
        meta: { title: 7 },
        stages: {
          intro: {
            lines: [{ id: '01', speaker: 'ENGINEER', text: 'Hi' }, { id: 'bad' }, 'nonsense'],
          },
          c2_complete: 'oops',
        },
        minigame_reactions: { G1: { lines: [{ id: 'x', speaker: 'GHOST', text: 'boo' }] } },
      },
      (m) => warnings.push(m),
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(getSection(script, 'intro')).toHaveLength(1);
    expect(getSection(script, 'c2_complete')).toEqual([]);
    expect(getSection(script, 'c1_complete')).toEqual([]); // absent entirely
    expect(script.reactions.G1).toEqual([]); // unknown speaker dropped
    let threw = false;
    try {
      loadScript(null, silent);
      loadScript('garbage', silent);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(getSection(loadScript(null, silent), 'ending')).toEqual([]);
  });
});

describe('flow', () => {
  const script = loadScript(raw, silent);
  const slots = ['7', '?', '?', '?'];

  it("a stage completion plays the game's reaction, then the stage's story, then the digit card", () => {
    for (const game of ['G1', 'G5', 'G8']) {
      const items = itemsForStageCompletion(script, game, 'C1', 1, '7', slots);
      const reaction = script.reactions[game]!;
      const story = getSection(script, 'c1_complete');
      expect(items).toHaveLength(reaction.length + story.length + 1);
      expect(items.slice(0, reaction.length).map((i) => (i.kind === 'line' ? i.id : ''))).toEqual(
        reaction.map((l) => l.id),
      );
      expect(items.slice(reaction.length, -1).map((i) => (i.kind === 'line' ? i.id : ''))).toEqual(
        story.map((l) => l.id),
      );
      const card = items.at(-1)!;
      expect(card).toEqual({ kind: 'digit', position: 1, digit: '7', slots });
    }
  });

  it('the story follows the stage, not the game, and a game without a reaction skips straight to it', () => {
    const a = itemsForStageCompletion(script, 'G2', 'C3', 3, '4', slots)
      .filter((i) => i.kind === 'line')
      .slice(2);
    const b = itemsForStageCompletion(script, 'G6', 'C3', 3, '4', slots)
      .filter((i) => i.kind === 'line')
      .slice(2);
    expect(a).toEqual(b);
    const none = itemsForStageCompletion(script, 'G99', 'C3', 3, '4', slots);
    expect(
      none.filter((i) => i.kind === 'line').map((i) => (i.kind === 'line' ? i.id : '')),
    ).toEqual(getSection(script, 'c3_complete').map((l) => l.id));
  });

  it('the digit card carries whatever the controller passes and the module holds no digits', () => {
    const x = itemsForStageCompletion(script, 'G1', 'C2', 2, '9', ['1', '9', '?', '?']).at(-1);
    const y = itemsForStageCompletion(script, 'G1', 'C2', 2, '3', ['1', '3', '?', '?']).at(-1);
    expect(x).toEqual({ kind: 'digit', position: 2, digit: '9', slots: ['1', '9', '?', '?'] });
    expect(y).toEqual({ kind: 'digit', position: 2, digit: '3', slots: ['1', '3', '?', '?'] });
  });

  it("replaying a completed stage's story has no reaction and awards nothing (pure data)", () => {
    const items = itemsForStageStory(script, 'C4', 4, '2', ['7', '3', '1', '2']);
    expect(items.slice(0, -1).map((i) => (i.kind === 'line' ? i.id : ''))).toEqual(
      getSection(script, 'c4_complete').map((l) => l.id),
    );
    expect(items.at(-1)).toEqual({
      kind: 'digit',
      position: 4,
      digit: '2',
      slots: ['7', '3', '1', '2'],
    });
  });

  it('intro, pin_entry, pin_success and ending are their sections in order', () => {
    expect(itemsForIntro(script).map((i) => (i.kind === 'line' ? i.id : ''))).toEqual(
      getSection(script, 'intro').map((l) => l.id),
    );
    for (const id of ['pin_entry', 'pin_success', 'ending']) {
      expect(itemsForSection(script, id).map((i) => (i.kind === 'line' ? i.id : ''))).toEqual(
        getSection(script, id).map((l) => l.id),
      );
    }
  });
});
