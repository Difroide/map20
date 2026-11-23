import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/services/supabase.service';
import { SalesService } from '../sales/sales.service';
import { MetaCapiService } from '../meta-capi/meta-capi.service';
import { WebhookContext, webhookContext } from '../../shared/helpers/webhook-context';
import { WhatsappSaleDto } from './whatsapp-sale.dto';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly salesService: SalesService,
    private readonly metaCapi: MetaCapiService,
  ) {}

  async recordSale(dto: WhatsappSaleDto): Promise<{ sale_id: string }> {
    const { data: workspace } = await this.supabase
      .getClient()
      .from('workspaces')
      .select('id, user_id')
      .eq('id', dto.workspace_id)
      .maybeSingle();

    if (!workspace) throw new NotFoundException('Workspace not found');

    // Para anúncios Click-to-WA diretos (sem LP), o fbclid chega via source_url
    // do WhatsApp. Derivamos o fbc no formato que o Meta exige e guardamos no
    // metadata para o sendPurchase usar mesmo sem sessão web casada.
    const fbc = dto.fbclid ? `fb.1.${Date.now()}.${dto.fbclid}` : null;

    const sale = {
      user_id: workspace.user_id,
      workspace_id: dto.workspace_id,
      external_id: dto.external_id,
      status: 'approved',
      amount: dto.amount,
      currency: dto.currency ?? 'BRL',
      product_name: dto.product_name ?? null,
      customer_name: dto.name ?? null,
      customer_phone: dto.phone ?? null,
      utm_source: dto.utm_source ?? null,
      utm_medium: dto.utm_medium ?? null,
      utm_campaign: dto.utm_campaign ?? null,
      utm_content: dto.utm_content ?? null,
      utm_term: dto.utm_term ?? null,
      sold_at: new Date().toISOString(),
      metadata: {
        tracking_ref: dto.tracking_ref ?? null,
        source: 'flowzap',
        ...(fbc ? { fbc } : {}),
      },
    };

    const ctx: WebhookContext = {
      trackingRef: dto.tracking_ref ?? null,
      approvedSaleIds: [],
    };

    let saved: Record<string, any> | undefined;
    await webhookContext.run(ctx, async () => {
      saved = await this.salesService.upsertFromWebhook(sale);
    });

    if (ctx.approvedSaleIds.length > 0) {
      await this.metaCapi.sendPurchases(ctx.approvedSaleIds);
    }

    return { sale_id: saved!.id };
  }
}
