-- ============================================================
-- Modo preview (debug web e server, no estilo do GTM)
-- ============================================================
-- O painel liga o preview de uma área por um tempo (debug_until). Enquanto
-- ele está ligado, o servidor grava o rastro de cada requisição da área —
-- /collect do snippet e webhooks dos checkouts — e o navegador aberto pelo
-- preview (o que carrega o token debug_token) manda o que acontece na página.
--
-- Fora do preview nada é gravado aqui. Rastros duram 24 horas.

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS debug_until TIMESTAMPTZ;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS debug_token TEXT;

CREATE TABLE IF NOT EXISTS public.debug_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- web: mensagem do navegador em preview; server: requisição que o servidor atendeu
  source TEXT NOT NULL CHECK (source IN ('web', 'server')),
  -- collect, webhook (server) ou o tipo da mensagem do navegador
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  -- ok, warning, error
  status TEXT NOT NULL DEFAULT 'ok',
  -- Token do preview: liga as requisições ao navegador que está depurando.
  browser_token TEXT,
  page_id TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_debug_traces_workspace_created
  ON public.debug_traces (workspace_id, created_at DESC);

-- Só o servidor (service role) lê e grava.
ALTER TABLE public.debug_traces ENABLE ROW LEVEL SECURITY;

-- Retenção: 24 horas. O servidor também limpa ao ligar o preview; o job é a
-- garantia para área que nunca mais abre o painel.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'debug-traces-retencao',
      '17 * * * *',
      $job$DELETE FROM public.debug_traces WHERE created_at < now() - interval '24 hours'$job$
    );
  END IF;
END $$;
