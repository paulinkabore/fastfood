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
export type MemberRole = 'MANAGER' | 'CASHIER' | 'COOK' | 'WAITER';

export type OrderView = {
  id: string;
  restaurantId?: string;
  number: number;
  type: 'DINE_IN' | 'TAKEAWAY';
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  sentToKitchenAt?: string | null;
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

export type StaffUser = {
  id: string;
  email: string;
  fullName: string;
  globalRole: 'SUPER_ADMIN' | 'USER';
  memberships: { restaurantId: string; role: MemberRole }[];
};