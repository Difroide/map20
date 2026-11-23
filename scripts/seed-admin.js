/**
 * Cria o primeiro usuário admin no banco local.
 * Uso: node scripts/seed-admin.js
 * Lê DATABASE_URL do .env.local na raiz do projeto.
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Carrega .env.local
const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const EMAIL = process.argv[2] || process.env.ADMIN_EMAILS?.split(',')[0]?.trim();
const PASSWORD = process.argv[3] || 'mudar123';

if (!EMAIL) {
  console.error('Uso: node scripts/seed-admin.js email@exemplo.com senha');
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = await bcrypt.hash(PASSWORD, 12);
    const { rows } = await pool.query(
      `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       VALUES ($1, $2, NOW(), '{"name":"Admin"}')
       ON CONFLICT (email) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password
       RETURNING id, email`,
      [EMAIL, hash],
    );
    const user = rows[0];

    // Garante que tem linha em profiles também
    await pool.query(
      `INSERT INTO public.profiles (user_id, email, name)
       VALUES ($1, $2, 'Admin')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, user.email],
    );

    console.log(`\n✓ Usuário criado/atualizado:`);
    console.log(`  id:    ${user.id}`);
    console.log(`  email: ${user.email}`);
    console.log(`  senha: ${PASSWORD}`);
    console.log('\nFaça login em http://localhost:5173\n');
  } finally {
    await pool.end();
  }
})();
