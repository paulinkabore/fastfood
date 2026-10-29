import PDFDocument from 'pdfkit';
import { qrPng } from './qr';

export type QrCard = { token: string; restaurantName: string; title: string };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 30;
const GAP = 20;
const CARD_W = (PAGE_W - 2 * MARGIN - GAP) / 2;
const CARD_H = (PAGE_H - 2 * MARGIN - GAP) / 2;
const QR_SIZE = 210;

export async function buildQrPdf(cards: QrCard[]): Promise<Buffer> {
  const images = await Promise.all(cards.map((c) => qrPng(c.token, 700)));

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

      // Cadre en pointillés (ligne de découpe)
      doc.save();
      doc
        .roundedRect(x, y, CARD_W, CARD_H, 12)
        .lineWidth(0.8)
        .dash(4, { space: 4 })
        .strokeColor('#9ca3af')
        .stroke();
      doc.restore();

      // Petite barre orange (couleur de la marque)
      doc
        .roundedRect(x + CARD_W / 2 - 20, y + 18, 40, 4, 2)
        .fillColor('#f97316')
        .fill();

      doc
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(card.restaurantName, x + 12, y + 34, {
          width: CARD_W - 24,
          align: 'center',
          height: 22,
          ellipsis: true,
        });

      doc.fontSize(30).text(card.title, x + 12, y + 66, {
        width: CARD_W - 24,
        align: 'center',
        height: 38,
        ellipsis: true,
      });

      doc.image(images[i], x + (CARD_W - QR_SIZE) / 2, y + 116, {
        width: QR_SIZE,
        height: QR_SIZE,
      });

      doc
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('Scannez pour commander', x + 12, y + 340, {
          width: CARD_W - 24,
          align: 'center',
        });

      doc
        .fillColor('#6b7280')
        .font('Helvetica')
        .fontSize(10)
        .text('Menu, commande et paiement sur votre téléphone', x + 12, y + 360, {
          width: CARD_W - 24,
          align: 'center',
        });
    });

    doc.end();
  });
}