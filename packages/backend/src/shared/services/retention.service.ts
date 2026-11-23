import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from './supabase.service';

/**
 * Expurgos que no Supabase rodavam como jobs do pg_cron (schema_completo.sql).
 * Num Postgres puro do Coolify não há pg_cron, e o servidor agora fica de pé
 * o tempo todo — então os mesmos DELETEs rodam aqui, nos mesmos horários.
 *
 * Idempotentes: num banco que TEM pg_cron (Supabase), rodarem nos dois
 * lugares não muda o resultado.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private async run(label: string, statements: string[]) {
    for (const sql of statements) {
      try {
        const res = await this.supabase.getClient().query(sql);
        this.logger.log(`[retencao:${label}] ${res.rowCount ?? 0} linhas — ${sql.trim().slice(0, 60)}…`);
      } catch (err: any) {
        // Tabela de migration que ainda não rodou não derruba as demais.
        this.logger.warn(`[retencao:${label}] ${err?.message}`);
      }
    }
  }

  /** gtm_events: 30 dias (job 'gtm-events-retention', 04:00 UTC). */
  @Cron('0 0 4 * * *', { timeZone: 'UTC' })
  gtmEvents() {
    return this.run('gtm-events', [
      `DELETE FROM public.gtm_events WHERE created_at < now() - interval '30 days'`,
    ]);
  }

  /** Rastreio e CAPI (job 'tracking-retention', 04:30 UTC). */
  @Cron('0 30 4 * * *', { timeZone: 'UTC' })
  tracking() {
    return this.run('tracking', [
      `DELETE FROM public.tracking_events WHERE occurred_at < now() - interval '90 days'`,
      `UPDATE public.tracking_sessions SET ip_address = NULL
         WHERE ip_address IS NOT NULL AND started_at < now() - interval '90 days'`,
      `DELETE FROM public.tracking_sessions WHERE sale_id IS NULL AND started_at < now() - interval '1 year'`,
      `DELETE FROM public.capi_events WHERE created_at < now() - interval '10 days'`,
    ]);
  }

  /** Mapa de calor: 90 dias (job 'heatmap-retencao', 04:45 UTC). */
  @Cron('0 45 4 * * *', { timeZone: 'UTC' })
  heatmap() {
    return this.run('heatmap', [
      `DELETE FROM public.heatmap_clicks WHERE created_at < now() - interval '90 days'`,
      `DELETE FROM public.heatmap_scrolls WHERE created_at < now() - interval '90 days'`,
    ]);
  }

  /** Preview/debug: 24 horas (job 'debug-traces-retencao', de hora em hora). */
  @Cron('0 17 * * * *', { timeZone: 'UTC' })
  debugTraces() {
    return this.run('debug-traces', [
      `DELETE FROM public.debug_traces WHERE created_at < now() - interval '24 hours'`,
    ]);
  }
}
