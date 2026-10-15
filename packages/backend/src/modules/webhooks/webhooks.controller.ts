import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { FastifyRequest, FastifyReply } from 'fastify';
import { extractWebhookToken } from '../../shared/helpers/extract-webhook-token';
import { WebhookParamsDto } from './dto/webhook-params.dto';
import { WebhookQueueService } from './webhook-queue.service';
import { N8nProfilesProcessor } from './processors/n8n-profiles.processor';
import { GENERIC_PLATFORMS } from './processors/generic/checkout-specs';
import { DebugService } from '../debug/debug.service';
import { debugContext, DebugTrace } from '../debug/debug-context';

/** Platforms that process synchronously in the controller (not via WebhookQueueService). */
const CONTROLLER_PROCESSORS: Record<string, true> = {
  'n8n-profiles': true,
};

/**
 * Platforms whose processor validates authentication itself (e.g., HMAC signature).
 * These bypass the controller-level token pre-check because the auth material is
 * not a simple token in a header/body field — typically it's a per-payload signature
 * sent via querystring (Kiwify) or custom handler logic (n8n-profiles).
 */
const SELF_AUTHENTICATING_PLATFORMS = new Set([
  'kiwify',
  'n8n-profiles',
  'mundpay',
  // As dos containers do sGTM: token na URL (?token=), conferido no processor.
  ...GENERIC_PLATFORMS,
]);

/** All known platforms (sync + queued). */
const KNOWN_PLATFORMS = new Set([
  'kirvano',
  'hotmart',
  'guru',
  'perfectpay',
  'kiwify',
  'ticto',
  'cakto',
  'payt',
  'n8n-profiles',
  'hubla',
  'cartpanda',
  'ggcheckout',
  'lastlink',
  'eduzz',
  'mundpay',
  'monetizze',
  'greenn',
  ...GENERIC_PLATFORMS,
]);

@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhookQueue: WebhookQueueService,
    private readonly n8nProfiles: N8nProfilesProcessor,
    private readonly debug: DebugService,
  ) {}

  /**
   * Cada webhook roda dentro de um rastro de debug. Com a área em preview, o
   * painel mostra o corpo recebido, a venda que o processor extraiu, o
   * Purchase que saiu (ou por que não saiu) e o console.
   */
  @Post(':platform')
  async handleWebhook(
    @Param() params: WebhookParamsDto,
    @Body() body: any,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const trace = new DebugTrace('webhook', `Webhook — ${platformName(params.platform)}`, {
      method: 'POST',
      path: `/api/webhooks/${params.platform}`,
      query: (req.query as Record<string, unknown>) ?? {},
      headers,
      body: (req as any).rawBody ?? body,
    });

    // O Fastify manda a resposta quando send() é chamado; aqui ela é
    // interceptada para entrar no rastro, e o rastro é gravado antes de a
    // resposta sair (na Vercel nada roda depois dela).
    let reply: { status: number; body: any } = { status: 200, body: null };
    const capture = {
      status: (code: number) => ({
        send: (payload: any) => {
          reply = { status: code, body: payload };
        },
      }),
    } as unknown as FastifyReply;

    await debugContext.run(trace, () => this.process(params, body, req, capture));

    const token = extractWebhookToken({ headers }, body, params.platform) ?? (req.query as any)?.token ?? null;
    trace.respond(reply.status, reply.body);
    if (trace.events.length === 0) trace.event(`HTTP ${reply.status}`);
    trace.title = `${platformName(params.platform)} — ${trace.events.join(', ')}`;
    await this.debug.saveServerTrace(trace, token);

    res.status(reply.status).send(reply.body);
  }

  private async process(
    params: WebhookParamsDto,
    body: any,
    req: FastifyRequest,
    res: FastifyReply,
  ): Promise<void> {
    const { platform } = params;
    this.logger.log(`Webhook received for platform: ${platform}`);

    if (!KNOWN_PLATFORMS.has(platform)) {
      res.status(404).send({ error: `Unknown platform: ${platform}` });
      return;
    }

    try {
      const headers: Record<string, string | string[] | undefined> =
        req.headers as any;
      const authToken = extractWebhookToken({ headers }, body, platform);

      // Reject webhooks without auth token, unless the platform's processor validates auth itself
      // (e.g., Kiwify validates HMAC signature from querystring; n8n-profiles runs custom logic).
      if (!authToken && !SELF_AUTHENTICATING_PLATFORMS.has(platform)) {
        // Os nomes dos headers recebidos, sem os valores: e o que diz qual
        // header a plataforma usa quando ela nao esta na lista do extrator.
        this.logger.warn(
          `Webhook ${platform}: recusado — sem token. Headers recebidos: ` +
            Object.keys(headers).join(', '),
        );
        // 401, e nao 200. Responder sucesso aqui escondia a falha: a
        // plataforma marcava a entrega como certa e a venda sumia sem
        // deixar rastro. Com 401 o erro aparece no painel do checkout, e a
        // reentrega automatica grava a venda assim que o token for corrigido.
        res.status(401).send({ success: false, message: 'Missing authentication token' });
        return;
      }

      // Guru and n8n-profiles have their own processors in the controller
      if (CONTROLLER_PROCESSORS[platform]) {
        const result = await this.processSynchronously(
          platform,
          body,
          authToken,
        );
        res.status(result.status).send(result.body);
        return;
      }

      // All checkout platforms are processed directly (no queue)
      const rawBody = (req as any).rawBody || JSON.stringify(body);
      const queryParams: Record<string, string> = (req.query as any) || {};

      const result = await this.webhookQueue.processDirect({
        platform,
        body,
        authToken,
        headers,
        rawBody,
        queryParams,
      });

      res.status(result.status).send(result.body);
    } catch (error: any) {
      this.logger.error(
        `Webhook ${platform} error: ${error.message}`,
        error.stack,
      );
      res.status(500).send({
        error: 'Internal server error',
        details: error.message,
      });
    }
  }

  private async processSynchronously(
    platform: string,
    body: any,
    authToken: string | null,
  ): Promise<{ status: number; body: any }> {
    if (platform === 'n8n-profiles') {
      return this.n8nProfiles.process(body, authToken);
    }
    return { status: 404, body: { error: `Unknown sync platform: ${platform}` } };
  }
}

const PLATFORM_NAMES: Record<string, string> = {
  hotmart: 'Hotmart',
  kiwify: 'Kiwify',
  kirvano: 'Kirvano',
  guru: 'Guru',
  perfectpay: 'Perfect Pay',
  ticto: 'Ticto',
  cakto: 'Cakto',
  payt: 'PayT',
  hubla: 'Hubla',
  cartpanda: 'CartPanda',
  ggcheckout: 'GG Checkout',
  lastlink: 'LastLink',
  eduzz: 'Eduzz',
  mundpay: 'Mundpay',
  monetizze: 'Monetizze',
  greenn: 'Greenn',
};

function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}
