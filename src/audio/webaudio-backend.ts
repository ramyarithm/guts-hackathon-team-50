// Real Web Audio implementation of the engine's AudioBackend. Thin adapters so GainNode
// parameters and AudioNode connections match the engine's small interfaces.

import type { AudioBackend, AudioContextLike, BufferSourceLike, GainLike, NodeLike } from "./engine";

interface RawNode extends NodeLike {
  raw: AudioNode;
}

function rawOf(target: NodeLike): AudioNode | null {
  const node = (target as Partial<RawNode>).raw;
  return node instanceof AudioNode ? node : null;
}

function wrapGain(node: GainNode): GainLike & RawNode {
  return {
    raw: node,
    get value() {
      return node.gain.value;
    },
    set value(v: number) {
      node.gain.value = v;
    },
    connect(target) {
      const dest = rawOf(target);
      if (dest) node.connect(dest);
    },
    disconnect() {
      node.disconnect();
    },
    setValueAtTime(value, time) {
      node.gain.setValueAtTime(value, time);
    },
    linearRampToValueAtTime(value, endTime) {
      node.gain.linearRampToValueAtTime(value, endTime);
    },
    cancelScheduledValues(time) {
      node.gain.cancelScheduledValues(time);
    },
  };
}

function wrapSource(node: AudioBufferSourceNode): BufferSourceLike {
  const wrapper: BufferSourceLike = {
    get buffer() {
      return node.buffer;
    },
    set buffer(b) {
      node.buffer = b as AudioBuffer | null;
    },
    get loop() {
      return node.loop;
    },
    set loop(v) {
      node.loop = v;
    },
    get loopStart() {
      return node.loopStart;
    },
    set loopStart(v) {
      node.loopStart = v;
    },
    get loopEnd() {
      return node.loopEnd;
    },
    set loopEnd(v) {
      node.loopEnd = v;
    },
    get onended() {
      return node.onended as (() => void) | null;
    },
    set onended(cb) {
      node.onended = cb;
    },
    connect(target) {
      const dest = rawOf(target);
      if (dest) node.connect(dest);
    },
    disconnect() {
      node.disconnect();
    },
    start(when, offset) {
      node.start(when, offset);
    },
    stop(when) {
      node.stop(when);
    },
  };
  return wrapper;
}

export function createWebAudioBackend(): AudioBackend {
  return {
    createContext(): AudioContextLike {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio is not supported");
      const ac = new Ctor();
      const destination: RawNode = { raw: ac.destination };
      return {
        get currentTime() {
          return ac.currentTime;
        },
        get state() {
          return ac.state as "suspended" | "running" | "closed";
        },
        destination,
        resume: () => ac.resume(),
        close: () => ac.close(),
        decodeAudioData: (data) => ac.decodeAudioData(data),
        createGain: () => wrapGain(ac.createGain()),
        createBufferSource: () => wrapSource(ac.createBufferSource()),
      };
    },
    async fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.arrayBuffer();
    },
  };
}
