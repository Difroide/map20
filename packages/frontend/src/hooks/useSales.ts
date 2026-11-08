import { useQuery } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';

export type SalesPeriod = 'today' | '7' | '30' | '90';
export type PurchaseStatus = 'sent' | 'failed' | 'pending' | null;

export interface SaleOrder {
  id: string;
  orderId: string;
  soldAt: string;
  status: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  platform: string | null;
  products: { name: string; amount: number; isOrderBump: boolean }[];
  customer: { name: string | null; email: string | null; phone: string | null };
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };
  adId: string | null;
  matched: boolean;
  matchMethod: string | null;
  purchase: PurchaseStatus;
  purchaseError: string | null;
}

export interface SalesSummary {
  orders: number;
  revenue: number;
  refunded: number;
  pending: number;
  matched: number;
  purchaseSent: number;
  currency: string;
}

interface SalesResponse {
  summary: SalesSummary;
  orders: SaleOrder[];
  truncated: boolean;
}

/** Vendas da área no período. Atualiza sozinho a cada 30 segundos. */
export function useSales(period: SalesPeriod) {
  const { activeWorkspaceId } = useWorkspaceContext();
  const query = useQuery<SalesResponse, Error>({
    queryKey: ['sales', activeWorkspaceId, period],
    enabled: !!activeWorkspaceId,
    retry: false,
    refetchInterval: 30_000,
    queryFn: () => api.get(`/sales?workspace_id=${activeWorkspaceId}&period=${period}`),
  });
  return {
    data: query.data ?? null,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error?.message ?? null,
  };
}
