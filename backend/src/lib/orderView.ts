import type { Prisma } from '@prisma/client';

export const orderInclude = {
  items: true,
  table: { select: { label: true } },
  restaurant: { select: { name: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const presentOrder = (o: OrderWithRelations) => ({
  id: o.id,
  restaurantId: o.restaurantId,
  number: o.number,
  type: o.type,
  status: o.status,
  paymentStatus: o.paymentStatus,
  sentToKitchenAt: o.sentToKitchenAt,
  totalFcfa: o.totalFcfa,
  notes: o.notes,
  createdAt: o.createdAt,
  restaurantName: o.restaurant.name,
  tableLabel: o.table?.label ?? null,
  items: o.items.map((i) => ({
    productName: i.productName,
    quantity: i.quantity,
    unitPriceFcfa: i.unitPriceFcfa,
    options: ((i.optionsSnapshot as { name: string }[] | null) ?? []).map((x) => x.name),
    notes: i.notes,
  })),
});