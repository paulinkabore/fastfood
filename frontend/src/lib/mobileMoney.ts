// Code USSD Orange/Moov : le « # » final doit être encodé (%23) pour que le téléphone l'accepte dans un lien
export const ussdCode = (merchantCode: string, amountFcfa: number) =>
  `*144*10*${merchantCode}*${amountFcfa}#`;
export const ussdLink = (merchantCode: string, amountFcfa: number) =>
  `tel:${ussdCode(merchantCode, amountFcfa).replace('#', '%23')}`;

// Commande Mobile Money que le caissier n'a pas encore validée
export const awaitingValidation = (o: {
  status: string;
  paymentStatus: string;
  sentToKitchenAt?: string | null;
}) => o.status === 'RECEIVED' && o.paymentStatus === 'PENDING' && !o.sentToKitchenAt;
