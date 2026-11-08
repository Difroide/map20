import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseService } from '../../shared/services/supabase.service';
import { DebugService } from '../debug/debug.service';
import {
  buildOrders,
  periodStart,
  PurchaseRow,
  SaleOrder,
  SaleRow,
  SALES_PERIODS,
  SalesPeriod,
  SalesSummary,
  summarize,
} from './sales-list';

/** Linhas lidas por consulta. Passando disso, a aba avisa que cortou. */
const MAX_ROWS = 2000;
/** sale_id por consulta do capi_events: a lista vai na URL do PostgREST. */
const IDS_PER_QUERY = 150;

class SalesQueryDto {
  @IsUUID()
  workspace_id!: string;

  @IsOptional()
  @IsIn(SALES_PERIODS as unknown as string[])
  period?: SalesPeriod;
}

/** A aba "Vendas": os pedidos que chegaram pelos webhooks dos checkouts. */
@Controller('sales')
@UseGuards(AuthGuard)
export class SalesController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly debug: DebugService,
  ) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query() q: SalesQueryDto,
  ): Promise<{ summary: SalesSummary; orders: SaleOrder[]; truncated: boolean }> {
    await this.debug.assertOwner(userId, q.workspace_id);
    const client = this.supabase.getClient();

    const [sales, integrations] = await Promise.all([
      client
        .from('sales')
        .select(
          'id, external_id, order_external_id, amount, currency, status, payment_method, product_name, is_order_bump, customer_name, customer_email, customer_phone, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ad_id, session_id, match_method, checkout_integration_id, sold_at',
        )
        .eq('workspace_id', q.workspace_id)
        .gte('sold_at', periodStart(q.period ?? '7'))
        .order('sold_at', { ascending: false })
        .limit(MAX_ROWS),
      client.from('checkout_integrations').select('id, platform').eq('workspace_id', q.workspace_id),
    ]);
    if (sales.error) throw new Error(sales.error.message);

    const rows = (sales.data ?? []) as SaleRow[];
    const platforms = new Map<string, string>(
      ((integrations.data ?? []) as { id: string; platform: string }[]).map((i) => [i.id, i.platform]),
    );

    const ids = rows.map((r) => r.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += IDS_PER_QUERY) chunks.push(ids.slice(i, i + IDS_PER_QUERY));
    const results = await Promise.all(
      chunks.map((chunk) =>
        client
          .from('capi_events')
          .select('sale_id, status, error')
          .eq('workspace_id', q.workspace_id)
          .eq('event_name', 'Purchase')
          .in('sale_id', chunk),
      ),
    );
    // Sem o status do Purchase a lista ainda serve: o erro aqui não derruba a aba.
    const purchases = results.flatMap((r) => (r.data ?? []) as PurchaseRow[]);

    const orders = buildOrders(rows, purchases, platforms);
    return { summary: summarize(orders), orders, truncated: rows.length >= MAX_ROWS };
  }
}
