import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { DebugHttpCall, ServerTrace } from '@/hooks/usePreview';
import { Empty, JsonBlock, TagList, TimelineItem, UserDataTable, VariablesTable, isUserData, time } from './parts';
import { useFollowSelection } from './useFollowSelection';

/**
 * Lado servidor: cada requisição que o servidor atendeu com o preview ligado
 * — /collect do snippet e webhooks dos checkouts —, como o preview do GTM
 * Server: request, client, tags, variáveis, HTTP de saída e console.
 */
export function ServerDebug({ traces }: { traces: ServerTrace[] }) {
  const [onlyMine, setOnlyMine] = useState(false);
  const visible = useMemo(() => (onlyMine ? traces.filter((t) => t.browser_token) : traces), [traces, onlyMine]);
  const { selected, select } = useFollowSelection(visible);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
        <Label htmlFor="only-mine" className="text-xs text-muted-foreground">
          Só as requisições do navegador em preview (esconde visitantes reais e webhooks)
        </Label>
      </div>

      {visible.length === 0 ? (
        <Empty>
          Nenhuma requisição ainda. Com o preview ligado, aparecem aqui todos os /collect do snippet e todos os webhooks
          dos checkouts deste container — inclusive os recusados.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="max-h-[70vh] space-y-0.5 overflow-y-auto rounded-lg border border-foreground/10 p-2">
            {visible.map((trace, i) => (
              <TimelineItem
                key={trace.id}
                n={i + 1}
                title={trace.title}
                subtitle={`${trace.data?.client ?? trace.kind} · ${time(trace.created_at)}`}
                status={trace.status}
                badge={trace.browser_token ? 'preview' : null}
                selected={selected?.id === trace.id}
                onClick={() => select(trace.id)}
              />
            ))}
          </div>
          {selected && <ServerDetail trace={selected} />}
        </div>
      )}
    </div>
  );
}

function ServerDetail({ trace }: { trace: ServerTrace }) {
  const d = trace.data;
  const [tab, setTab] = useState('tags');
  const [httpOpen, setHttpOpen] = useState<number | null>(null);
  const status = d.response?.status ?? null;

  // Outra requisição selecionada: a chamada HTTP aberta era da anterior.
  useEffect(() => setHttpOpen(null), [trace.id]);

  const openHttp = (index: number) => {
    setHttpOpen(index);
    setTab('http');
  };

  return (
    <div className="min-w-0 space-y-4 rounded-lg border border-foreground/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-medium text-foreground">{trace.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {time(trace.created_at)} · {d.request.method} {d.request.path}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Chip>Client: {d.client}</Chip>
          {status !== null && <Chip tone={status >= 400 ? 'error' : 'ok'}>HTTP {status}</Chip>}
          <Chip>{d.durationMs} ms</Chip>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="tags">Tags ({d.tags.length})</TabsTrigger>
          <TabsTrigger value="request">Request</TabsTrigger>
          <TabsTrigger value="vars">Variáveis</TabsTrigger>
          <TabsTrigger value="http">HTTP de saída ({d.http.length})</TabsTrigger>
          <TabsTrigger value="console">Console ({d.logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tags">
          <TagList tags={d.tags} onOpenHttp={openHttp} />
        </TabsContent>

        <TabsContent value="request" className="space-y-3">
          <Section title="Query">
            {Object.keys(d.request.query ?? {}).length ? <VariablesTable vars={d.request.query} /> : <Empty>Sem query.</Empty>}
          </Section>
          <Section title="Corpo recebido">
            <JsonBlock value={d.request.body} />
          </Section>
          <Section title="Headers">
            <VariablesTable vars={d.request.headers} />
          </Section>
          <Section title="Resposta enviada">
            <JsonBlock value={d.response} />
          </Section>
        </TabsContent>

        <TabsContent value="vars" className="space-y-3">
          {Object.keys(d.variables ?? {}).length === 0 ? (
            <Empty>Nenhuma variável: a requisição parou antes de virar evento (veja o Console).</Empty>
          ) : (
            Object.entries(d.variables).map(([name, value]) => (
              <Section key={name} title={name}>
                {isUserData(value) ? (
                  <UserDataTable fields={value} />
                ) : value && typeof value === 'object' && !Array.isArray(value) ? (
                  <VariablesTable vars={value as Record<string, unknown>} />
                ) : typeof value === 'string' ? (
                  <p className="rounded-md border border-foreground/10 px-3 py-2 text-xs text-foreground">{value}</p>
                ) : (
                  <JsonBlock value={value} />
                )}
              </Section>
            ))
          )}
        </TabsContent>

        <TabsContent value="http" className="space-y-2">
          {d.http.length === 0 ? (
            <Empty>Nenhuma chamada saiu do servidor nesta requisição.</Empty>
          ) : (
            d.http.map((call, i) => (
              <HttpCall key={i} call={call} open={httpOpen === i || d.http.length === 1} onToggle={() => setHttpOpen(httpOpen === i ? null : i)} />
            ))
          )}
        </TabsContent>

        <TabsContent value="console">
          {d.logs.length === 0 ? (
            <Empty>Nada no console.</Empty>
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-md border border-foreground/10 bg-foreground/[0.03] p-2 font-mono text-xs">
              {d.logs.map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-2 border-b border-foreground/5 px-1 py-1 last:border-0',
                    l.level === 'error' && 'text-destructive',
                    l.level === 'warn' && 'text-warning',
                  )}
                >
                  <span className="w-12 shrink-0 text-right text-muted-foreground">+{l.at}ms</span>
                  {l.context && <span className="shrink-0 text-muted-foreground">[{l.context}]</span>}
                  <span className="whitespace-pre-wrap break-all">{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HttpCall({ call, open, onToggle }: { call: DebugHttpCall; open: boolean; onToggle: () => void }) {
  const ok = call.status !== null && call.status < 400 && !call.error;
  return (
    <div className="rounded-md border border-foreground/10">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
        <Chip tone={ok ? 'ok' : 'error'}>{call.status ?? 'sem resposta'}</Chip>
        <span className="font-mono text-foreground">{call.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{call.url}</span>
        <span className="shrink-0 text-muted-foreground">{call.durationMs} ms</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-foreground/10 p-3">
          {call.error && <p className="text-xs text-destructive">{call.error}</p>}
          <Section title="Corpo enviado">
            <JsonBlock value={call.requestBody} />
          </Section>
          <Section title="Resposta">
            <JsonBlock value={call.responseBody} />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'ok' | 'error' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono',
        tone === 'error' ? 'bg-destructive/10 text-destructive' : tone === 'ok' ? 'bg-success/10 text-success' : 'bg-foreground/5 text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
