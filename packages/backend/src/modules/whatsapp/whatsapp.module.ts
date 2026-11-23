import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { MetaCapiModule } from '../meta-capi/meta-capi.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [SalesModule, MetaCapiModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
