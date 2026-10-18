// Tests for the audio engine with a mocked backend (no real Web Audio). Run from the repo
// root with the Vitest installed in chicken-cross/ (the root project has no test runner):
//   ./chicken-cross/node_modules/.bin/vitest run src/audio
import { describe, expect, it } from "vitest";
import {
  C1_BARS,
  C1_BPM,
  CROSSFADE_MS,
  MUSIC_GAIN,
  barSeconds,
  computeLoopPoints,
  createAudioEngine,
  detectEdgeSilence,
  trackForHub,
  trackForMinigame,
  trackForScene,
  type AudioBackend,
  type AudioBufferLike,
  type BufferSourceLike,
  type GainLike,
  type TrackManifest,
} from "./engine";

// ---- Fake backend ---------------------------------------------------------------

interface FakeSource extends BufferSourceLike {
  startedAt: number | null;
  startOffset: number;
  stoppedAt: number | null;
  key: string;
}

interface FakeGain extends GainLike {
  ramps: Array<{ value: number; endTime: number }>;
  setValues: Array<{ value: number; time: number }>;
}

function makeBuffer(seconds: number, leadingSilence = 0, trailingSilence = 0, sampleRate = 48000): AudioBufferLike {
  const length = Math.round(seconds * sampleRate);
  const data = new Float32Array(length);
  const lead = Math.round(leadingSilence * sampleRate);
  const trail = Math.round(trailingSilence * sampleRate);
  for (let i = lead; i < length - trail; i++) data[i] = 0.5 * Math.sin(i / 7);
  return {
    duration: seconds,
    sampleRate,
    length,
    numberOfChannels: 1,
    getChannelData: () => data,
  };
}

function createFakeBackend(
  options: { failUrls?: string[]; buffers?: Record<string, AudioBufferLike>; outputLatency?: number } = {},
) {
  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  let now = 10; // the AudioContext clock
  let state: "suspended" | "running" | "closed" = "suspended";
  let resumes = 0;
  const bufferByUrl = options.buffers ?? {};

  const backend: AudioBackend = {
    createContext() {
      return {
        get currentTime() {
          return now;
        },
        get state() {
          return state;
        },
        outputLatency: options.outputLatency,
        async resume() {
          resumes++;
          state = "running";
        },
        async close() {
          state = "closed";
        },
        async decodeAudioData(data: ArrayBuffer) {
          const url = new TextDecoder().decode(data);
          return bufferByUrl[url] ?? makeBuffer(7.44);
        },
        createGain(): GainLike {
          const g: FakeGain = {
            value: 1,
            ramps: [],
            setValues: [],
            connect() {},
            disconnect() {},
            setValueAtTime(value: number, time: number) {
              g.value = value;
              g.setValues.push({ value, time });
            },
            linearRampToValueAtTime(value: number, endTime: number) {
              g.value = value;
              g.ramps.push({ value, endTime });
            },
            cancelScheduledValues() {},
          };
          gains.push(g);
          return g;
        },
        createBufferSource(): BufferSourceLike {
          const s: FakeSource = {
            key: "",
            buffer: null,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            startedAt: null,
            startOffset: 0,
            stoppedAt: null,
            onended: null,
            connect() {},
            disconnect() {},
            start(when = now, offset = 0) {
              s.startedAt = when;
              s.startOffset = offset;
            },
            stop(when = now) {
              s.stoppedAt = when;
            },
          };
          sources.push(s);
          return s;
        },
      };
    },
    async fetchArrayBuffer(url: string) {
      if (options.failUrls?.includes(url)) throw new Error(`404 ${url}`);
      return new TextEncoder().encode(url).buffer as ArrayBuffer;
    },
  };

  return {
    backend,
    sources,
    gains,
    get resumes() {
      return resumes;
    },
    advance(seconds: number) {
      now += seconds;
      // Fire ended callbacks for sources whose scheduled stop has passed.
      for (const s of sources) {
        if (s.stoppedAt !== null && s.stoppedAt <= now && s.onended) {
          const cb = s.onended;
          s.onended = null;
          cb();
        }
      }
    },
    now: () => now,
  };
}

