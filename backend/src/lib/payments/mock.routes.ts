import crypto from 'crypto';
import { Router } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { mockEntry, mockSetStatus, signMockBody } from '../../lib/payments/mock';

export const mockRouter = Router();

const safe = (s: string) => s.replace(/[<>&"']/g, '');

const page = (reference: string, amountFcfa: number, description: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paiement de test</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#fafaf9;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
main{background:#fff;max-width:380px;width:100%;border-radius:24px;padding:32px;box-shadow:0 20px 40px rgba(0,0,0,.08);text-align:center}
h1{font-size:20px;margin:12px 0 4px}p{color:#78716c;margin:4px 0}
.amount{font-size:34px;font-weight:700;color:#1c1917;margin:20px 0}
.tag{display:inline-block;background:#fff7ed;color:#c2410c;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600}
button{width:100%;border:0;border-radius:16px;padding:16px;font-size:16px;font-weight:600;cursor:pointer;margin-top:10px}
.ok{background:#f97316;color:#fff}.ko{background:#f5f5f4;color:#44403c}
</style></head><body><main>
<span class="tag">Simulation de développement</span>
<h1>Paiement Mobile Money</h1>
<p>${safe(description)}</p>
<p class="amount">${new Intl.NumberFormat('fr-FR').format(amountFcfa)} FCFA</p>
<form method="post" action="/api/v1/dev/mock-pay/${reference}/paid"><button class="ok">Payer</button></form>
<form method="post" action="/api/v1/dev/mock-pay/${reference}/failed"><button class="ko">Échouer</button></form>
</main></body></html>`;

mockRouter.get('/mock-pay/:reference', (req, res) => {
  const entry = mockEntry(String(req.params.reference));
  if (!entry) {
    res.status(404).type('text').send('Paiement inconnu ou expiré (le backend a peut-être redémarré).');
    return;
  }
  res.type('html').send(page(String(req.params.reference), entry.amountFcfa, entry.description));
});

mockRouter.post(
  '/mock-pay/:reference/:result',
  asyncHandler(async (req, res) => {
    const reference = String(req.params.reference);
    const result = String(req.params.result);
    const entry = mockEntry(reference);
    if (!entry) throw new AppError(404, 'NOT_FOUND', 'Paiement inconnu');
    if (result !== 'paid' && result !== 'failed') throw new AppError(400, 'BAD_REQUEST', 'Résultat invalide');

    mockSetStatus(reference, result === 'paid' ? 'PAID' : 'FAILED');

    // Comme un vrai prestataire : une notification signée est envoyée au serveur
    const body = JSON.stringify({ eventId: crypto.randomUUID(), reference });
    try {
      await fetch(`http://localhost:${env.PORT}/api/v1/webhooks/payments/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mock-signature': signMockBody(body) },
        body,
      });
    } catch {
      /* le retour du client permet de rattraper l'état */
    }
    res.redirect(303, entry.returnUrl);
  }),
);