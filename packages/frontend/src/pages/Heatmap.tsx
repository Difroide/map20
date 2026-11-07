import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Monitor, MousePointerClick, ScrollText, Smartphone } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { NoWorkspace } from '@/components/NoWorkspace';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  heatmapLink,
  useHeatmapPage,
  useHeatmapPages,
  useHeatmapToken,
  type HeatmapDays,
  type HeatmapDevice,
  type HeatmapPage,
  type HeatmapPageDetail,
} from '@/hooks/useHeatmap';
import { cn } from '@/lib/utils';

function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url || '—';
  }
}

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: typeof Monitor }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-foreground/10 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors',
            value === o.value ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Onde as pessoas clicam e até onde rolam a página, como o mapa de calor do Clarity. */
export default function Heatmap() {
  const { activeWorkspace } = useWorkspaceContext();
  const [device, setDevice] = useState<HeatmapDevice>('mobile');
  const [days, setDays] = useState<HeatmapDays>('30');
  const [selected, setSelected] = useState<string | null>(null);
  const { pages, loading, error } = useHeatmapPages(device, days);
  const { token, error: tokenError } = useHeatmapToken();

  // A página escolhida some quando o filtro muda e ela não tem dados nele.
  useEffect(() => {
    if (!pages) return;
    if (!selected || !pages.some((p) => p.url === selected)) setSelected(pages[0]?.url ?? null);
  }, [pages, selected]);

  return (
    <DashboardLayout wide>
      <div className="space-y-5 animate-sentinel-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Mapa de calor</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Onde as pessoas clicam e até onde rolam a página de vendas
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented
              value={device}
              onChange={setDevice}
              options={[
                { value: 'mobile', label: 'Celular', icon: Smartphone },
                { value: 'desktop', label: 'Computador', icon: Monitor },
              ]}
            />
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: '7', label: '7 dias' },
                { value: '30', label: '30 dias' },
                { value: '90', label: '90 dias' },
              ]}
            />
          </div>
        </div>

        {!activeWorkspace ? (
          <NoWorkspace />
        ) : loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !pages || pages.length === 0 ? (
          <EmptyState device={device} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <PagesTable pages={pages} selected={selected} onSelect={setSelected} />
            {selected && (
              <PageDetail url={selected} device={device} days={days} token={token} tokenError={tokenError} />
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function EmptyState({ device }: { device: HeatmapDevice }) {
  return (
    <div className="rounded-lg border border-foreground/10 px-6 py-10 text-center text-sm text-muted-foreground">
      <p className="text-foreground">Ainda não há cliques nem rolagem {device === 'mobile' ? 'de celular' : 'de computador'} neste período.</p>
      <p className="mt-2">
        O código da página (Integrações) já coleta sozinho: os dados aparecem aqui a partir das próximas visitas.
      </p>
    </div>
  );
}

function PagesTable({
  pages,
  selected,
  onSelect,
}: {
  pages: HeatmapPage[];
  selected: string | null;
  onSelect: (url: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-foreground/10">
      <h2 className="border-b border-foreground/5 px-4 py-3 text-sm font-medium">Páginas</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-normal">Página</th>
              <th className="px-3 py-2 text-right font-normal">Visitas</th>
              <th className="px-3 py-2 text-right font-normal">Cliques</th>
              <th className="px-3 py-2 text-right font-normal" title="Profundidade média que as visitas viram">Rolagem</th>
              <th className="px-4 py-2 text-right font-normal" title="Visitas que viram 90% da página ou mais">Até o fim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/5">
            {pages.map((p) => (
              <tr
                key={p.url}
                onClick={() => onSelect(p.url)}
                className={cn('cursor-pointer hover:bg-foreground/[0.03]', selected === p.url && 'bg-foreground/[0.06]')}
              >
                <td className="max-w-[18rem] truncate px-4 py-2.5" title={p.url}>{pagePath(p.url)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.views}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.clicks}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(p.avgDepth)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {p.views ? pct((p.reachedEnd / p.views) * 100) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PageDetail({
  url,
  device,
  days,
  token,
  tokenError,
}: {
  url: string;
  device: HeatmapDevice;
  days: HeatmapDays;
  token: string | null;
  tokenError: string | null;
}) {
  const { detail, loading, error } = useHeatmapPage(url, device, days);

  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-foreground/10 p-4">
      <div>
        <p className="truncate text-sm font-medium" title={url}>{pagePath(url)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <OpenButton url={url} token={token} mode="clicks" device={device} days={days} icon={MousePointerClick} label="Ver cliques na página" />
          <OpenButton url={url} token={token} mode="scroll" device={device} days={days} icon={ScrollText} label="Ver rolagem na página" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Abre a página real numa nova aba com o mapa desenhado por cima (a visita não é contada).
          {device === 'mobile' && ' Para o desenho bater com o layout de celular, estreite a janela ou use o modo celular do navegador (F12).'}
        </p>
        {tokenError && <p className="mt-2 text-xs text-destructive">{tokenError}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : detail ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Visitas" value={String(detail.views)} />
            <Stat label="Cliques" value={String(detail.clicks)} />
            <Stat label="Rolagem média" value={pct(detail.avgDepth)} />
          </div>
          <ScrollChart detail={detail} />
          <TopElements detail={detail} />
        </>
      ) : null}
    </section>
  );
}

function OpenButton({
  url,
  token,
  mode,
  device,
  days,
  icon: Icon,
  label,
}: {
  url: string;
  token: string | null;
  mode: 'clicks' | 'scroll';
  device: HeatmapDevice;
  days: HeatmapDays;
  icon: typeof Monitor;
  label: string;
}) {
  const className =
    'inline-flex items-center gap-1.5 rounded-md border border-foreground/10 px-3 py-1.5 text-xs font-medium transition-colors';
  if (!token) {
    return (
      <span className={cn(className, 'cursor-not-allowed opacity-50')}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
    );
  }
  return (
    <a
      href={heatmapLink(url, token, mode, device, days)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(className, 'hover:bg-foreground/5')}
    >
      <Icon className="h-3.5 w-3.5" /> {label} <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </a>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-foreground/10 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** % das visitas que chegaram a cada 10% da página. */
function ScrollChart({ detail }: { detail: HeatmapPageDetail }) {
  const rows = Array.from({ length: 10 }, (_, i) => ({ at: (i + 1) * 10, reach: detail.reach[(i + 1) * 2] ?? 0 }));
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">Quantos chegaram até cada parte da página</h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.at} className="flex items-center gap-2 text-xs">
            <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{r.at}%</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-foreground/5">
              <div
                className="h-full rounded"
                style={{ width: `${r.reach}%`, background: `hsl(${Math.round(240 * (1 - r.reach / 100))} 85% 55%)` }}
              />
              {detail.fold !== null && detail.fold > r.at - 10 && detail.fold <= r.at && (
                <span className="absolute right-1 top-0 text-[10px] leading-4 text-muted-foreground">fim da 1ª tela</span>
              )}
            </div>
            <span className="w-10 shrink-0 text-right tabular-nums">{Math.round(r.reach)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortSelector(selector: string | null): string {
  if (!selector) return '(sem elemento)';
  const parts = selector.split('>');
  return parts.length > 3 ? `…>${parts.slice(-3).join('>')}` : selector;
}

function TopElements({ detail }: { detail: HeatmapPageDetail }) {
  if (detail.topElements.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum clique nesta página no período.</p>;
  }
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">Elementos mais clicados</h3>
      <ul className="divide-y divide-foreground/5 rounded-md border border-foreground/10">
        {detail.topElements.map((e, i) => (
          <li key={`${e.selector}-${i}`} className="flex items-center gap-3 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate">{e.label ?? <span className="text-muted-foreground">Sem texto</span>}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground" title={e.selector ?? ''}>
                {shortSelector(e.selector)}
              </p>
            </div>
            <span className="tabular-nums">{e.clicks}</span>
            <span className="w-12 text-right tabular-nums text-muted-foreground">{e.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
