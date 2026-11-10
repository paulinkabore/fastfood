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
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
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
  type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  sentToKitchenAt?: string | null;
  totalFcfa: number;
  notes: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
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
export type CashierOrder = OrderView & {
  payments: {
    id: string;
    method: string;
    status: PaymentStatus;
    receiptNumber: number | null;
    confirmedAt: string | null;
  }[];
};

export type CashSessionView = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingFloatFcfa: number;
  collectedFcfa: number;
  collectedCount: number;
  refundedFcfa: number;
  refundedCount: number;
  expectedFcfa: number;
  closingAmountFcfa: number | null;
  differenceFcfa: number | null;
  closingNote: string | null;
};

export type ReceiptView = {
  restaurantName: string;
  receiptNumber: number | null;
  orderNumber: number;
  issuedAt: string;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  tableLabel: string | null;
  items: {
    productName: string;
    quantity: number;
    unitPriceFcfa: number;
    options: string[];
    notes: string | null;
    lineTotalFcfa: number;
  }[];
  totalFcfa: number;
  method: string;
  status: PaymentStatus;
  refundedAt: string | null;
  cashierName: string | null;
};

export type StaffCategory = { id: string; name: string; isActive: boolean };

export type StaffProduct = Omit<MenuProduct, 'options'> & {
  categoryId: string;
  options: (MenuOption & { isActive?: boolean })[];
};

export type StaffTable = { id: string; label: string; seats: number | null; isActive: boolean };