const MANIFEST: TrackManifest = {
  menu: { url: "menu.mp3", kind: "music", loop: true },
  // Stage C1: the drums track, just looped on whole bars.
  c1: { url: "c1.mp3", kind: "music", loop: true, bpm: C1_BPM, bars: C1_BARS },
  // G4: the drums track once as an intro, then the no-drums loop.
  g4: { url: "c1.mp3", kind: "music", loop: false, intro: true, bpm: C1_BPM, bars: C1_BARS, handoffTo: "c1_loop" },
  c1_loop: { url: "c1nd.mp3", kind: "music", loop: true, bpm: C1_BPM, bars: C1_BARS },
  c2: { url: "c2.mp3", kind: "music", loop: true },
  c3: { url: "c3.mp3", kind: "music", loop: true },
  c4: { url: "c4.mp3", kind: "music", loop: true },
  boss: { url: "creepy.mp3", kind: "music", loop: true },
  victory: { url: "victory.mp3", kind: "sfx", loop: false },
};

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function readyEngine(options: Parameters<typeof createFakeBackend>[0] = {}) {
  const fake = createFakeBackend(options);
  const engine = createAudioEngine(fake.backend, MANIFEST);
  await engine.preload();
  return { fake, engine };
}

// ---- Scene mapping --------------------------------------------------------------

describe("scene to track mapping", () => {
  it("maps menu, stages, end stage and boss", () => {
    expect(trackForScene({ kind: "menu" })).toBe("menu");
    expect(trackForScene({ kind: "stage", stage: "C1" })).toBe("c1");
    expect(trackForScene({ kind: "stage", stage: "C2" })).toBe("c2");
    expect(trackForScene({ kind: "stage", stage: "C3" })).toBe("c3");
    expect(trackForScene({ kind: "stage", stage: "C4" })).toBe("c4");
    expect(trackForScene({ kind: "end" })).toBe("c4");
    expect(trackForScene({ kind: "boss" })).toBe("boss");
  });

  it("the hub plays the next stage to complete, and c4 once all are done", () => {
    const none = { C1: false, C2: false, C3: false, C4: false };
    expect(trackForHub(none)).toBe("c1");
    expect(trackForHub({ ...none, C1: true })).toBe("c2");
    expect(trackForHub({ ...none, C1: true, C2: true })).toBe("c3");
    expect(trackForHub({ ...none, C1: true, C2: true, C3: true })).toBe("c4");
    expect(trackForHub({ C1: true, C2: true, C3: true, C4: true })).toBe("c4");
    expect(trackForScene({ kind: "hub", completed: { ...none, C1: true } })).toBe("c2");
  });

  it("a minigame with its own track overrides the stage track; every other game follows the stage", () => {
    const overrides = { G4: "g4" };
    expect(trackForMinigame("G4", { kind: "stage", stage: "C1" }, overrides)).toBe("g4");
    expect(trackForMinigame("G4", { kind: "stage", stage: "C3" }, overrides)).toBe("g4");
    expect(trackForMinigame("G2", { kind: "stage", stage: "C1" }, overrides)).toBe("c1");
    expect(trackForMinigame("G1", { kind: "stage", stage: "C2" }, overrides)).toBe("c2");
    expect(trackForMinigame("E2", { kind: "end" }, overrides)).toBe("c4");
    expect(trackForMinigame("G4", { kind: "stage", stage: "C1" })).toBe("c1");
  });
});

// ---- Loop points -----------------------------------------------------------------

