// Audio engine: music with crossfades, seamless loops, the G4 intro -> no-drums handoff,
// a beat clock for rhythm games and one-shot sound effects. Pure of DOM and Web Audio: everything goes through an
// injected AudioBackend so it can be tested with a fake. Nothing here ever throws into
// the game; audio failures only log once and the game continues silently.

// ---- Tuning (named constants; tune the loop points by ear) --------------------------

/** Master and bus gains. Music sits slightly under the effects. */
export const MASTER_GAIN = 0.9;
export const MUSIC_GAIN = 0.5;
export const SFX_GAIN = 0.8;
/** Crossfade between music tracks, and fade used for duck/stop. */
export const CROSSFADE_MS = 800;
/** Fade used by the global music on/off toggle. */
export const MUSIC_TOGGLE_FADE_MS = 150;
/** Music level while the victory sting plays (fraction of MUSIC_GAIN). */
export const MUSIC_DUCK_FOR_VICTORY = 0.2;
/** Samples with |value| below this are "silence" when trimming encoder padding (~ -48 dB). */
export const SILENCE_THRESHOLD = 0.004;
/**
 * The C1 music is 130 BPM in 4/4: one bar = 4 * 60 / 130 = 1.846 s. Both C1 files are
 * 7.44 s with ~30 ms of trailing encoder silence, i.e. 4 bars (7.385 s) plus padding.
 * Stage C1 loops `c1.mp3` every C1_BARS bars. For G4 the same file plays once as an intro,
 * exactly C1_BARS bars from its first non-silent sample, then the no-drums loop starts on
 * that sample and loops every C1_BARS bars. Nudge the offsets below if the join is audible.
 */
export const C1_BPM = 130;
export const C1_BARS = 4;
export const C1_LOOP_START_OFFSET_MS = 0;
export const C1_LOOP_END_OFFSET_MS = 0;
/** Lead time given to the clock when scheduling a start, so it never lands in the past. */
const SCHEDULE_LEAD_S = 0.03;

// ---- Types ------------------------------------------------------------------------

export type StageId = "C1" | "C2" | "C3" | "C4";

export type Scene =
  | { kind: "menu" }
  | { kind: "stage"; stage: StageId }
  | { kind: "hub"; completed: Record<StageId, boolean> }
  | { kind: "end" }
  | { kind: "boss" };

export interface TrackDef {
  url: string;
  kind: "music" | "sfx";
  loop: boolean;
  /** Plays once, then hands off to `handoffTo` on the exact end sample. */
  intro?: boolean;
  handoffTo?: string;
  /** When known, loop/handoff points snap to whole bars. */
  bpm?: number;
  bars?: number;
  loopStartOffsetMs?: number;
  loopEndOffsetMs?: number;
}

export type TrackManifest = Record<string, TrackDef>;

