import PDFDocument from 'pdfkit';
import { qrPng } from './qr';
import { QR_LOGO_PNG, QR_LOGO_RATIO } from './qrLogo';

export type QrCard = { token: string; restaurantName: string; title: string };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 30;
const GAP = 20;
const CARD_W = (PAGE_W - 2 * MARGIN - GAP) / 2;
const CARD_H = (PAGE_H - 2 * MARGIN - GAP) / 2;
const QR_SIZE = 214;
const BRAND = '#7a1f2b'; // bordeaux du logo
const GOLD = '#d4a22a';

export async function buildQrPdf(cards: QrCard[]): Promise<Buffer> {
  const images = await Promise.all(cards.map((c) => qrPng(c.token, 800)));

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    cards.forEach((card, i) => {
      const slot = i % 4;
      if (i > 0 && slot === 0) doc.addPage();
      const x = MARGIN + (slot % 2) * (CARD_W + GAP);
      const y = MARGIN + Math.floor(slot / 2) * (CARD_H + GAP);
      const cx = x + CARD_W / 2;

      // Cadre en pointillés (ligne de découpe)
      doc.save();
      doc
        .roundedRect(x, y, CARD_W, CARD_H, 12)
        .lineWidth(0.8)
        .dash(4, { space: 4 })
        .strokeColor('#9ca3af')
        .stroke();
      doc.restore();

      // « SCAN ME » tout en haut
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(30);
      doc.text('SCAN ME', x + 12, y + 20, { width: CARD_W - 24, align: 'center', characterSpacing: 2 });
      doc.roundedRect(cx - 24, y + 58, 48, 4, 2).fillColor(GOLD).fill();

      // QR code
      const qx = cx - QR_SIZE / 2;
      const qy = y + 74;
      doc.image(images[i], qx, qy, { width: QR_SIZE, height: QR_SIZE });

      // Logo au centre du QR code
      const lw = 46;
      const lh = lw / QR_LOGO_RATIO;
      const padL = 6;
      doc
        .roundedRect(cx - lw / 2 - padL, qy + QR_SIZE / 2 - lh / 2 - padL, lw + 2 * padL, lh + 2 * padL, 8)
        .fillColor('#ffffff')
        .fill();
      doc.image(QR_LOGO_PNG, cx - lw / 2, qy + QR_SIZE / 2 - lh / 2, { width: lw, height: lh });

      // Numéro de table : pastille à cheval sur le bas du QR code
      const pillW = 130;
      const pillH = 30;
      const pillY = qy + QR_SIZE - 17;
      doc.roundedRect(cx - pillW / 2, pillY, pillW, pillH, pillH / 2).fillColor(BRAND).fill();
      const label = card.title.toUpperCase();
      let size = 18;
      doc.font('Helvetica-Bold');
      while (size > 9 && doc.fontSize(size).widthOfString(label) > pillW - 20) size -= 1;
      doc
        .fillColor('#ffffff')
        .fontSize(size)
        .text(label, cx - pillW / 2, pillY + (pillH - size) / 2 + 1, {
          width: pillW,
          align: 'center',
          lineBreak: false,
        });

      doc
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(card.restaurantName, x + 12, y + 322, {
          width: CARD_W - 24,
          align: 'center',
          height: 18,
          ellipsis: true,
        });

      doc
        .fillColor('#6b7280')
        .font('Helvetica')
        .fontSize(9.5)
        .text('Menu, commande et paiement sur votre téléphone', x + 12, y + 344, {
          width: CARD_W - 24,
          align: 'center',
        });
    });

    doc.end();
  });
}
