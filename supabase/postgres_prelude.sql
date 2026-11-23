-- ============================================================
-- Prelúdio para Postgres PURO (Coolify/Contabo) — rode ANTES do
-- schema_completo.sql, uma vez, num banco vazio.
--
-- O schema do painel nasceu no Supabase e referencia coisas que lá existem
-- por padrão: a tabela auth.users, as funções auth.uid()/auth.role()/
-- auth.jwt() (usadas nas policies de RLS) e os roles anon/authenticated/
-- service_role (usados em GRANT/REVOKE). Este arquivo cria essa superfície
-- num Postgres comum, para o schema_completo.sql rodar sem alteração.
--
-- Num banco assim, quem acessa é SÓ o backend, pela DATABASE_URL, como dono
-- das tabelas — RLS não se aplica ao dono, então as policies ficam inertes.
-- A autenticação dos usuários do painel é do backend (JWT + bcrypt), que lê
-- e escreve auth.users diretamente.
-- ============================================================

-- gen_random_uuid() é nativo no PG 13+; a extensão cobre versões antigas.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Roles que os GRANT/REVOKE do schema mencionam. NOLOGIN: ninguém conecta
-- com eles; existem só para os comandos não falharem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- O Supabase instala extensões num schema próprio; algumas migrations o citam.
CREATE SCHEMA IF NOT EXISTS extensions;

-- ============================================================
-- auth.users — a NOSSA tabela de usuários (não é a do Supabase)
-- ============================================================
-- Mantém o nome auth.users porque o schema inteiro aponta para ela: FKs de
-- profiles/workspaces, o gatilho handle_new_user e funções SECURITY DEFINER
-- que juntam com ela (last_sign_in_at no painel de usuários).
--
-- encrypted_password guarda hash bcrypt, gravado pelo backend (bcryptjs).
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  encrypted_password TEXT,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Stubs das funções de sessão do Supabase, citadas nas policies
-- ============================================================
-- Devolvem NULL: não há sessão PostgREST aqui. Existem só para os
-- CREATE POLICY do schema_completo.sql validarem. As policies nunca
-- barram nada porque o backend conecta como dono das tabelas.

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
  LANGUAGE sql STABLE AS 'SELECT NULL::uuid';

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
  LANGUAGE sql STABLE AS 'SELECT NULL::text';

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
  LANGUAGE sql STABLE AS 'SELECT NULL::jsonb';

CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT
  LANGUAGE sql STABLE AS 'SELECT NULL::text';
