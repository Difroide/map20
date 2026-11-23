import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from '../auth/dto/update-password.dto';
import { SupabaseService } from '../../shared/services/supabase.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Diz se quem esta logado administra. A tela usa isso so para mostrar ou
   * esconder a aba — quem protege sao os guards abaixo, no servidor.
   */
  @Get('permissions')
  @UseGuards(AuthGuard)
  async permissions(@CurrentUser() user: any): Promise<{ is_admin: boolean }> {
    return { is_admin: await this.supabase.isAdmin(user.id) };
  }

  @Get()
  @UseGuards(AuthGuard, AdminGuard)
  list() {
    return this.usersService.list();
  }

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /**
   * Admin define a senha de outro usuario. Sem servidor de e-mail nao ha
   * "esqueci minha senha" com link: este endpoint e o caminho da senha perdida.
   */
  @Post(':id/password')
  @UseGuards(AuthGuard, AdminGuard)
  async setPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePasswordDto,
  ) {
    await this.supabase.updatePassword(id, dto.password);
    return { ok: true };
  }
}
