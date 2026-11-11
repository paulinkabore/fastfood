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
// ---------- Annonces vocales ----------
export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// La voix est choisie en français ; la liste peut arriver après le chargement de la page
function frenchVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith('fr-fr')) ?? voices.find((v) => v.lang.toLowerCase().startsWith('fr'));
}

// Dit la phrase `times` fois, après un petit carillon. Les annonces se suivent sans se couper.
export function speak(text: string, times = 2) {
  if (!speechAvailable()) return;
  beep();
  for (let i = 0; i < times; i++) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.9;
    u.volume = 1;
    const voice = frenchVoice();
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }
}

export const readyAnnouncement = (number: number, place: string) =>
  `Commande numéro ${number}. ${place}. Votre commande est prête.`;
