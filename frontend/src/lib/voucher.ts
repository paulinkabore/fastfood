// Un bon de monnaie est valable 30 jours (même durée que sur le serveur)
export const VOUCHER_VALID_DAYS = 30;
export const voucherValidUntil = (from = new Date()) =>
  new Date(from.getTime() + VOUCHER_VALID_DAYS * 86_400_000);