describe("silence detection and loop points", () => {
  it("detects leading and trailing near-silence", () => {
    const buffer = makeBuffer(7.44, 0.022, 0.031);
    const edges = detectEdgeSilence(buffer);
    expect(edges.leading).toBeCloseTo(0.022, 2);
    expect(edges.trailing).toBeCloseTo(0.031, 2);
  });

  it("snaps the loop to whole bars at 130 BPM", () => {
    expect(barSeconds(C1_BPM)).toBeCloseTo((60 / 130) * 4, 6);
    const buffer = makeBuffer(7.44, 0.0, 0.031);
    const points = computeLoopPoints(buffer, { bpm: C1_BPM, bars: C1_BARS });
    expect(points.loopStart).toBeCloseTo(0, 2);
    expect(points.loopEnd - points.loopStart).toBeCloseTo(4 * barSeconds(C1_BPM), 6);
    expect(points.loopEnd).toBeLessThanOrEqual(buffer.duration);
  });

  it("without a BPM the loop spans the audible part", () => {
    const buffer = makeBuffer(10.728, 0.0, 0.039);
    const points = computeLoopPoints(buffer, {});
    expect(points.loopStart).toBeCloseTo(0, 2);
    expect(points.loopEnd).toBeCloseTo(10.728 - 0.039, 2);
  });
});

// ---- Engine behaviour ------------------------------------------------------------------

describe("engine: unlock, stage C1 and the G4 handoff", () => {
  it("does not start anything before the first input, then starts the pending track", async () => {
    const { fake, engine } = await readyEngine();
    engine.playMusic("c2");
    await flush();
    expect(fake.sources.filter((s) => s.startedAt !== null)).toHaveLength(0);
    engine.unlock();
    await flush();
    expect(fake.resumes).toBe(1);
    const started = fake.sources.filter((s) => s.startedAt !== null);
    expect(started).toHaveLength(1);
    expect(started[0]!.loop).toBe(true);
    expect(engine.currentTrack()).toBe("c2");
  });

  it("stage C1 with any non-G4 game just loops c1 and never schedules the no-drums track", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic(trackForMinigame("G2", { kind: "stage", stage: "C1" }, { G4: "g4" }));
    await flush();
    const started = fake.sources.filter((s) => s.startedAt !== null);
    expect(started).toHaveLength(1);
    expect(started[0]!.loop).toBe(true);
    expect(started[0]!.stoppedAt).toBeNull();
    expect(started[0]!.loopEnd - started[0]!.loopStart).toBeCloseTo(C1_BARS * barSeconds(C1_BPM), 6);
    expect(engine.currentTrack()).toBe("c1");
    fake.advance(60);
    expect(fake.sources.filter((s) => s.startedAt !== null)).toHaveLength(1);
  });

  it("G4 in any stage plays the intro once and schedules the no-drums loop at the intro's exact end", async () => {
    for (const stage of ["C1", "C3"] as const) {
      const { fake, engine } = await readyEngine();
      engine.unlock();
      engine.playMusic(trackForMinigame("G4", { kind: "stage", stage }, { G4: "g4" }));
      await flush();
      const started = fake.sources.filter((s) => s.startedAt !== null);
      expect(started).toHaveLength(2);
      const [intro, loop] = started;
      expect(intro!.loop).toBe(false);
      expect(loop!.loop).toBe(true);
      const handoff = intro!.startedAt! + C1_BARS * barSeconds(C1_BPM);
      expect(intro!.stoppedAt).toBeCloseTo(handoff, 9);
      expect(loop!.startedAt).toBeCloseTo(handoff, 9);
      expect(loop!.loopEnd - loop!.loopStart).toBeCloseTo(C1_BARS * barSeconds(C1_BPM), 6);
      expect(engine.currentTrack()).toBe("g4");
    }
  });

  it("a G4 retry never restarts the music or replays the intro", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("g4");
    await flush();
    fake.advance(20); // well past the intro: the no-drums loop is playing
    engine.playMusic("g4"); // the controller restarts the minigame, not the music
    engine.playMusic("g4");
    await flush();
    expect(fake.sources.filter((s) => s.startedAt !== null)).toHaveLength(2);
    expect(engine.currentTrack()).toBe("g4");
    expect(engine.activeTracks()).toEqual(["g4"]);
  });

  it("leaving G4 crossfades back to the stage's own track", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("g4");
    await flush();
    fake.advance(20);
    const t = fake.now();
    engine.playMusic(trackForScene({ kind: "stage", stage: "C1" }));
    await flush();
    expect(engine.activeTracks().sort()).toEqual(["c1", "g4"]);
    const fade = CROSSFADE_MS / 1000;
    const g4Loop = fake.sources.filter((s) => s.startedAt !== null)[1]!;
    expect(g4Loop.stoppedAt).toBeGreaterThanOrEqual(t + fade);
    fake.advance(fade + 0.1);
    expect(engine.activeTracks()).toEqual(["c1"]);
    expect(engine.currentTrack()).toBe("c1");
    const c1 = fake.sources.filter((s) => s.startedAt !== null)[2]!;
    expect(c1.loop).toBe(true);
  });
});

