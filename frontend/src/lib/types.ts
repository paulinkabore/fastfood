export type MenuOption = { id: string; name: string; priceDeltaFcfa: number };

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  priceFcfa: number;
  imageUrl: string | null;
  allergens: string[];
  isAvailable: boolean;
  options: MenuOption[];
};

export type MenuCategory = { id: string; name: string; products: MenuProduct[] };

export type PublicMenu = {
  restaurant: { name: string; slug: string };
  orderType: 'DINE_IN' | 'TAKEAWAY';
  table: { label: string } | null;
  menu: MenuCategory[];
};

export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export type OrderView = {
  id: string;
  number: number;
  type: 'DINE_IN' | 'TAKEAWAY';
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalFcfa: number;
  notes: string | null;
  createdAt: string;
  restaurantName: string;
  tableLabel: string | null;
  items: {
    productName: string;
    quantity: number;
    unitPriceFcfa: number;
    options: string[];
    notes: string | null;
  }[];
};