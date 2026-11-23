import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSaleDto } from './whatsapp-sale.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly service: WhatsappService) {}

  /**
   * POST /api/whatsapp/sale
   *
   * Recebe uma venda confirmada do FlowZap e injeta no pipeline do MAP 2.0:
   * grava em sales → casa com a sessão do tracker → dispara Purchase na CAPI.
   *
   * Autenticação: x-api-key = workspace_id (MVP).
   */
  @Post('sale')
  @HttpCode(HttpStatus.CREATED)
  async recordSale(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: WhatsappSaleDto,
  ) {
    if (!apiKey || apiKey !== dto.workspace_id) {
      throw new UnauthorizedException('x-api-key inválido');
    }
    const result = await this.service.recordSale(dto);
    return { ok: true, ...result };
  }
}