describe("engine: beat clock", () => {
  const beat = barSeconds(C1_BPM) / 4;

  it("is null before any music plays and for tracks without a known BPM", async () => {
    const { engine } = await readyEngine();
    expect(engine.getBeatClock()).toBeNull();
    engine.unlock();
    engine.playMusic("c2");
    await flush();
    expect(engine.getBeatClock()).toBeNull();
  });

  it("counts beats from the first downbeat of the G4 intro, continuously across the no-drums handoff", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("g4");
    await flush();
    const intro = fake.sources.filter((s) => s.startedAt !== null)[0]!;
    const t0 = intro.startedAt!;
    expect(engine.getBeatClock()).toBeCloseTo((fake.now() - t0) / beat, 9);
    fake.advance(1);
    expect(engine.getBeatClock()).toBeCloseTo((fake.now() - t0) / beat, 9);
    // Past the handoff (4 bars = 16 beats) the count keeps running on the same grid.
    fake.advance(10);
    expect(engine.getBeatClock()).toBeCloseTo((fake.now() - t0) / beat, 9);
    expect(engine.getBeatClock()!).toBeGreaterThan(C1_BARS * 4);
    // A retry (same track again) does not move the clock's origin.
    engine.playMusic("g4");
    await flush();
    expect(engine.getBeatClock()).toBeCloseTo((fake.now() - t0) / beat, 9);
  });

  it("compensates for the context's output latency when it is reported", async () => {
    const { fake, engine } = await readyEngine({ outputLatency: 0.1 });
    engine.unlock();
    engine.playMusic("g4");
    await flush();
    fake.advance(2);
    const t0 = fake.sources.filter((s) => s.startedAt !== null)[0]!.startedAt!;
    expect(engine.getBeatClock()).toBeCloseTo((fake.now() - 0.1 - t0) / beat, 9);
  });

  it("follows the incoming track during a crossfade and is null once music stops", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("g4");
    await flush();
    fake.advance(5);
    engine.playMusic("c1");
    await flush();
    const c1 = fake.sources.filter((s) => s.startedAt !== null)[2]!;
    expect(engine.getBeatClock()).toBeCloseTo((fake.now() - c1.startedAt!) / beat, 9);
    engine.stopMusic();
    expect(engine.getBeatClock()).toBeNull();
  });
});

