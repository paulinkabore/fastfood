-- Bon de monnaie : monnaie due au client quand le caissier n'a pas pu la rendre
ALTER TABLE "payments" ADD COLUMN     "changeDueFcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "changeSettledAt" TIMESTAMP(3),
ADD COLUMN     "changeSettledById" TEXT,
ADD COLUMN     "changeSettledSessionId" TEXT;
