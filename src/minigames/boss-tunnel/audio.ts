// Dead Line - synthesized sound on its own AudioContext (Web Audio only, no files): the
// creature through a proximity low-pass + stereo panner, footsteps, lantern click, phone
// ring, heartbeat, the two stingers, the blocked-step thud and the door (wheel ratchet,
// clank). Every call is wrapped so audio failures are silent.
// The looping boss ambience itself is the controller's `boss` track in src/audio.

export interface BossAudio {
  /** Try to create/resume the context (call on a user gesture). */
  unlock(): void;
  /** Creature presence 0..1 and its side (-1 left, +1 right). */
  setPresence(level: number, side: number): void;
  footstep(): void;
  click(): void;
  ring(side: number): void;
  heartbeat(): void;
  sightingSting(): void;
  caughtSting(): void;
  /** RIGHT pressed in the dark: a dull, muffled thud (nothing happens). */
  blocked(): void;
  /** The door's locking wheel ratcheting round, over `ms`. */
  wheelSpin(ms: number): void;
  /** The blast door unseating: a heavy clank with a metallic ring. */
  doorClank(): void;
  /** Fade everything out (reaching the surface). */
  fadeOut(ms: number): void;
  dispose(): void;
}

export function createBossAudio(): BossAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let creatureGain: GainNode | null = null;
  let creatureFilter: BiquadFilterNode | null = null;
  let creaturePan: StereoPannerNode | null = null;
  let creatureSrc: AudioBufferSourceNode | null = null;
  let failed = false;
  let disposed = false;

  const ensure = (): AudioContext | null => {
    if (ctx || failed || disposed) return ctx;
    try {
      const Ctor =
        (
          window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }
        ).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('no Web Audio');
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      // Creature bed: looping brown noise through a low-pass and a panner.
      const seconds = 2;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
      creatureSrc = ctx.createBufferSource();
      creatureSrc.buffer = buffer;
      creatureSrc.loop = true;
      creatureFilter = ctx.createBiquadFilter();
      creatureFilter.type = 'lowpass';
      creatureFilter.frequency.value = 200;
      creaturePan = ctx.createStereoPanner();
      creatureGain = ctx.createGain();
      creatureGain.gain.value = 0;
      creatureSrc
        .connect(creatureFilter)
        .connect(creaturePan)
        .connect(creatureGain)
        .connect(master);
      creatureSrc.start();
    } catch {
      failed = true;
      ctx = null;
    }
    return ctx;
  };

  const safe = (fn: (c: AudioContext, m: GainNode) => void): void => {
    const c = ensure();
    if (!c || !master || disposed) return;
    try {
      fn(c, master);
    } catch {
      // audio is optional
    }
  };

  const noiseBurst = (
    c: AudioContext,
    out: AudioNode,
    ms: number,
    gain: number,
    cutoff: number,
  ): void => {
    const buffer = c.createBuffer(
      1,
      Math.max(1, Math.round((c.sampleRate * ms) / 1000)),
      c.sampleRate,
    );
    const d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start();
  };

  const tone = (
    c: AudioContext,
    out: AudioNode,
    freq: number,
    ms: number,
    gain: number,
    type: OscillatorType = 'sine',
    pan = 0,
  ): void => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(out);
    o.start();
    o.stop(c.currentTime + ms / 1000 + 0.02);
  };

  return {
    unlock() {
      safe((c) => {
        if (c.state === 'suspended') void c.resume();
      });
    },
    setPresence(level, side) {
      if (!ctx || !creatureGain || !creatureFilter || !creaturePan) return;
      try {
        const t = ctx.currentTime;
        const l = Math.max(0, Math.min(1, level));
        creatureGain.gain.setTargetAtTime(l * l * 0.5, t, 0.15);
        creatureFilter.frequency.setTargetAtTime(200 + l * 2600, t, 0.2); // opens up as it closes in
        creaturePan.pan.setTargetAtTime(Math.max(-1, Math.min(1, side * (0.4 + 0.5 * l))), t, 0.3);
      } catch {
        // ignore
      }
    },
    footstep() {
      safe((c, m) => noiseBurst(c, m, 90, 0.35, 500));
    },
    click() {
      safe((c, m) => tone(c, m, 1800, 40, 0.12, 'square'));
    },
    ring(side) {
      safe((c, m) => {
        for (let i = 0; i < 4; i++) {
          setTimeout(
            () =>
              safe((c2, m2) => {
                tone(c2, m2, 880, 180, 0.12, 'triangle', side * 0.8);
                tone(c2, m2, 1100, 180, 0.1, 'triangle', side * 0.8);
              }),
            i * 320,
          );
        }
        void c;
        void m;
      });
    },
    heartbeat() {
      safe((c, m) => {
        tone(c, m, 55, 160, 0.5);
        setTimeout(() => safe((c2, m2) => tone(c2, m2, 50, 140, 0.4)), 180);
      });
    },
    sightingSting() {
      safe((c, m) => {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(700, c.currentTime + 0.9);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1200;
        o.connect(f).connect(g).connect(m);
        o.start();
        o.stop(c.currentTime + 1.3);
      });
    },
    caughtSting() {
      safe((c, m) => {
        tone(c, m, 38, 1400, 0.9, 'sine');
        noiseBurst(c, m, 700, 0.8, 900);
      });
    },
    blocked() {
      safe((c, m) => {
        tone(c, m, 110, 90, 0.18, 'triangle');
        noiseBurst(c, m, 60, 0.12, 300);
      });
    },
    wheelSpin(ms) {
      safe(() => {
        const clicks = Math.max(4, Math.round(ms / 70));
        for (let i = 0; i < clicks; i++) {
          // Ratchet clicks that slow down as the wheel reaches the end of its travel.
          const at = ms * (1 - Math.pow(1 - i / clicks, 1.6));
          setTimeout(
            () =>
              safe((c2, m2) => {
                tone(c2, m2, 900 + (i % 3) * 120, 30, 0.1, 'square');
                noiseBurst(c2, m2, 40, 0.1, 2500);
              }),
            at,
          );
        }
      });
    },
    doorClank() {
      safe((c, m) => {
        noiseBurst(c, m, 400, 0.9, 700);
        tone(c, m, 70, 900, 0.7, 'sine');
        tone(c, m, 210, 1500, 0.22, 'triangle');
        tone(c, m, 1270, 1800, 0.08, 'sine');
        setTimeout(
          () =>
            safe((c2, m2) => {
              noiseBurst(c2, m2, 1400, 0.35, 350);
              tone(c2, m2, 48, 1600, 0.4, 'sine');
            }),
          260,
        ); // the hinges groan
      });
    },
    fadeOut(ms) {
      safe((c) => {
        master?.gain.setTargetAtTime(0, c.currentTime, ms / 3000);
      });
    },
    dispose() {
      disposed = true;
      try {
        creatureSrc?.stop();
      } catch {
        // ignore
      }
      try {
        void ctx?.close();
      } catch {
        // ignore
      }
      ctx = null;
    },
  };
}
