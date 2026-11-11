// Largeur du papier des tickets : rouleau d'imprimante thermique de 80 mm
export const TICKET_WIDTH_MM = 80;

// Imprime le ticket affiché dans « .print-receipt » sur un papier de 80 mm,
// avec une hauteur égale à celle du ticket (pas de page A4 presque vide)
export function printTicket() {
  const el = document.querySelector<HTMLElement>('.print-receipt');
  let heightMm = 200;
  if (el) {
    const previous = el.getAttribute('style');
    // Invisible à l'écran : on le mesure en le rendant momentanément « mesurable »
    el.style.cssText += `;display:block;position:absolute;visibility:hidden;width:${TICKET_WIDTH_MM}mm;box-sizing:border-box;padding:4mm`;
    heightMm = Math.ceil((el.scrollHeight * 25.4) / 96) + 8;
    if (previous === null) el.removeAttribute('style');
    else el.setAttribute('style', previous);
  }

  const style = document.createElement('style');
  style.id = 'ticket-page-size';
  style.textContent = `@page { size: ${TICKET_WIDTH_MM}mm ${heightMm}mm; margin: 0; }`;
  document.head.appendChild(style);

  const clean = () => {
    style.remove();
    window.removeEventListener('afterprint', clean);
  };
  window.addEventListener('afterprint', clean);
  window.print();
}
