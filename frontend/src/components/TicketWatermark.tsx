// Logo en filigrane : placé derrière le contenu du ticket (le texte reste lisible par-dessus)
export function TicketWatermark() {
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '88%',
        transform: 'translate(-50%, -50%)',
        opacity: 0.13,
        filter: 'grayscale(1)',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    />
  );
}
