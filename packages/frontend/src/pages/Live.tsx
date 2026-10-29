import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Monitor, ShoppingCart, Smartphone, Tablet } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { NoWorkspace } from '@/components/NoWorkspace';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { UTM_KEYS, useLive, type LiveVisit } from '@/hooks/useLive';
import { cn } from '@/lib/utils';

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryName(code: string | null): string {
  if (!code) return 'Desconhecido';
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Imagem e não emoji: o Windows não desenha bandeira em emoji, só as letras. */
function Flag({ code }: { code: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!code || !/^[a-z]{2}$/i.test(code) || failed) {
    return <span className="inline-block h-3 w-4 shrink-0 rounded-[2px] bg-foreground/10" aria-hidden />;
  }
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-3 w-4 shrink-0 rounded-[2px] object-cover"
    />
  );
}

function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url || '—';
  }
}

function ago(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });
}

function DeviceIcon({ device }: { device: string | null }) {
  const Icon = device === 'mobile' ? Smartphone : device === 'tablet' ? Tablet : Monitor;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={device ?? 'desktop'} />;
}

/** Quem está na página agora e quem passou nos últimos 30 minutos, com o país de cada um. */
export default function Live() {
  const { activeWorkspace } = useWorkspaceContext();
  const live = useLive();
  const data = live.data;

  return (
    <DashboardLayout wide>
      <div className="space-y-5 animate-sentinel-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Ao vivo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acessos dos últimos 30 minutos, atualizados a cada 5 segundos
            </p>
          </div>
          {data && (
            <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-3 py-1 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Atualizado {ago(data.generatedAt)}
            </span>
          )}
        </div>

        {!activeWorkspace ? (
          <NoWorkspace />
        ) : live.loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : live.error && !data ? (
          <p className="text-sm text-destructive">{live.error}</p>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Online agora" value={data.online} hint="Atividade nos últimos 5 minutos, sem ter saído da página" />
              <Stat label="Acessos em 30 min" value={data.visits} hint="Sessões com alguma atividade na última meia hora" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
              <section className="rounded-lg border border-foreground/10">
                <h2 className="border-b border-foreground/5 px-4 py-3 text-sm font-medium">Países</h2>
                {data.countries.length === 0 ? (
                  <Empty />
                ) : (
                  <ul className="divide-y divide-foreground/5">
                    {data.countries.map((c) => (
                      <li key={c.country ?? '—'} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <Flag code={c.country} />
                        <span className="min-w-0 flex-1 truncate">{countryName(c.country)}</span>
                        {c.online > 0 && <span className="text-xs text-success">{c.online} online</span>}
                        <span className="w-8 text-right tabular-nums text-muted-foreground">{c.visits}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-foreground/10">
                <h2 className="border-b border-foreground/5 px-4 py-3 text-sm font-medium">Acessos</h2>
                {data.list.length === 0 ? <Empty /> : (
                  <ul className="divide-y divide-foreground/5">
                    {data.list.map((v) => <VisitRow key={v.sessionId} visit={v} />)}
                  </ul>
                )}
              </section>
            </div>
            {live.error && <p className="text-xs text-destructive">{live.error}</p>}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-4" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Empty() {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
      Nenhum acesso nos últimos 30 minutos.
    </p>
  );
}

/** Os parâmetros do link pelo qual a pessoa chegou. */
function UtmChips({ visit: v }: { visit: LiveVisit }) {
  const chips: [string, string][] = UTM_KEYS.flatMap((key) => {
    const value = v.utm[key];
    return value ? [[`utm_${key}`, value] as [string, string]] : [];
  });
  if (v.adId) chips.push(['ad_id', v.adId]);
  if (!chips.length && !v.clickId) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {v.clickId && (
        <span
          className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
          title={`Chegou com ${v.clickId} na URL`}
        >
          {v.clickId === 'fbclid' ? 'Anúncio Meta' : 'Anúncio Google'}
        </span>
      )}
      {chips.map(([key, value]) => (
        <span
          key={key}
          className="max-w-full truncate rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px]"
          title={`${key}=${value}`}
        >
          <span className="text-muted-foreground">{key}=</span>
          {value}
        </span>
      ))}
    </div>
  );
}

function VisitRow({ visit: v }: { visit: LiveVisit }) {
  const place = [v.city, v.region].filter(Boolean).join(', ');
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-sm">
      <span
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', v.online ? 'bg-success' : 'bg-muted-foreground/40')}
        title={v.online ? 'Online' : v.exited ? 'Saiu ou trocou de aba' : 'Sem atividade há mais de 5 minutos'}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Flag code={v.country} />
          <span className="font-medium">{countryName(v.country)}</span>
          {place && <span className="truncate text-xs text-muted-foreground">{place}</span>}
          <DeviceIcon device={v.device} />
          {v.checkoutClick && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">
              <ShoppingCart className="h-3 w-3" />
              Clicou no checkout
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground" title={v.page}>
          {pagePath(v.page)}
          {' · '}
          {v.pageviews} {v.pageviews === 1 ? 'página' : 'páginas'}
          {Object.keys(v.utm).length === 0 && v.source && ` · veio de ${v.source}`}
        </p>
        <UtmChips visit={v} />
      </div>
      <span className="shrink-0 text-right text-xs text-muted-foreground">
        {v.online ? 'agora' : v.exited ? 'saiu' : 'inativo'}
        <br />
        {ago(v.lastSeenAt)}
      </span>
    </li>
  );
}
