import { useQuery } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';

export type HeatmapDevice = 'mobile' | 'desktop';
export type HeatmapDays = '7' | '30' | '90';

export interface HeatmapPage {
  url: string;
  views: number;
  avgDepth: number | null;
  reachedEnd: number;
  clicks: number;
}

export interface HeatmapTopElement {
  selector: string | null;
  label: string | null;
  clicks: number;
  share: number;
}

export interface HeatmapPageDetail {
  views: number;
  clicks: number;
  /** reach[i] = % das visitas que chegaram a i * 5% da página. */
  reach: number[];
  avgDepth: number | null;
  fold: number | null;
  topElements: HeatmapTopElement[];
}

export function useHeatmapPages(device: HeatmapDevice, days: HeatmapDays) {
  const { activeWorkspaceId } = useWorkspaceContext();
  const query = useQuery<{ pages: HeatmapPage[] }, Error>({
    queryKey: ['heatmap-pages', activeWorkspaceId, device, days],
    enabled: !!activeWorkspaceId,
    retry: false,
    queryFn: () =>
      api.get(`/heatmap/pages?workspace_id=${activeWorkspaceId}&device=${device}&days=${days}`),
  });
  return { pages: query.data?.pages ?? null, loading: query.isLoading, error: query.error?.message ?? null };
}

export function useHeatmapPage(url: string | null, device: HeatmapDevice, days: HeatmapDays) {
  const { activeWorkspaceId } = useWorkspaceContext();
  const query = useQuery<HeatmapPageDetail, Error>({
    queryKey: ['heatmap-page', activeWorkspaceId, url, device, days],
    enabled: !!activeWorkspaceId && !!url,
    retry: false,
    queryFn: () =>
      api.get(
        `/heatmap/page?workspace_id=${activeWorkspaceId}&device=${device}&days=${days}&url=${encodeURIComponent(url!)}`,
      ),
  });
  return { detail: query.data ?? null, loading: query.isLoading, error: query.error?.message ?? null };
}

/** Token do link que abre a página real com o mapa por cima. Vale 12 horas; renova sozinho. */
export function useHeatmapToken() {
  const { activeWorkspaceId } = useWorkspaceContext();
  const query = useQuery<{ token: string; until: string }, Error>({
    queryKey: ['heatmap-token', activeWorkspaceId],
    enabled: !!activeWorkspaceId,
    retry: false,
    staleTime: 30 * 60_000,
    refetchInterval: 60 * 60_000,
    queryFn: () => api.post('/heatmap/token', { workspace_id: activeWorkspaceId }),
  });
  return { token: query.data?.token ?? null, error: query.error?.message ?? null };
}

export function heatmapLink(
  url: string,
  token: string,
  mode: 'clicks' | 'scroll',
  device: HeatmapDevice,
  days: HeatmapDays,
): string {
  const u = new URL(url);
  u.searchParams.set('stl_heatmap', token);
  u.searchParams.set('stl_hm', mode);
  u.searchParams.set('stl_hm_dev', device);
  u.searchParams.set('stl_hm_days', days);
  return u.toString();
}
