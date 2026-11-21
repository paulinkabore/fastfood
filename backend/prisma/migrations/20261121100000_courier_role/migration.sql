-- Compte livreur : nouveau rôle et prise en charge d'une commande par un livreur
ALTER TYPE "MemberRole" ADD VALUE 'COURIER';

ALTER TABLE "orders" ADD COLUMN     "courierId" TEXT,
ADD COLUMN     "courierClaimedAt" TIMESTAMP(3);

CREATE INDEX "orders_restaurantId_courierId_idx" ON "orders"("restaurantId", "courierId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
