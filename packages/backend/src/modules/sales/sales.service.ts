import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/services/supabase.service';
import { VisitorMatchingService } from '../tracking/visitor-matching.service';
import { webhookContext } from '../../shared/helpers/webhook-context';
import { debugContext } from '../debug/debug-context';

/**
 * Gravação da venda que o webhook do checkout trouxe. A venda é o que liga o
 * comprador à visita (indexador stl_<sessão>) e de onde sai o Purchase da CAPI.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly visitorMatching: VisitorMatchingService,
  ) {}

  async upsertFromWebhook(sale: Record<string, any>): Promise<Record<string, any>> {
    // O snippet de rastreio escreve sck=stl_<sessao> no link do checkout.
    // Alguns processors usam o sck como último recurso para achar o ad_id,
    // e sem esta limpeza o id da sessão ia parar em sales.ad_id. O marcador
    // vai para o metadata, que é onde o casamento com a visita o procura.
    if (typeof sale.ad_id === 'string' && sale.ad_id.startsWith('stl_')) {
      sale = { ...sale, ad_id: null, metadata: { ...(sale.metadata ?? {}), tracking_ref: sale.ad_id } };
    }

    // O indexador achado no corpo cru do webhook (webhook-context). Cobre as
    // plataformas cujo processor não guarda o parâmetro em lugar nenhum.
    const ctx = webhookContext.getStore();
    if (ctx?.trackingRef && !sale.metadata?.tracking_ref) {
      sale = { ...sale, metadata: { ...(sale.metadata ?? {}), tracking_ref: ctx.trackingRef } };
    }

    // O debug do servidor mostra a venda como o processor a entendeu.
    const debug = debugContext.getStore();
    debug?.setWorkspace(sale.workspace_id ?? null);
    debug?.variable('Venda', {
      status: sale.status,
      external_id: sale.external_id,
      amount: sale.amount,
      currency: sale.currency,
      product_name: sale.product_name,
      customer_email: sale.customer_email,
      customer_phone: sale.customer_phone,
      tracking_ref: sale.metadata?.tracking_ref ?? null,
    });

    if (sale.status !== 'approved') {
      const pending = await this.persist(sale);
      await this.visitorMatching.matchSale(pending.id);
      debug?.log(`Venda ${sale.external_id} gravada com status "${sale.status}": Purchase não sai.`);
      return pending;
    }

    // Idempotência: a reentrega do webhook não grava nem envia de novo.
    const existing = await this.findByExternalId(sale.external_id, sale.user_id);
    if (existing) {
      debug?.log(`Venda ${sale.external_id} já existia: reentrega do webhook, nada a fazer.`);
      return existing;
    }

    const saved = await this.persist(sale);

    // Liga a venda à visita rastreada, se houver. Aguardado: na Vercel a
    // função congela quando o webhook responde. Nunca lança.
    await this.visitorMatching.matchSale(saved.id);

    // Venda aprovada nova: entra na lista do Purchase da CAPI, enviado quando
    // o webhook terminar (WebhookQueueService).
    ctx?.approvedSaleIds.push(saved.id);
    return saved;
  }

  private async findByExternalId(externalId: string, userId: string): Promise<Record<string, any> | null> {
    const { data } = await this.supabase
      .getClient()
      .from('sales')
      .select('id, status')
      .eq('external_id', externalId)
      .eq('user_id', userId)
      .maybeSingle();
    return data ?? null;
  }

  private async persist(sale: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await this.supabase.getClient().from('sales').insert(sale).select('id').single();
    if (error) throw new Error(error.message);
    return data;
  }
}
