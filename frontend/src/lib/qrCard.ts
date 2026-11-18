// Carte QR : « SCAN ME » en haut, QR code avec le logo au centre, pastille du numéro de table.
const BRAND = '#7a1f2b';
const GOLD = '#d4a22a';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function composeQrCard(qrBlob: Blob, label: string): Promise<Blob> {
  const qrUrl = URL.createObjectURL(qrBlob);
  try {
    const [qr, logo] = await Promise.all([loadImage(qrUrl), loadImage('/qr-logo.png')]);
    const W = 800;
    const QR = 640;
    const H = 1010;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = BRAND;
    ctx.font = '800 92px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('SCAN ME', W / 2, 120);
    ctx.fillStyle = GOLD;
    roundRect(ctx, W / 2 - 70, 148, 140, 12, 6);
    ctx.fill();

    const qx = (W - QR) / 2;
    const qy = 200;
    ctx.drawImage(qr, qx, qy, QR, QR);

    // Logo au centre
    const lw = 140;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    const pad = 18;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, W / 2 - lw / 2 - pad, qy + QR / 2 - lh / 2 - pad, lw + 2 * pad, lh + 2 * pad, 24);
    ctx.fill();
    ctx.drawImage(logo, W / 2 - lw / 2, qy + QR / 2 - lh / 2, lw, lh);

    // Pastille du numéro de table, à cheval sur le bas du QR code
    const pw = 400;
    const ph = 92;
    const py = qy + QR - 30;
    ctx.fillStyle = BRAND;
    roundRect(ctx, W / 2 - pw / 2, py, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    let size = 56;
    ctx.font = `800 ${size}px Helvetica, Arial, sans-serif`;
    const text = label.toUpperCase();
    while (size > 28 && ctx.measureText(text).width > pw - 60) {
      size -= 2;
      ctx.font = `800 ${size}px Helvetica, Arial, sans-serif`;
    }
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, py + ph / 2 + 3);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 30px Helvetica, Arial, sans-serif';
    ctx.fillText('Menu, commande et paiement', W / 2, H - 40);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(qrUrl);
  }
}
