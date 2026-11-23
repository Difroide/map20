import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { createPgClient, PgClient } from '../db/pg-client';

/**
 * Antes: wrapper do supabase-js (PostgREST + GoTrue). Agora: Postgres puro
 * (shim pg-client com a mesma interface de consulta) + autenticação própria
 * com JWT e bcrypt, para rodar num Postgres comum do Coolify.
 *
 * O nome da classe ficou para os ~40 serviços que a injetam não mudarem.
 *
 * A tabela de usuários continua sendo auth.users (criada pelo nosso schema,
 * não pelo Supabase): os FKs, o gatilho handle_new_user e as funções que
 * juntam com ela continuam valendo sem reescrever o schema.
 */

export interface AuthUser {
  id: string;
  email: string;
  created_at?: string;
  user_metadata?: Record<string, any>;
}

const TOKEN_TTL = '7d';

@Injectable()
export class SupabaseService implements OnModuleDestroy {
  private readonly client: PgClient;
  private readonly jwtSecret: string;

  constructor(private config: ConfigService) {
    this.client = createPgClient(this.config.getOrThrow<string>('DATABASE_URL'));
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  }

  getClient(): PgClient {
    return this.client;
  }

  onModuleDestroy() {
    return this.client.end();
  }

  async getUserFromToken(token: string): Promise<AuthUser | null> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
      if (!payload.sub || !payload.email) return null;
      return { id: payload.sub, email: payload.email as string };
    } catch {
      return null;
    }
  }

  /**
   * Quem administra e' quem esta em ADMIN_EMAILS.
   *
   * Guardar o papel numa coluna do banco significaria que qualquer escrita
   * indevida promove alguem. A variavel de ambiente so muda com acesso ao
   * painel do Coolify, entao o privilegio nao e alcancavel a partir do produto.
   *
   * Sem a variavel definida ninguem e admin: o padrao e fechado.
   */
  async isAdmin(userId: string): Promise<boolean> {
    const permitidos = (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (permitidos.length === 0 || !userId) return false;

    const res = await this.client.query('SELECT email FROM auth.users WHERE id = $1', [userId]);
    const email = res.rows[0]?.email?.toLowerCase();
    if (!email) return false;

    return permitidos.includes(email);
  }

  /** Senha conferida com bcrypt; devolve o token de 7 dias ou null. */
  async signIn(
    email: string,
    password: string,
  ): Promise<{ access_token: string; user: AuthUser } | null> {
    const res = await this.client.query(
      `SELECT id, email, encrypted_password, raw_user_meta_data, created_at
         FROM auth.users WHERE lower(email) = lower($1)`,
      [email.trim()],
    );
    const row = res.rows[0];
    if (!row?.encrypted_password) return null;

    const ok = await bcrypt.compare(password, row.encrypted_password);
    if (!ok) return null;

    await this.client.query('UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1', [row.id]);

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      created_at: row.created_at,
      user_metadata: row.raw_user_meta_data ?? {},
    };
    return {
      access_token: jwt.sign({ sub: row.id, email: row.email }, this.jwtSecret, {
        expiresIn: TOKEN_TTL,
      }),
      user,
    };
  }

  /**
   * Cria o usuario em auth.users; o gatilho handle_new_user cria o perfil e a
   * area dentro do mesmo INSERT, como no Supabase.
   * E-mail repetido devolve code 'email_exists', que o UsersService ja trata.
   */
  async createUser(
    email: string,
    password: string,
    metadata: Record<string, any> = {},
  ): Promise<{ user: AuthUser | null; error: { message: string; code?: string } | null }> {
    const hash = await bcrypt.hash(password, 10);
    try {
      const res = await this.client.query(
        `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
         VALUES (lower($1), $2, $3, now())
         RETURNING id, email, created_at`,
        [email.trim(), hash, JSON.stringify(metadata)],
      );
      const row = res.rows[0];
      return {
        user: { id: row.id, email: row.email, created_at: row.created_at, user_metadata: metadata },
        error: null,
      };
    } catch (err: any) {
      if (err?.code === '23505') {
        return { user: null, error: { message: 'email already registered', code: 'email_exists' } };
      }
      return { user: null, error: { message: err?.message ?? String(err) } };
    }
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 10);
    await this.client.query(
      'UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2',
      [hash, userId],
    );
  }
}