export interface AudioBufferLike {
  readonly duration: number;
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export type NodeLike = object;

export interface GainLike {
  value: number;
  connect(target: NodeLike): void;
  disconnect(): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  cancelScheduledValues(time: number): void;
}

export interface BufferSourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  connect(target: NodeLike): void;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: "suspended" | "running" | "closed";
  readonly destination?: NodeLike;
  /** Seconds between a scheduled time on this clock and the sound leaving the speakers. */
  readonly outputLatency?: number;
  resume(): Promise<void>;
  close(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  createGain(): GainLike;
  createBufferSource(): BufferSourceLike;
}

export interface AudioBackend {
  createContext(): AudioContextLike;
  fetchArrayBuffer(url: string): Promise<ArrayBuffer>;
}

export interface LoopPoints {
  loopStart: number;
  loopEnd: number;
  bars: number | null;
}

export interface AudioEngineOptions {
  /** Initial music on/off setting (default on), e.g. restored from storage. */
  musicEnabled?: boolean;
  /** Called whenever the setting changes, e.g. to save it. */
  onMusicEnabledChange?: (enabled: boolean) => void;
}

export interface AudioEngine {
  /** Create the context and decode every track. Safe to call once at startup. */
  preload(): Promise<void>;
  /**
   * Resume the context and start the pending track. Call it when a scene opens (it may
   * succeed if the page already had a gesture) and on every button press: while the
   * browser's autoplay policy keeps the context suspended, each call retries resume().
   */
  unlock(): void;
  /** Whether sound can be heard: "suspended" means autoplay is blocked until a gesture. */
  outputState(): "running" | "suspended" | "unavailable";
  /** Switch music; a no-op if that track is already playing. */
  playMusic(key: string): void;
  /**
   * Fade the music out and stop every music source, including ones only scheduled for
   * later (a pending intro -> loop handoff); cancels a pending or in-flight track too.
   * The next playMusic starts fresh (G4 plays its intro again).
   */
  stopMusic(): void;
  /** Alias of stopMusic for a new playthrough. */
  resetRun(): void;
  /** Play a one-shot effect. */
  playSfx(key: string): void;
  /** Scale the music bus (1 = normal, 0 = silent) with a short ramp. */
  duckMusic(factor: number, ms?: number): void;
  /** Silence the music while a minigame plays its own audio; restores afterwards. */
  setMusicSuppressed(suppressed: boolean): void;
  /**
   * Global music on/off for the whole session: mutes or unmutes the music bus only (sound
   * effects are unaffected) with a MUSIC_TOGGLE_FADE_MS fade. Tracks keep running
   * underneath, so turning music back on resumes the current scene's track in place.
   */
  setMusicEnabled(enabled: boolean): void;
  isMusicEnabled(): boolean;
  isAvailable(key: string): boolean;
  /**
   * Beats elapsed since the first downbeat of the current track (fractional), on the
   * AudioContext clock and corrected for the reported output latency, so it reflects what
   * the player hears. Continuous across an intro -> loop handoff. `null` when nothing is
   * playing, before unlock, or when the current track has no known BPM.
   */
  getBeatClock(): number | null;
  currentTrack(): string | null;
  /** Keys of tracks currently audible, including one fading out. */
  activeTracks(): string[];
  dispose(): void;
}

// ---- Scene mapping --------------------------------------------------------------

const STAGE_ORDER: StageId[] = ["C1", "C2", "C3", "C4"];
const STAGE_TRACK: Record<StageId, string> = { C1: "c1", C2: "c2", C3: "c3", C4: "c4" };

/** The hub plays the next stage still to complete; c4 once all four are done. */
export function trackForHub(completed: Record<StageId, boolean>): string {
  const next = STAGE_ORDER.find((s) => !completed[s]);
  return next ? STAGE_TRACK[next] : "c4";
}

export function trackForScene(scene: Scene): string {
  switch (scene.kind) {
    case "menu":
      return "menu";
    case "stage":
      return STAGE_TRACK[scene.stage];
    case "hub":
      return trackForHub(scene.completed);
    case "end":
      return "c4";
    case "boss":
      return "boss";
  }
}

/**
 * The track to play while `gameId` runs in `scene`: a minigame listed in `overrides`
 * (today only G4) brings its own music; every other game follows the scene.
 */
export function trackForMinigame(gameId: string, scene: Scene, overrides: Readonly<Record<string, string>> = {}): string {
  return overrides[gameId] ?? trackForScene(scene);
}

// ---- Loop point maths -----------------------------------------------------------------

export function barSeconds(bpm: number): number {
  return (60 / bpm) * 4;
}

/** Seconds of near-silence at the start and end of a decoded buffer (encoder padding). */
export function detectEdgeSilence(buffer: AudioBufferLike, threshold = SILENCE_THRESHOLD): { leading: number; trailing: number } {
  let first = buffer.length;
  let last = -1;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < first; i++) {
      if (Math.abs(data[i] ?? 0) > threshold) {
        first = i;
        break;
      }
    }
    for (let i = data.length - 1; i > last; i--) {
      if (Math.abs(data[i] ?? 0) > threshold) {
        last = i;
        break;
      }
    }
  }
  if (last < first) return { leading: 0, trailing: 0 };
  return { leading: first / buffer.sampleRate, trailing: (buffer.length - 1 - last) / buffer.sampleRate };
}

