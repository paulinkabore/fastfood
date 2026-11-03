export type ProviderStatus = 'PAID' | 'FAILED' | 'PENDING';

// Un prestataire de paiement doit savoir faire ces trois choses.
// Brancher un vrai prestataire = écrire un fichier qui respecte cette interface.
export interface PaymentProvider {
  name: string;
  // Démarre un paiement et renvoie l'adresse de la page de paiement du prestataire
  initiate(input: {
    reference: string;
    amountFcfa: number;
    description: string;
    returnUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  // Interroge le prestataire : c'est la SEULE source de vérité sur l'état d'un paiement
  verify(reference: string): Promise<{ status: ProviderStatus; amountFcfa: number } | null>;
  // Vérifie la signature d'une notification ; renvoie null si elle est invalide
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): { eventId: string; reference: string } | null;
}