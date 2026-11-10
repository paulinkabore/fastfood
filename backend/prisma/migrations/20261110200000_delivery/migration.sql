-- AlterEnum
ALTER TYPE "QrType" ADD VALUE 'DELIVERY';

-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'DELIVERY';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT;
