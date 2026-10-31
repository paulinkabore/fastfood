/*
  Warnings:

  - A unique constraint covering the columns `[restaurantId,receiptNumber]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "closingNote" TEXT,
ADD COLUMN     "differenceFcfa" INTEGER,
ADD COLUMN     "expectedAmountFcfa" INTEGER;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "receiptNumber" INTEGER,
ADD COLUMN     "refundSessionId" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_restaurantId_receiptNumber_key" ON "payments"("restaurantId", "receiptNumber");