/**
 * Loop points for a buffer: start after the leading silence; end either on a whole number
 * of bars (when the BPM is known) or at the last audible sample.
 */
export function computeLoopPoints(
  buffer: AudioBufferLike,
  opts: { bpm?: number; bars?: number; loopStartOffsetMs?: number; loopEndOffsetMs?: number },
): LoopPoints {
  const edges = detectEdgeSilence(buffer);
  const audible = Math.max(0, buffer.duration - edges.leading - edges.trailing);
  let loopStart = edges.leading + (opts.loopStartOffsetMs ?? 0) / 1000;
  let loopEnd: number;
  let bars: number | null = null;
  if (opts.bpm) {
    const bar = barSeconds(opts.bpm);
    bars = opts.bars ?? Math.max(1, Math.round(audible / bar));
    loopEnd = edges.leading + bars * bar;
  } else {
    loopEnd = buffer.duration - edges.trailing;
  }
  loopEnd += (opts.loopEndOffsetMs ?? 0) / 1000;
  loopEnd = Math.min(buffer.duration, loopEnd);
  loopStart = Math.max(0, Math.min(loopStart, loopEnd - 0.01));
  return { loopStart, loopEnd, bars };
}

// ---- Engine -----------------------------------------------------------------------------

interface Loaded {
  buffer: AudioBufferLike;
  points: LoopPoints;
}

interface Voice {
  key: string;
  gain: GainLike;
  sources: BufferSourceLike[];
  fading: boolean;
  /** Context time of the track's first downbeat (its loopStart sample). */
  t0: number;
  bpm: number | null;
}

