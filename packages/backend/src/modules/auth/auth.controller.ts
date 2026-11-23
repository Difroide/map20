import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseService, AuthUser } from '../../shared/services/supabase.service';
import { LoginDto } from './dto/login.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * Login proprio, no lugar do Supabase Auth. Sem cadastro publico e sem
 * "esqueci minha senha" por e-mail: usuario e criado pelo admin (POST /users)
 * e senha perdida e trocada pelo admin tambem.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly supabase: SupabaseService) {}

  // Mais apertado que o limite global: senha se adivinha por tentativa.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const session = await this.supabase.signIn(dto.email, dto.password);
    if (!session) throw new UnauthorizedException('E-mail ou senha incorretos');
    return session;
  }

  /** Perfil de quem esta logado; cai nos dados do token se profiles nao tem linha. */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const { data } = await this.supabase
      .getClient()
      .from('profiles')
      .select('name, email, avatar_url, created_at, active')
      .eq('user_id', user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: data?.email ?? user.email,
      name: data?.name ?? '',
      avatar_url: data?.avatar_url ?? null,
      created_at: data?.created_at ?? null,
      active: data?.active ?? true,
    };
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    const patch: Record<string, any> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.avatar_url !== undefined) patch.avatar_url = dto.avatar_url;
    if (Object.keys(patch).length > 0) {
      await this.supabase.getClient().from('profiles').update(patch).eq('user_id', user.id);
    }
    return this.me(user);
  }

  @Post('password')
  @UseGuards(AuthGuard)
  async updatePassword(@CurrentUser() user: AuthUser, @Body() dto: UpdatePasswordDto) {
    await this.supabase.updatePassword(user.id, dto.password);
    return { ok: true };
  }
}
