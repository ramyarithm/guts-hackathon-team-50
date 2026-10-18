// Credits scene: data, two-button navigation and the audio flow around it (no DOM). Run from
// the repo root with the Vitest installed in chicken-cross/:
//   ./chicken-cross/node_modules/.bin/vitest run src/scenes/credits
import { describe, expect, it } from 'vitest';
import {
  createAudioEngine,
  type AudioBackend,
  type AudioBufferLike,
  type BufferSourceLike,
  type GainLike,
  type TrackManifest,
} from '../../audio/engine';
import {
  CREDITS,
  CREDITS_EVENT,
  CREDITS_OUTRO,
  CREDITS_SUBTITLE,
  CREDITS_TITLE,
  LINKEDIN_PREFIX,
  isAllowedUrl,
  surnameOf,
} from './credits';
import { enterCreditsAudio, enterEndingAudio, leaveCreditsToMenuAudio } from './flow';
import { OPEN_GUARD_MS, createCredits, labelsFor, type ControlLabels } from './logic';

// ---- Data -----------------------------------------------------------------------------

describe('CREDITS data', () => {
  it('has the five team members in alphabetical order by surname', () => {
    expect(CREDITS).toHaveLength(5);
    const surnames = CREDITS.map((p) => surnameOf(p.name));
    const sorted = [...surnames].sort((a, b) => a.localeCompare(b, 'en'));
    expect(surnames).toEqual(sorted);
    expect(surnames).toEqual(['Alkhulaifi', 'Fakouri', 'Ghasemyani', 'Pirzadeh', 'Vazirinejad']);
  });

  it('links every person to a LinkedIn profile URL', () => {
    expect(LINKEDIN_PREFIX).toBe('https://www.linkedin.com/');
    for (const p of CREDITS) {
      expect(p.url.startsWith(LINKEDIN_PREFIX)).toBe(true);
      expect(isAllowedUrl(p.url)).toBe(true);
      expect(p.name.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(CREDITS.map((p) => p.url)).size).toBe(5);
  });

  it('only allows LinkedIn URLs to be opened', () => {
    expect(isAllowedUrl('https://www.linkedin.com/in/someone/')).toBe(true);
    expect(isAllowedUrl('http://www.linkedin.com/in/someone/')).toBe(false);
    expect(isAllowedUrl('https://linkedin.com/in/someone/')).toBe(false);
    expect(isAllowedUrl('https://www.linkedin.com.evil.example/in/x')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
  });

  it('has the title, team line, outro and the event name that already exists in the repo', () => {
    expect(CREDITS_TITLE).toBe('DEAD SIGNAL');
    expect(CREDITS_SUBTITLE).toBe('Made by Team 50');
    expect(CREDITS_OUTRO).toBe('Thanks for playing.');
    expect(CREDITS_EVENT.includes('GUTS Hackathon')).toBe(true);
  });
});

// ---- Navigation -----------------------------------------------------------------------

function harness() {
  const opened: string[] = [];
  const labels: ControlLabels[] = [];
  let menus = 0;
  let now = 0;
  const credits = createCredits({
    people: CREDITS,
    openUrl: (url) => {
      opened.push(url);
      return true;
    },
    onMainMenu: () => menus++,
    onLabels: (l) => labels.push(l),
    now: () => now,
  });
  return {
    credits,
    opened,
    labels,
    menus: () => menus,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe('credits navigation', () => {
  it('starts on the first person with Next / Open LinkedIn labels', () => {
    const { credits, labels } = harness();
    expect(credits.state.index).toBe(0);
    expect(credits.state.menuIndex).toBe(5);
    expect(labels.at(-1)).toEqual({ left: 'Next', right: 'Open LinkedIn' });
    expect(labelsFor({ index: 5, menuIndex: 5, done: false })).toEqual({
      left: 'Next',
      right: 'Main menu',
    });
    expect(labelsFor({ index: 0, menuIndex: 5, done: true })).toEqual({ left: '—', right: '—' });
  });

  it('LEFT cycles through every person, then Main menu, then wraps', () => {
    const { credits, labels } = harness();
    const seen: number[] = [credits.state.index];
    for (let i = 0; i < 6; i++) {
      credits.press('LEFT');
      seen.push(credits.state.index);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 0]);
    credits.press('LEFT');
    credits.press('LEFT');
    credits.press('LEFT');
    credits.press('LEFT');
    credits.press('LEFT');
    expect(credits.state.index).toBe(5);
    expect(labels.at(-1)).toEqual({ left: 'Next', right: 'Main menu' });
  });

  it("RIGHT opens the highlighted person's own URL, and a double press opens one tab", () => {
    const { credits, opened, menus, tick } = harness();
    credits.press('LEFT');
    credits.press('LEFT'); // third person
    expect(credits.press('RIGHT')).toBe('opened');
    expect(opened).toEqual([CREDITS[2]!.url]);
    expect(credits.press('RIGHT')).toBe('ignored'); // double press
    expect(opened).toHaveLength(1);
    tick(OPEN_GUARD_MS + 1);
    expect(credits.press('RIGHT')).toBe('opened');
    expect(opened).toHaveLength(2);
    // Moving on and opening another person is never blocked by the guard.
    credits.press('LEFT');
    expect(credits.press('RIGHT')).toBe('opened');
    expect(opened.at(-1)).toBe(CREDITS[3]!.url);
    expect(menus()).toBe(0);
  });

  it('highlight(i) jumps straight to a row (a click or tap) and RIGHT acts on it', () => {
    const { credits, opened } = harness();
    credits.highlight(4);
    expect(credits.state.index).toBe(4);
    credits.press('RIGHT');
    expect(opened).toEqual([CREDITS[4]!.url]);
    credits.highlight(99); // out of range: ignored
    expect(credits.state.index).toBe(4);
  });

  it('RIGHT on Main menu leaves exactly once and then ignores every press', () => {
    const { credits, opened, menus, labels } = harness();
    credits.highlight(credits.state.menuIndex);
    expect(credits.press('RIGHT')).toBe('menu');
    expect(credits.press('RIGHT')).toBe('ignored');
    expect(credits.press('LEFT')).toBe('ignored');
    expect(menus()).toBe(1);
    expect(opened).toHaveLength(0);
    expect(labels.at(-1)).toEqual({ left: '—', right: '—' });
    expect(credits.state.done).toBe(true);
  });

  it('never opens a URL that is not a LinkedIn profile, even if the data were edited', () => {
    const opened: string[] = [];
    const credits = createCredits({
      people: [{ name: 'Test Person', url: 'https://example.com/not-linkedin' }],
      openUrl: (url) => {
        opened.push(url);
        return true;
      },
      onMainMenu: () => {},
    });
    expect(credits.press('RIGHT')).toBe('ignored');
    expect(opened).toEqual([]);
  });

  it('dispose makes every press a no-op', () => {
    const { credits, opened, menus } = harness();
    credits.dispose();
    expect(credits.press('RIGHT')).toBe('ignored');
    credits.highlight(5);
    expect(credits.press('RIGHT')).toBe('ignored');
    expect(opened).toHaveLength(0);
    expect(menus()).toBe(0);
  });
});

// ---- Audio flow, against the real engine with a fake backend ----------------------------

interface FakeSource extends BufferSourceLike {
  startedAt: number | null;
}

function fakeBackend() {
  const sources: FakeSource[] = [];
  let state: 'suspended' | 'running' | 'closed' = 'suspended';
  const buffer = (): AudioBufferLike => {
    const data = new Float32Array(48000);
    for (let i = 0; i < data.length; i++) data[i] = 0.5 * Math.sin(i / 7);
    return {
      duration: 1,
      sampleRate: 48000,
      length: 48000,
      numberOfChannels: 1,
      getChannelData: () => data,
    };
  };
  const backend: AudioBackend = {
    createContext() {
      return {
        currentTime: 10,
        get state() {
          return state;
        },
        async resume() {
          state = 'running';
        },
        async close() {
          state = 'closed';
        },
        async decodeAudioData() {
          return buffer();
        },
        createGain(): GainLike {
          return {
            value: 1,
            connect() {},
            disconnect() {},
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            cancelScheduledValues() {},
          };
        },
        createBufferSource(): BufferSourceLike {
          const s: FakeSource = {
            buffer: null,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            startedAt: null,
            onended: null,
            connect() {},
            disconnect() {},
            start(when = 10) {
              s.startedAt = when;
            },
            stop() {},
          };
          sources.push(s);
          return s;
        },
      };
    },
    async fetchArrayBuffer(url: string) {
      return new TextEncoder().encode(url).buffer as ArrayBuffer;
    },
  };
  return { backend, started: () => sources.filter((s) => s.startedAt !== null) };
}

const MANIFEST: TrackManifest = {
  menu: { url: 'menu.mp3', kind: 'music', loop: true },
  c4: { url: 'c4.mp3', kind: 'music', loop: true },
  boss: { url: 'creepy.mp3', kind: 'music', loop: true },
  victory: { url: 'victory.mp3', kind: 'sfx', loop: false },
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function readyEngine() {
  const fake = fakeBackend();
  const engine = createAudioEngine(fake.backend, MANIFEST);
  await engine.preload();
  engine.unlock();
  await flush();
  return { fake, engine };
}

describe('credits audio flow', () => {
  it('after a win the credits play no music, and Main menu starts the menu track', async () => {
    const { fake, engine } = await readyEngine();
    engine.playMusic('boss');
    await flush();
    expect(engine.currentTrack()).toBe('boss');
    enterEndingAudio(engine); // the ending: silence, then the victory sound once
    await flush();
    expect(engine.currentTrack()).toBe(null);
    const musicBefore = fake.started().filter((s) => s.loop).length;
    enterCreditsAudio(engine, 'win'); // the ending dialogue finished: credits
    await flush();
    expect(engine.currentTrack()).toBe(null);
    expect(fake.started().filter((s) => s.loop)).toHaveLength(musicBefore); // nothing new looping
    leaveCreditsToMenuAudio(engine);
    await flush();
    expect(engine.currentTrack()).toBe('menu');
  });

  it('menu → credits → menu keeps the menu music playing without restarting it', async () => {
    const { fake, engine } = await readyEngine();
    engine.playMusic('menu');
    await flush();
    expect(fake.started().filter((s) => s.loop)).toHaveLength(1);
    enterCreditsAudio(engine, 'menu');
    await flush();
    expect(engine.currentTrack()).toBe('menu');
    leaveCreditsToMenuAudio(engine);
    await flush();
    expect(engine.currentTrack()).toBe('menu');
    expect(fake.started().filter((s) => s.loop)).toHaveLength(1); // the same voice, never restarted
  });
});
