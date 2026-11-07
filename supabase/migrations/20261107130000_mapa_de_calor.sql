-- ============================================================
-- Mapa de calor (cliques e rolagem), no estilo do Clarity
-- ============================================================
-- O tracker.js manda, junto com os eventos da visita:
--   - cada clique, preso ao elemento clicado (seletor + posição relativa
--     dentro dele) e também em pixels da página, de reserva;
--   - até onde a pessoa rolou naquela página (uma linha por carregamento).
--
-- O painel abre a página real com ?stl_heatmap=<token>; o tracker, vendo o
-- token, não rastreia e carrega o desenho do mapa por cima da página. O
-- token vale por algumas horas (heatmap_until).
--
-- Só o servidor (service role) lê e grava. Retenção: 90 dias.

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS heatmap_token TEXT;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS heatmap_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.heatmap_clicks (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  page_id TEXT,
  -- origem + caminho, sem query (o mesmo formato de tracking_events.url)
  url TEXT NOT NULL,
  -- mobile (< 768px de largura) ou desktop: o layout muda entre os dois
  device TEXT NOT NULL CHECK (device IN ('mobile', 'desktop')),
  selector TEXT,
  -- posição dentro do elemento, de 0 a 1
  rx REAL,
  ry REAL,
  -- posição na página, em pixels, e o tamanho da página naquele navegador
  px INTEGER NOT NULL,
  py INTEGER NOT NULL,
  doc_w INTEGER NOT NULL,
  doc_h INTEGER NOT NULL,
  -- texto curto de botão ou link, para a lista de elementos mais clicados
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_page
  ON public.heatmap_clicks (workspace_id, url, device, created_at DESC);

CREATE TABLE IF NOT EXISTS public.heatmap_scrolls (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  url TEXT NOT NULL,
  device TEXT NOT NULL CHECK (device IN ('mobile', 'desktop')),
  -- maior profundidade vista: (rolagem + altura da janela) / altura da página
  depth_pct SMALLINT NOT NULL CHECK (depth_pct BETWEEN 0 AND 100),
  -- onde termina a primeira tela, em % da página
  fold_pct SMALLINT CHECK (fold_pct BETWEEN 0 AND 100),
  doc_h INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, session_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_page
  ON public.heatmap_scrolls (workspace_id, url, device, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_recent
  ON public.heatmap_scrolls (workspace_id, device, created_at DESC);

ALTER TABLE public.heatmap_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heatmap_scrolls ENABLE ROW LEVEL SECURITY;

-- Páginas com dados no período: visitas medidas, rolagem média, quantos
-- chegaram ao fim (90% ou mais) e cliques.
CREATE OR REPLACE FUNCTION public.heatmap_pages(
  p_workspace_id UUID,
  p_since TIMESTAMPTZ,
  p_device TEXT
)
RETURNS TABLE (url TEXT, views BIGINT, avg_depth NUMERIC, reached_end BIGINT, clicks BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT hs.url,
           count(*) AS views,
           round(avg(hs.depth_pct)::numeric, 1) AS avg_depth,
           count(*) FILTER (WHERE hs.depth_pct >= 90) AS reached_end
      FROM heatmap_scrolls hs
     WHERE hs.workspace_id = p_workspace_id
       AND hs.device = p_device
       AND hs.created_at >= p_since
     GROUP BY hs.url
  ), c AS (
    SELECT hc.url, count(*) AS clicks
      FROM heatmap_clicks hc
     WHERE hc.workspace_id = p_workspace_id
       AND hc.device = p_device
       AND hc.created_at >= p_since
     GROUP BY hc.url
  )
  SELECT s.url, s.views, s.avg_depth, s.reached_end, coalesce(c.clicks, 0) AS clicks
    FROM s LEFT JOIN c ON c.url = s.url
   ORDER BY s.views DESC
   LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.heatmap_pages(uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heatmap_pages(uuid, timestamptz, text) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'heatmap-retencao',
      '45 4 * * *',
      $job$
        DELETE FROM public.heatmap_clicks WHERE created_at < now() - interval '90 days';
        DELETE FROM public.heatmap_scrolls WHERE created_at < now() - interval '90 days';
      $job$
    );
  END IF;
END $$;
