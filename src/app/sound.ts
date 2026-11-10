/**
 * Sound.
 *
 * Stones are synthesised with WebAudio, so there are no asset downloads and
 * the app still works offline. Everything is gated behind the `sound` setting
 * and a user gesture (iOS requirement).
 */

export type BoardTone = 'place' | 'capture' | 'correct' | 'wrong' | 'star' | 'click';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Short click of wood for a stone placement. */
function wood(ctx: AudioContext, when: number, gain: number, freq = 320) {
  const dur = 0.09;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(when);
  // A short pitched body makes it read as wood rather than noise.
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq * 0.7, when);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, when + dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(gain * 0.5, when);
  og.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(og).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function note(ctx: AudioContext, when: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

export function playTone(tone: BoardTone) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.005;
  switch (tone) {
    case 'place':
      wood(c, t, 0.35, 300);
      break;
    case 'capture':
      wood(c, t, 0.4, 240);
      wood(c, t + 0.07, 0.25, 180);
      break;
    case 'correct':
      note(c, t, 660, 0.16, 0.14);
      note(c, t + 0.09, 880, 0.22, 0.12);
      break;
    case 'wrong':
      note(c, t, 200, 0.16, 0.1, 'triangle');
      note(c, t + 0.08, 160, 0.2, 0.08, 'triangle');
      break;
    case 'star':
      note(c, t, 784, 0.14, 0.1);
      note(c, t + 0.08, 1046, 0.16, 0.1);
      note(c, t + 0.16, 1318, 0.24, 0.09);
      break;
    case 'click':
      wood(c, t, 0.18, 420);
      break;
  }
}

/** Some browsers only allow audio after a gesture; call once on first tap. */
export function primeAudio() {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}
