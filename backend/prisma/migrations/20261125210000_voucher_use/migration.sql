-- Bon de monnaie utilisé comme réduction sur une nouvelle commande
ALTER TABLE "payments" ADD COLUMN     "voucherUsedFcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voucherUsedCode" TEXT;
