const nf = new Intl.NumberFormat('fr-FR');

export const fcfa = (n: number) => `${nf.format(n).replace(/\s/g, '\u00a0')}\u00a0FCFA`;

// Garde seulement les chiffres d'une saisie (« 5 000 » devient 5000)
export const parseAmount = (s: string) => Number(s.replace(/\D/g, '')) || 0;

export const timeFr = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const dateTimeFr = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });