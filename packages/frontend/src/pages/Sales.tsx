import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, ChevronDown, Copy, Loader2, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { NoWorkspace } from '@/components/NoWorkspace';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { usePurchaseEvents, useSales, type PurchaseEvent, type SaleOrder, type SalesPeriod } from '@/hooks/useSales';
import { CHECKOUT_PLATFORMS, type CheckoutPlatform } from '@/types/checkout';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'approved' | 'pending' | 'refunded';

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprovada',
  pending: 'Pendente',
  refunded: 'Reembolsada',
  chargeback: 'Chargeback',
};

const PAYMENT_LABEL: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão',
  card: 'Cartão',
  boleto: 'Boleto',
  bank_slip: 'Boleto',
};

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function platformName(p: string | null): string {
  if (!p) return '—';
  return CHECKOUT_PLATFORMS[p as CheckoutPlatform]?.name ?? p;
}

function paymentName(p: string | null): string {
  if (!p) return '';
  return PAYMENT_LABEL[p.toLowerCase()] ?? p;
}

/** "cbo-kit|120256873073380460" → "cbo-kit": o id do Meta não ajuda a ler. */
function utmName(v: string | null): string | null {
  if (!v) return null;
  return v.split('|')[0].trim() || v;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
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
            'rounded px-2.5 py-1 text-xs transition-colors',
            value === o.value ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Os pedidos que chegaram pelos webhooks dos checkouts. */
export default function Sales() {
  const { activeWorkspace } = useWorkspaceContext();
  const [period, setPeriod] = useState<SalesPeriod>('7');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const { data, loading, fetching, error } = useSales(period);

  const orders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.orders ?? []).filter((o) => {
      if (status === 'refunded' ? o.status !== 'refunded' && o.status !== 'chargeback' : status !== 'all' && o.status !== status) {
        return false;
      }
      if (!term) return true;
      return [o.customer.name, o.customer.email, o.customer.phone, o.orderId, ...o.products.map((p) => p.name)]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(term));
    });
  }, [data, status, search]);

  const s = data?.summary;

  return (
    <DashboardLayout wide>
      <div className="space-y-5 animate-sentinel-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Vendas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedidos recebidos pelos webhooks dos checkouts
              {fetching && !loading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            </p>
          </div>
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'today', label: 'Hoje' },
              { value: '7', label: '7 dias' },
              { value: '30', label: '30 dias' },
              { value: '90', label: '90 dias' },
            ]}
          />
        </div>

        {!activeWorkspace ? (
          <NoWorkspace />
        ) : loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error && !data ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            {s && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Stat label="Faturamento" value={money(s.revenue, s.currency)} hint="Soma dos pedidos aprovados" />
                <Stat label="Vendas aprovadas" value={String(s.orders)} hint="Pedidos aprovados (com order bump conta um)" />
                <Stat
                  label="Ligadas à visita"
                  value={s.orders ? `${Math.round((s.matched / s.orders) * 100)}%` : '—'}
                  hint={`${s.matched} de ${s.orders} vendas aprovadas casaram com uma visita rastreada`}
                />
                <Stat
                  label="Purchase enviado"
                  value={s.orders ? `${s.purchaseSent} de ${s.orders}` : '—'}
                  hint="Vendas aprovadas com o Purchase aceito pelo Meta"
                />
                <Stat
                  label="Reembolsos"
                  value={String(s.refunded)}
                  hint={s.pending ? `${s.pending} pendente(s) no período` : 'Reembolsos e chargebacks no período'}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'Todas' },
                  { value: 'approved', label: 'Aprovadas' },
                  { value: 'pending', label: 'Pendentes' },
                  { value: 'refunded', label: 'Reembolsadas' },
                ]}
              />
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente, e-mail ou produto"
                  className="h-8 w-full rounded-md border border-foreground/10 bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
                />
              </label>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
            {data?.truncated && (
              <p className="text-xs text-muted-foreground">Período com muitas vendas: mostrando as 2000 linhas mais recentes.</p>
            )}

            <section className="overflow-hidden rounded-lg border border-foreground/10">
              {orders.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {data?.orders.length
                    ? 'Nenhuma venda com esse filtro.'
                    : 'Nenhuma venda neste período. As vendas entram pelo webhook do checkout configurado em Integrações.'}
                </p>
              ) : (
                <ul className="divide-y divide-foreground/5">
                  {orders.map((o) => (
                    <OrderRow key={o.orderId} order={o} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-4" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        status === 'approved' && 'bg-success/15 text-success',
        status === 'pending' && 'bg-warning/15 text-warning',
        (status === 'refunded' || status === 'chargeback') && 'bg-destructive/15 text-destructive',
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PurchaseBadge({ order }: { order: SaleOrder }) {
  if (order.status !== 'approved') return null;
  const map = {
    sent: { label: 'Purchase enviado', cls: 'text-success' },
    failed: { label: 'Purchase falhou', cls: 'text-destructive' },
    pending: { label: 'Purchase enviando', cls: 'text-warning' },
  } as const;
  const p = order.purchase ? map[order.purchase] : { label: 'Purchase não enviado', cls: 'text-muted-foreground' };
  return (
    <span className={cn('text-[11px]', p.cls)} title={order.purchaseError ?? undefined}>
      {p.label}
    </span>
  );
}

function OrderRow({ order: o }: { order: SaleOrder }) {
  const [open, setOpen] = useState(false);
  const main = o.products[0]?.name ?? 'Sem produto';
  const extra = o.products.length - 1;
  const campaign = utmName(o.utm.campaign);
  const ad = utmName(o.utm.content);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/[0.03] md:grid-cols-[7.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <span className="hidden text-xs text-muted-foreground tabular-nums md:block">
          {format(new Date(o.soldAt), "dd/MM HH:mm", { locale: ptBR })}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-foreground">{o.customer.name || o.customer.email || 'Sem nome'}</span>
          <span className="block truncate text-xs text-muted-foreground">
            <span className="md:hidden">{format(new Date(o.soldAt), "dd/MM HH:mm", { locale: ptBR })} · </span>
            {main}
            {extra > 0 && ` + ${extra} order bump${extra > 1 ? 's' : ''}`}
          </span>
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block truncate text-xs">{campaign ?? (o.utm.source ? o.utm.source : 'Sem UTM')}</span>
          <span className="block truncate text-xs text-muted-foreground">{ad ?? '—'}</span>
        </span>
        <span className="hidden min-w-0 flex-col md:flex">
          <span className={cn('text-xs', o.matched ? 'text-success' : 'text-muted-foreground')}>
            {o.matched ? 'Ligada à visita' : 'Sem visita'}
          </span>
          <PurchaseBadge order={o} />
        </span>
        <span className="flex items-center gap-2 justify-self-end">
          <span className="flex flex-col items-end">
            <span className="font-medium tabular-nums">{money(o.amount, o.currency)}</span>
            <span className="text-[11px] text-muted-foreground">
              {[platformName(o.platform), paymentName(o.paymentMethod)].filter((v) => v && v !== '—').join(' · ')}
            </span>
          </span>
          <StatusBadge status={o.status} />
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && <OrderDetail order={o} />}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="break-words text-xs text-foreground">{value || '—'}</dd>
    </div>
  );
}

function OrderDetail({ order: o }: { order: SaleOrder }) {
  return (
    <div className="border-t border-foreground/5 bg-foreground/[0.02]">
      <OrderInfo order={o} />
      <PurchaseSection order={o} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded border border-foreground/10 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
    >
      {done ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {done ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value ?? null, null, 2);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="max-h-96 overflow-auto rounded-md border border-foreground/10 bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {text}
      </pre>
    </div>
  );
}

const PURCHASE_STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Enviado', cls: 'text-success' },
  failed: { label: 'Falhou', cls: 'text-destructive' },
  pending: { label: 'Enviando', cls: 'text-warning' },
};

function PurchaseSection({ order: o }: { order: SaleOrder }) {
  const { events, loading, error } = usePurchaseEvents(o.lineIds, true);

  return (
    <div className="space-y-3 border-t border-foreground/5 px-4 py-4">
      <h3 className="text-xs font-medium">Purchase enviado à Meta</h3>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !events || events.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {o.status === 'approved'
            ? 'Nenhum Purchase foi enviado para este pedido. Ele só sai quando a área tem o pixel e o token da API de Conversões configurados.'
            : 'O Purchase só é enviado para vendas aprovadas.'}
        </p>
      ) : (
        events.map((e) => <PurchaseEventView key={e.id} event={e} />)
      )}
    </div>
  );
}

function PurchaseEventView({ event: e }: { event: PurchaseEvent }) {
  const st = PURCHASE_STATUS[e.status] ?? { label: e.status, cls: 'text-muted-foreground' };
  const when = e.sent_at ?? e.created_at;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <div>
          <dt className="text-[11px] text-muted-foreground">Status</dt>
          <dd className={cn('text-xs font-medium', st.cls)}>{st.label}</dd>
        </div>
        <Field label={e.sent_at ? 'Enviado em' : 'Criado em'} value={format(new Date(when), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} />
        <Field label="event_id" value={e.event_id} />
        <Field label="fbtrace_id" value={e.fbtrace_id} />
        <Field label="Tentativas" value={String(e.attempts ?? 0)} />
      </dl>
      {e.error && <p className="break-words text-xs text-destructive">{e.error}</p>}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <JsonBlock title="Evento enviado (dados pessoais em SHA-256)" value={e.payload} />
        <JsonBlock title="Resposta do Meta" value={e.response} />
      </div>
    </div>
  );
}

function OrderInfo({ order: o }: { order: SaleOrder }) {
  return (
    <div className="grid gap-4 px-4 py-4 md:grid-cols-3">
      <div className="space-y-2">
        <h3 className="text-xs font-medium">Produtos</h3>
        <ul className="space-y-1">
          {o.products.map((p, i) => (
            <li key={i} className="flex justify-between gap-3 text-xs">
              <span className="min-w-0 truncate">
                {p.name}
                {p.isOrderBump && <span className="ml-1 text-muted-foreground">(order bump)</span>}
              </span>
              <span className="tabular-nums">{money(p.amount, o.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-2 pt-2">
          <Field label="Pedido" value={o.orderId} />
          <Field label="Data" value={format(new Date(o.soldAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })} />
        </dl>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium">Cliente</h3>
        <dl className="grid gap-2">
          <Field label="Nome" value={o.customer.name} />
          <Field label="E-mail" value={o.customer.email} />
          <Field label="Telefone" value={o.customer.phone} />
        </dl>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium">Origem</h3>
        <dl className="grid grid-cols-2 gap-2">
          <Field label="utm_source" value={o.utm.source} />
          <Field label="utm_medium" value={o.utm.medium} />
          <Field label="utm_campaign" value={o.utm.campaign} />
          <Field label="utm_content" value={o.utm.content} />
          <Field label="utm_term" value={o.utm.term} />
          <Field label="ID do anúncio" value={o.adId} />
          <Field label="Visita" value={o.matched ? `Ligada (${o.matchMethod ?? 'indexador'})` : 'Não encontrada'} />
          <Field
            label="Purchase (Meta)"
            value={
              o.status !== 'approved'
                ? 'Não se aplica'
                : o.purchase === 'sent'
                  ? 'Enviado'
                  : o.purchase === 'failed'
                    ? `Falhou${o.purchaseError ? `: ${o.purchaseError}` : ''}`
                    : o.purchase === 'pending'
                      ? 'Enviando'
                      : 'Não enviado'
            }
          />
        </dl>
      </div>
    </div>
  );
}
