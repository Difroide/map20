# Plano: MAP 2.0 → UTMify-like (Meta Ads Manager integrado)

## Visão geral
Transformar o painel de tracking num gerenciador de anúncios completo:
conectar conta Meta/BM → ver campanhas/conjuntos/anúncios com métricas reais →
pausar, ativar, duplicar direto do painel → cruzar gasto de anúncio com venda
real (ROAS verdadeiro, não só o do Meta).

---

## Fase 1 — Conexão Meta / Facebook (OAuth)

**O que fazer**
- Criar um Facebook App em developers.facebook.com com as permissões:
  `ads_read`, `ads_management`, `business_management`, `pages_read_engagement`
- Implementar o fluxo OAuth 2.0 no backend:
  - `GET /api/meta/auth-url` → gera a URL de autorização do Facebook
  - `GET /api/meta/callback` → troca o code pelo token de curta duração,
    converte em token de longa duração (60 dias), salva em `facebook_connections`
- No frontend: botão "Conectar Facebook" abre popup OAuth; ao fechar, atualiza
  o status de conexão

**Tabela já existe:** `facebook_connections` (workspace_id, access_token, etc.)
Só falta criptografar o token com `EncryptionService` antes de salvar.

**Resultado:** usuário conecta a conta uma vez, token dura 60 dias,
renovação automática via cron.

---

## Fase 2 — Seleção de BM e Conta de Anúncios

**O que fazer**
- `GET /api/meta/business-accounts` → chama `/me/businesses` na Graph API,
  lista as BMs do usuário
- `GET /api/meta/ad-accounts?bm_id=X` → chama `/X/owned_ad_accounts`,
  lista as contas de anúncio
- Tela "Configurações → Meta Ads": dropdown para escolher BM + conta;
  salva `meta_ad_account_id` no workspace

**Resultado:** painel sabe em qual conta de anúncio buscar os dados.

---

## Fase 3 — Sync de Campanhas, Conjuntos e Anúncios

**O que fazer**
- Endpoint de sync manual: `POST /api/meta/sync`
- Cron diário (já existe o `@Cron` no backend): sincroniza automaticamente
- Chama a Graph API Marketing:
  - `/act_{account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget`
  - `/act_{account_id}/adsets?fields=id,name,campaign_id,status,daily_budget,targeting`
  - `/act_{account_id}/ads?fields=id,name,adset_id,status,creative{thumbnail_url,body,title}`
- Salva nas tabelas `campaigns`, `ad_sets`, `ads` (já existem no schema)

**Métricas (Insights API)**
- `/act_{account_id}/insights?fields=spend,impressions,clicks,cpm,cpc,ctr,actions&date_preset=last_30d`
- Quebrar por `campaign_id`, `adset_id`, `ad_id`
- Salva em `daily_ad_spend` (já existe)

**Resultado:** dados de campanhas e métricas no banco, prontos para exibir.

---

## Fase 4 — Interface de Gerenciamento

**Tela: Campanhas**
- Tabela com: nome, status (badge verde/vermelho), objetivo, orçamento,
  gasto, impressões, cliques, CTR, CPM, CPC, conversões, ROAS
- Filtros: data, status, objetivo
- Toggle on/off direto na linha (pausa/ativa)
- Botão "Duplicar" (abre modal com opções de novo nome/orçamento)

**Tela: Conjuntos (Ad Sets)**
- Drill-down ao clicar numa campanha
- Mesmas métricas + público-alvo resumido

**Tela: Anúncios**
- Drill-down ao clicar num conjunto
- Preview do criativo (thumbnail + headline + copy)
- Métricas por anúncio
- Toggle pause/ativar, botão duplicar

**Componentes reutilizáveis a criar**
- `MetricsTable` — tabela genérica com sort, paginação, colunas configuráveis
- `StatusToggle` — switch que chama a API e reverte se der erro
- `DuplicateModal` — nome + orçamento + nível (campanha/conjunto/anúncio)

---

## Fase 5 — Ações via API (Pause, Ativar, Duplicar)

**Endpoints backend**
```
PATCH /api/meta/campaigns/:id/status   { status: 'ACTIVE' | 'PAUSED' }
PATCH /api/meta/adsets/:id/status
PATCH /api/meta/ads/:id/status
POST  /api/meta/campaigns/:id/duplicate  { name, daily_budget? }
POST  /api/meta/adsets/:id/duplicate     { name, campaign_id? }
POST  /api/meta/ads/:id/duplicate        { name, adset_id? }
```

**Graph API calls**
- Status: `POST /{id}` com `{ status: 'PAUSED' }`
- Duplicar campanha: `POST /act_{account}/campaigns` copiando os campos
- Duplicar conjunto/anúncio: mesma lógica

---

## Fase 6 — ROAS Real (Meta × Webhook)

**A diferença do UTMify:** o ROAS calculado aqui usa vendas reais dos webhooks,
não a conversão aproximada do pixel Meta.

**Como funciona**
- Venda entra via webhook → `sales` já tem `utm_content` (que contém o `ad_id`)
- Gasto do dia vem de `daily_ad_spend` (preenchido pelo sync)
- Cálculo: `receita_por_anuncio / gasto_por_anuncio`
- Exibir como "ROAS Real" ao lado do "ROAS Meta" na tabela de anúncios

**Tabela:** `sales.ad_id` ↔ `daily_ad_spend.facebook_ad_id` — join direto.

---

## Ordem de execução sugerida

| # | Fase | Esforço | Valor |
|---|------|---------|-------|
| 1 | OAuth + salvar token | Médio | Desbloqueia tudo |
| 2 | Seleção BM/conta | Pequeno | Configuração única |
| 3 | Sync campanhas + métricas | Médio | Ver os dados |
| 4 | Interface (tabelas + drill-down) | Grande | Visualizar |
| 5 | Pause/Ativar/Duplicar | Médio | Gerenciar |
| 6 | ROAS real | Pequeno | Diferencial |

**Começar pela Fase 1** — sem o token conectado, nada das outras fases funciona.

---

## O que já existe no projeto (não precisa criar)

- Tabelas: `facebook_connections`, `campaigns`, `ad_sets`, `ads`, `daily_ad_spend`
- `EncryptionService` para criptografar o token
- `@Cron` scheduler para sync automático
- Meta CAPI já conectado (mesmo token de pixel pode ser reaproveitado para
  validar se a conta está ativa)
- `workspace_id` em tudo — multi-conta já funciona por design