export function createAudioEngine(backend: AudioBackend, manifest: TrackManifest, options: AudioEngineOptions = {}): AudioEngine {
  let ctx: AudioContextLike | null = null;
  let master: GainLike | null = null;
  let musicBus: GainLike | null = null;
  let sfxBus: GainLike | null = null;
  const loaded = new Map<string, Loaded | null>();
  const loading = new Map<string, Promise<Loaded | null>>();
  /** Decoded buffers by URL: two keys may share one file (c1 / g4). */
  const decoding = new Map<string, Promise<AudioBufferLike>>();
  let unlocked = false;
  let disposed = false;
  let currentKey: string | null = null;
  let pendingKey: string | null = null;
  let generation = 0;
  let voices: Voice[] = [];
  let musicFactor = 1;
  let musicEnabled = options.musicEnabled ?? true;
  const warned = new Set<string>();

  /** The music bus level for the current duck/suppress factor and on/off setting. */
  const musicLevel = (): number => (musicEnabled ? MUSIC_GAIN * musicFactor : 0);

  const warn = (what: string, detail?: unknown): void => {
    if (warned.has(what)) return;
    warned.add(what);
    console.warn(`[audio] ${what}`, detail ?? "");
  };

  const ensureContext = (): AudioContextLike | null => {
    if (ctx || disposed) return ctx;
    try {
      ctx = backend.createContext();
      master = ctx.createGain();
      master.setValueAtTime(MASTER_GAIN, ctx.currentTime);
      master.connect(ctx.destination ?? {});
      musicBus = ctx.createGain();
      musicBus.setValueAtTime(musicLevel(), ctx.currentTime);
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.setValueAtTime(SFX_GAIN, ctx.currentTime);
      sfxBus.connect(master);
    } catch (error) {
      warn("audio unavailable; the game continues silently", error);
      ctx = null;
    }
    return ctx;
  };

  const load = (key: string): Promise<Loaded | null> => {
    const existing = loading.get(key);
    if (existing) return existing;
    const def = manifest[key];
    const c = ensureContext();
    const promise = (async (): Promise<Loaded | null> => {
      if (!def || !c) return null;
      try {
        let decode = decoding.get(def.url);
        if (!decode) {
          decode = backend.fetchArrayBuffer(def.url).then((data) => c.decodeAudioData(data));
          decoding.set(def.url, decode);
        }
        const buffer = await decode;
        const points = computeLoopPoints(buffer, {
          bpm: def.bpm,
          bars: def.bars,
          loopStartOffsetMs: def.loopStartOffsetMs,
          loopEndOffsetMs: def.loopEndOffsetMs,
        });
        return { buffer, points };
      } catch (error) {
        warn(`failed to load "${key}" (${def.url})`, error);
        return null;
      }
    })().then((result) => {
      loaded.set(key, result);
      return result;
    });
    loading.set(key, promise);
    return promise;
  };

  const rampGain = (gain: GainLike, to: number, ms: number): void => {
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(to, now + ms / 1000);
    } catch (error) {
      warn("gain ramp failed", error);
    }
  };

  const fadeOutVoice = (voice: Voice): void => {
    if (!ctx || voice.fading) return;
    voice.fading = true;
    const stopAt = ctx.currentTime + CROSSFADE_MS / 1000 + 0.01;
    rampGain(voice.gain, 0, CROSSFADE_MS);
    let remaining = voice.sources.length;
    const done = (): void => {
      remaining--;
      if (remaining <= 0) {
        voices = voices.filter((v) => v !== voice);
        try {
          voice.gain.disconnect();
        } catch {
          // ignore
        }
      }
    };
    for (const s of voice.sources) {
      s.onended = done;
      try {
        s.stop(stopAt);
      } catch {
        done();
      }
    }
  };

  const startVoice = async (key: string, gen: number): Promise<void> => {
    const def = manifest[key];
    if (!def || !ctx || !musicBus) return;
    // Don't create voices at all if music is disabled - avoids any brief audio blip
    if (!musicEnabled) return;
    const main = await load(key);
    const next = def.handoffTo ? await load(def.handoffTo) : null;
    if (gen !== generation || disposed || !ctx || !musicBus) return;
    if (!main) return;

    for (const v of voices) fadeOutVoice(v);
    const gain = ctx.createGain();
    gain.connect(musicBus);
    const now = ctx.currentTime;
    const fadingIn = voices.length > 0;
    gain.setValueAtTime(fadingIn ? 0 : 1, now);
    if (fadingIn) gain.linearRampToValueAtTime(1, now + CROSSFADE_MS / 1000);

    const t0 = now + SCHEDULE_LEAD_S;
    const voice: Voice = { key, gain, sources: [], fading: false, t0, bpm: def.bpm ?? null };
    try {
      if (def.intro && next) {
        // Intro once, then the loop starts on the exact end sample, on the context clock.
        const intro = ctx.createBufferSource();
        intro.buffer = main.buffer;
        intro.loop = false;
        intro.connect(gain);
        const handoff = t0 + (main.points.loopEnd - main.points.loopStart);
        intro.start(t0, main.points.loopStart);
        intro.stop(handoff);
        const loop = ctx.createBufferSource();
        loop.buffer = next.buffer;
        loop.loop = true;
        loop.loopStart = next.points.loopStart;
        loop.loopEnd = next.points.loopEnd;
        loop.connect(gain);
        loop.start(handoff, next.points.loopStart);
        voice.sources.push(intro, loop);
      } else {
        const src = ctx.createBufferSource();
        src.buffer = main.buffer;
        src.loop = def.loop;
        if (def.loop) {
          src.loopStart = main.points.loopStart;
          src.loopEnd = main.points.loopEnd;
        }
        src.connect(gain);
        src.start(t0, main.points.loopStart);
        voice.sources.push(src);
      }
    } catch (error) {
      warn(`could not start "${key}"`, error);
      return;
    }
    voices.push(voice);
  };

  const engine: AudioEngine = {
    async preload(): Promise<void> {
      if (!ensureContext()) return;
      await Promise.all(Object.keys(manifest).map((key) => load(key)));
    },

    unlock(): void {
      if (disposed) return;
      const c = ensureContext();
      if (!c) return;
      unlocked = true;
      
      // Resume context first if needed
      if (c.state !== "running") {
        try {
          void c.resume().catch((error) => warn("resume failed", error));
        } catch (error) {
          warn("resume failed", error);
        }
      }
      
      // Ensure musicBus is at the correct level before starting any voices.
      // Do this AFTER resume attempt so currentTime is advancing.
      // Cancel any scheduled values and set directly to handle the case where
      // musicEnabled was false at page load (localStorage) but context was
      // created with setValueAtTime at time 0 when suspended.
      if (musicBus) {
        try {
          musicBus.cancelScheduledValues(0);
          musicBus.value = musicLevel();
        } catch {
          // Fallback if direct assignment fails
          musicBus.setValueAtTime(musicLevel(), c.currentTime);
        }
      }
      
      if (pendingKey) {
        const key = pendingKey;
        pendingKey = null;
        void startVoice(key, generation);
      }
    },

    playMusic(key: string): void {
      if (disposed) return;
      if (!manifest[key]) {
        warn(`unknown track "${key}"`);
        return;
      }
      if (key === currentKey) return; // never restart what is already playing
      currentKey = key;
      generation++;
      if (!unlocked || !ctx) {
        pendingKey = key;
        return;
      }
      void startVoice(key, generation);
    },

    stopMusic(): void {
      currentKey = null;
      pendingKey = null;
      generation++;
      for (const v of voices) fadeOutVoice(v);
    },

    resetRun(): void {
      engine.stopMusic();
    },

    playSfx(key: string): void {
      if (disposed || !unlocked || !ctx || !sfxBus) return;
      const def = manifest[key];
      if (!def) {
        warn(`unknown sfx "${key}"`);
        return;
      }
      const c = ctx;
      const bus = sfxBus;
      void load(key).then((item) => {
        if (!item || disposed) return;
        try {
          const src = c.createBufferSource();
          src.buffer = item.buffer;
          src.loop = false;
          src.connect(bus);
          src.start(c.currentTime, item.points.loopStart);
        } catch (error) {
          warn(`could not play sfx "${key}"`, error);
        }
      });
    },

    duckMusic(factor: number, ms = CROSSFADE_MS): void {
      musicFactor = Math.max(0, Math.min(1, factor));
      if (!musicBus) return;
      rampGain(musicBus, musicLevel(), ms);
    },

    setMusicSuppressed(suppressed: boolean): void {
      engine.duckMusic(suppressed ? 0 : 1);
    },

    setMusicEnabled(enabled: boolean): void {
      if (enabled === musicEnabled) return;
      musicEnabled = enabled;
      if (musicBus) rampGain(musicBus, musicLevel(), MUSIC_TOGGLE_FADE_MS);
      // If music was just enabled and we have a track to play, start it now
      if (enabled && currentKey && unlocked && ctx && voices.length === 0) {
        void startVoice(currentKey, generation);
      }
      try {
        options.onMusicEnabledChange?.(enabled);
      } catch (error) {
        warn("could not save the music setting", error);
      }
    },

    isMusicEnabled(): boolean {
      return musicEnabled;
    },

    isAvailable(key: string): boolean {
      return Boolean(loaded.get(key));
    },

    outputState(): "running" | "suspended" | "unavailable" {
      if (!ctx || disposed) return "unavailable";
      return ctx.state === "running" ? "running" : "suspended";
    },

    getBeatClock(): number | null {
      if (!ctx || currentKey === null) return null;
      const voice = voices.find((v) => v.key === currentKey && !v.fading);
      if (!voice || voice.bpm === null) return null;
      const heardAt = ctx.currentTime - (ctx.outputLatency ?? 0);
      return (heardAt - voice.t0) / (60 / voice.bpm);
    },

    currentTrack(): string | null {
      return currentKey;
    },

    activeTracks(): string[] {
      return voices.map((v) => v.key);
    },

    dispose(): void {
      disposed = true;
      currentKey = null;
      pendingKey = null;
      for (const v of voices) {
        for (const s of v.sources) {
          try {
            s.stop();
          } catch {
            // ignore
          }
        }
      }
      voices = [];
      try {
        void ctx?.close();
      } catch {
        // ignore
      }
      ctx = null;
    },
  };

  return engine;
}
