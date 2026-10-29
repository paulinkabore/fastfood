const nf = new Intl.NumberFormat('fr-FR');

export const fcfa = (n: number) => `${nf.format(n).replace(/\s/g, '\u00a0')}\u00a0FCFA`;