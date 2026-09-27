import { loadMuted, saveMuted } from './storage';

// Procedural sound effects via WebAudio — no audio files, same spirit as BootScene's textures.
// A single AudioContext is shared across game restarts.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = loadMuted();
const lastPlayed: Record<string, number> = {};

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Returns false if the same sound fired within `gap` seconds (keeps rapid-fire sounds from stacking).
function throttle(name: string, gap: number): boolean {
  const c = audio();
  if (!c) return false;
  if (c.currentTime - (lastPlayed[name] ?? -1) < gap) return false;
  lastPlayed[name] = c.currentTime;
  return true;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  to?: number;
  delay?: number;
}

function tone(freq: number, dur: number, { type = 'square', vol = 0.1, to, delay = 0 }: ToneOpts = {}) {
  const c = audio();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number, cutoffTo = 100) {
  const c = audio();
  if (!c || !master || !noiseBuffer || muted) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.exponentialRampToValueAtTime(cutoffTo, t + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  get muted() {
    return muted;
  },
  toggleMute() {
    muted = !muted;
    saveMuted(muted);
    return muted;
  },
  shoot() {
    if (throttle('shoot', 0.08)) tone(1300, 0.05, { vol: 0.018, to: 650 });
  },
  hit() {
    if (throttle('hit', 0.05)) tone(260, 0.04, { vol: 0.03, to: 160 });
  },
  explode(big = false) {
    if (!throttle(big ? 'boom' : 'pop', big ? 0.1 : 0.04)) return;
    noise(big ? 0.9 : 0.3, big ? 0.5 : 0.22, big ? 1800 : 2600, 90);
    if (big) tone(90, 0.8, { type: 'sine', vol: 0.4, to: 30 });
  },
  hurt() {
    tone(220, 0.25, { type: 'sawtooth', vol: 0.14, to: 60 });
    noise(0.2, 0.15, 1200);
  },
  powerup() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.09, { type: 'triangle', vol: 0.12, delay: i * 0.06 }));
  },
  altitude(low: boolean) {
    tone(low ? 520 : 260, 0.15, { type: 'sine', vol: 0.12, to: low ? 260 : 520 });
  },
  bomb() {
    noise(1.2, 0.6, 3000, 80);
    tone(60, 1.0, { type: 'sine', vol: 0.5, to: 25 });
  },
  warn() {
    for (let i = 0; i < 3; i++) tone(440, 0.3, { type: 'sawtooth', vol: 0.07, to: 880, delay: i * 0.42 });
  },
  charge() {
    tone(180, 0.6, { type: 'sawtooth', vol: 0.06, to: 1200 });
  },
  beam() {
    noise(0.6, 0.2, 5000, 400);
    tone(110, 0.6, { type: 'sawtooth', vol: 0.1, to: 70 });
  },
};
