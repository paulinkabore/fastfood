import type { OrderView, PublicMenu, ReceiptView } from './types';

export type PublicConfig = {
  mobileMoney: boolean;
  manualMobileMoney: { merchantCode: string; merchantName: string } | null;
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifiez votre réseau.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'ERROR',
      data?.error?.message ?? `Une erreur est survenue (code ${res.status})`,
    );
  }
  return data as T;
}

export type OrderPayload = {
  idempotencyKey: string;
  notes?: string;
  payment?: { method: 'MOBILE_MONEY'; payerPhone: string };
  customer?: { name: string; phone: string };
  items: { productId: string; quantity: number; optionIds: string[]; notes?: string }[];
};

export const api = {
  getMenu: (token: string) => request<PublicMenu>(`/public/qr/${token}`),
  createOrder: (token: string, payload: OrderPayload) =>
    request<{ order: OrderView; duplicate?: boolean }>(`/public/qr/${token}/orders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOrder: (id: string) => request<{ order: OrderView }>(`/public/orders/${id}`),
  getConfig: () => request<PublicConfig>('/public/config'),
  getReceipt: (orderId: string) => request<{ receipt: ReceiptView }>(`/public/orders/${orderId}/receipt`),
  // Démarre un paiement Mobile Money : renvoie l'adresse de la page du prestataire
  payMobileMoney: (orderId: string) =>
    request<{ checkoutUrl: string; reused: boolean }>(`/public/orders/${orderId}/pay/mobile-money`, {
      method: 'POST',
    }),
  // Demande au SERVEUR de vérifier l'état du paiement auprès du prestataire
  refreshPayment: (orderId: string) =>
    request<{ paymentStatus: string; outcome: string }>(
      `/public/orders/${orderId}/pay/mobile-money/refresh`,
      { method: 'POST' },
    ),
};