describe("engine: switching tracks", () => {
  it("never restarts the track that is already playing", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("c2");
    await flush();
    engine.playMusic("c2");
    engine.playMusic("c2");
    await flush();
    expect(fake.sources.filter((s) => s.startedAt !== null)).toHaveLength(1);
  });

  it("end stage shares c4 with stage C4, so C4 -> E-game does not restart", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic(trackForScene({ kind: "stage", stage: "C4" }));
    await flush();
    engine.playMusic(trackForScene({ kind: "end" }));
    await flush();
    expect(fake.sources.filter((s) => s.startedAt !== null)).toHaveLength(1);
  });

  it("crossfades with a short ramp and leaves exactly one active track", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("c2");
    await flush();
    const t = fake.now();
    engine.playMusic("c3");
    await flush();
    expect(engine.activeTracks().sort()).toEqual(["c2", "c3"]);
    const fade = CROSSFADE_MS / 1000;
    const old = fake.sources.filter((s) => s.startedAt !== null)[0]!;
    expect(old.stoppedAt).toBeGreaterThanOrEqual(t + fade);
    // The outgoing voice ramps to 0 and the incoming voice ramps to full by t + fade.
    const rampDown = fake.gains.find((g) => g.ramps.some((r) => r.value === 0 && Math.abs(r.endTime - (t + fade)) < 1e-6));
    const rampUp = fake.gains.find((g) => g.ramps.some((r) => r.value === 1 && Math.abs(r.endTime - (t + fade)) < 1e-6));
    expect(rampDown).toBeTruthy();
    expect(rampUp).toBeTruthy();
    fake.advance(fade + 0.1);
    expect(engine.activeTracks()).toEqual(["c3"]);
    expect(engine.currentTrack()).toBe("c3");
  });

  it("stopMusic fades out and leaves no active track; a new run plays the G4 intro again", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("g4");
    await flush();
    fake.advance(30);
    engine.resetRun();
    await flush();
    fake.advance(CROSSFADE_MS / 1000 + 0.1);
    expect(engine.activeTracks()).toEqual([]);
    engine.playMusic("g4");
    await flush();
    const intros = fake.sources.filter((s) => s.startedAt !== null && !s.loop);
    expect(intros).toHaveLength(2);
  });

  it("ducking lowers the music bus without stopping the track", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("c3");
    await flush();
    engine.duckMusic(0.25);
    const bus = fake.gains.find((g) => g.ramps.some((r) => Math.abs(r.value - MUSIC_GAIN * 0.25) < 1e-9));
    expect(bus).toBeTruthy();
    expect(engine.activeTracks()).toEqual(["c3"]);
  });
});

describe("engine: sound effects", () => {
  it("plays a one-shot without affecting the music track", async () => {
    const { fake, engine } = await readyEngine();
    engine.unlock();
    engine.playMusic("c4");
    await flush();
    engine.playSfx("victory");
    await flush();
    const started = fake.sources.filter((s) => s.startedAt !== null);
    expect(started).toHaveLength(2);
    expect(started[1]!.loop).toBe(false);
    expect(engine.currentTrack()).toBe("c4");
  });
});

describe("engine: failures never crash the game", () => {
  it("a failed load leaves the track unavailable and play calls are silent no-ops", async () => {
    const { fake, engine } = await readyEngine({ failUrls: ["c2.mp3", "victory.mp3"] });
    engine.unlock();
    engine.playMusic("c2");
    engine.playSfx("victory");
    await flush();
    expect(engine.isAvailable("c2")).toBe(false);
    expect(engine.isAvailable("c3")).toBe(true);
    expect(fake.sources.filter((s) => s.startedAt !== null)).toHaveLength(0);
    engine.playMusic("c3");
    await flush();
    expect(engine.currentTrack()).toBe("c3");
  });

  it("an unknown key and a backend without audio are tolerated", async () => {
    const broken: AudioBackend = {
      createContext() {
        throw new Error("no audio");
      },
      async fetchArrayBuffer() {
        throw new Error("offline");
      },
    };
    const engine = createAudioEngine(broken, MANIFEST);
    await engine.preload();
    engine.unlock();
    engine.playMusic("c1");
    engine.playMusic("nope");
    engine.playSfx("nope");
    engine.duckMusic(0.5);
    engine.dispose();
    expect(engine.currentTrack()).toBeNull();
  });
});
