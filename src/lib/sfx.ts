// Tiny WebAudio sfx; no asset dependencies.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.15, delay = 0) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  setMuted(m: boolean) { muted = m; },
  isMuted() { return muted; },
  move() { tone(440, 0.08, "triangle", 0.12); },
  capture() { tone(180, 0.18, "sawtooth", 0.18); tone(120, 0.22, "sine", 0.12, 0.02); },
  check() { tone(880, 0.12, "square", 0.1); tone(1175, 0.14, "square", 0.1, 0.08); },
  checkmate() {
    tone(523, 0.18, "triangle", 0.18);
    tone(659, 0.2, "triangle", 0.18, 0.12);
    tone(784, 0.3, "triangle", 0.2, 0.26);
    tone(392, 0.4, "sine", 0.18, 0.5);
  },
};
