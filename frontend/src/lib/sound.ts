let ctx: AudioContext | null = null;

// À appeler après un clic : les navigateurs interdisent le son avant une action de l'utilisateur
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

export function beep() {
  const c = ctx;
  if (!c) return;
  const start = c.currentTime;
  [880, 1175].forEach((freq, i) => {
    const t = start + i * 0.2;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}