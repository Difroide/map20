import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SharedModule } from './shared/shared.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { MetaCapiModule } from './modules/meta-capi/meta-capi.module';
import { DebugModule } from './modules/debug/debug.module';

const RATE_LIMIT_TTL_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

/**
 * Um GTM simplificado: o snippet (client web), os webhooks dos checkouts
 * (clients do servidor), a API de Conversões do Meta (as tags) e o modo
 * preview, que mostra tudo isso acontecendo.
 */
@Module({
  imports: [
    // Local: o .env do backend, ou o .env.local da raiz (o mesmo que o
    // frontend lê). Na Vercel nenhum existe e valem as variáveis do projeto.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env.local'] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: RATE_LIMIT_TTL_MS, limit: RATE_LIMIT_MAX_REQUESTS }]),
    SharedModule,
    WebhooksModule,
    WorkspacesModule,
    IntegrationsModule,
    HealthModule,
    UsersModule,
    TrackingModule,
    MetaCapiModule,
    DebugModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
