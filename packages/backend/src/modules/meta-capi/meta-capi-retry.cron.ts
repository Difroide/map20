import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MetaCapiService } from './meta-capi.service';

/**
 * Reenvio diário dos eventos que o Meta recusou. Na Vercel isso era um cron
 * externo chamando GET /api/capi/retry-cron (que continua existindo); no
 * Coolify o servidor fica de pé e agenda sozinho — sem CRON_SECRET.
 * Mesmo horário do vercel.json: 09:00 UTC.
 */
@Injectable()
export class MetaCapiRetryCron {
  private readonly logger = new Logger(MetaCapiRetryCron.name);

  constructor(private readonly capi: MetaCapiService) {}

  @Cron('0 0 9 * * *', { timeZone: 'UTC' })
  async retry() {
    try {
      const result = await this.capi.retryFailed();
      this.logger.log(`reenvio CAPI: ${JSON.stringify(result)}`);
    } catch (err: any) {
      this.logger.warn(`reenvio CAPI falhou: ${err?.message}`);
    }
  }
}
