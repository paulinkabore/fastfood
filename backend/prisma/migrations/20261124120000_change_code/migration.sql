-- Numéro du bon de monnaie : 6 caractères (lettres + chiffres)
ALTER TABLE "payments" ADD COLUMN "changeCode" TEXT;
