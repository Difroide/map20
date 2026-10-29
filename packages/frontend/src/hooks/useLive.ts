import { useQuery } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';

export interface LiveVisit {
  sessionId: string;
  visitorId: string;
  startedAt: string;
  lastSeenAt: string;
  online: boolean;
  /** O último evento foi uma saída: fechou a página ou trocou de aba. */
  exited: boolean;
  page: string;
  source: string | null;
  campaign: string | null;
  device: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  pageviews: number;
  checkoutClick: boolean;
}

export interface LiveSnapshot {
  online: number;
  visits: number;
  countries: { country: string | null; visits: number; online: number }[];
  list: LiveVisit[];
  generatedAt: string;
}

const POLL_MS = 5_000;

/** Acessos dos últimos 30 minutos. Só consulta com a aba do painel visível. */
export function useLive() {
  const { activeWorkspaceId } = useWorkspaceContext();
  const query = useQuery<LiveSnapshot, Error>({
    queryKey: ['live', activeWorkspaceId],
    enabled: !!activeWorkspaceId,
    retry: false,
    refetchInterval: () => (document.visibilityState === 'visible' ? POLL_MS : false),
    refetchIntervalInBackground: false,
    queryFn: () => api.get<LiveSnapshot>(`/live?workspace_id=${activeWorkspaceId}`),
  });
  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
