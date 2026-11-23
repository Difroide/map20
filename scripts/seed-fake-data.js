/**
 * Seed de dados falsos para visualizar a interface.
 * Uso: node scripts/seed-fake-data.js
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const uuid = () => crypto.randomUUID();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const PRODUTOS = [
  'Método 30 dias',
  'Curso Beleza Natural',
  'Protocolo Anti-Age',
  'Fórmula Emagrecedora',
];
const PLATAFORMAS = ['hotmart', 'kiwify', 'hubla', 'perfectpay'];
const METODOS = ['pix', 'credit_card', 'boleto'];
const ESTADOS = ['SP', 'RJ', 'MG', 'PR', 'RS', 'BA', 'CE', 'GO', 'SC', 'PE'];
const CIDADES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre', 'Salvador', 'Fortaleza', 'Goiânia', 'Florianópolis', 'Recife'];
const NOMES = ['Maria Silva', 'Ana Souza', 'Carla Oliveira', 'Fernanda Lima', 'Juliana Costa', 'Patricia Mendes', 'Beatriz Alves', 'Camila Rocha', 'Larissa Nunes', 'Renata Ferreira', 'João Santos', 'Pedro Martins', 'Lucas Pereira', 'Marcos Rodrigues'];
const UTM_SOURCES = ['facebook', 'instagram', 'google', 'tiktok', 'email'];
const UTM_CAMPAIGNS = ['campanha-anti-age-01', 'remarketing-q4', 'cold-audience-br', 'lookalike-compradores', 'retargeting-video'];

(async () => {
  const client = await pool.connect();
  try {
    // Busca o admin
    const { rows: [admin] } = await client.query(
      `SELECT id FROM auth.users LIMIT 1`
    );
    if (!admin) throw new Error('Rode seed-admin.js primeiro.');
    const userId = admin.id;

    console.log('Criando workspace...');
    const { rows: [ws] } = await client.query(`
      INSERT INTO workspaces (id, user_id, name, tracking_domain)
      VALUES ($1, $2, 'Meu Negócio Digital', 'meunegocio.com.br')
      ON CONFLICT (user_id)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [uuid(), userId]);
    const workspaceId = ws.id;
    console.log(`  workspace: ${workspaceId}`);

    console.log('Criando integrações de checkout...');
    const integracoes = {};
    for (const plat of PLATAFORMAS) {
      const { rows: [integ] } = await client.query(`
        INSERT INTO checkout_integrations
          (id, user_id, workspace_id, platform, name, webhook_secret, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [uuid(), userId, workspaceId, plat, `${plat} - Meu Negócio`, `token-${plat}-${Date.now()}`]);
      if (integ) integracoes[plat] = integ.id;
    }

    console.log('Inserindo vendas (90 dias)...');
    let totalVendas = 0;
    for (let d = 89; d >= 0; d--) {
      // Entre 2 e 18 vendas por dia, mais nos últimos 30 dias
      const qtd = d < 30 ? rand(5, 18) : rand(1, 6);
      for (let i = 0; i < qtd; i++) {
        const produto = pick(PRODUTOS);
        const plat = pick(PLATAFORMAS);
        const nome = pick(NOMES);
        const estado = pick(ESTADOS);
        const cidadeIdx = ESTADOS.indexOf(estado);
        const cidade = CIDADES[cidadeIdx] || pick(CIDADES);
        const metodo = pick(METODOS);
        const source = pick(UTM_SOURCES);
        const campaign = pick(UTM_CAMPAIGNS);
        const amount = pick([97, 97, 97, 197, 197, 297, 497]);
        const isRefund = Math.random() < 0.04; // 4% de reembolso
        const status = isRefund ? 'refunded' : 'approved';
        const horasAtras = rand(0, 23);
        const minutosAtras = rand(0, 59);
        const soldAt = new Date(Date.now() - d * 86400000 - horasAtras * 3600000 - minutosAtras * 60000).toISOString();

        await client.query(`
          INSERT INTO sales
            (id, user_id, workspace_id, checkout_integration_id,
             external_id, customer_name, customer_email,
             product_name, amount, currency, status,
             payment_method, customer_state, customer_city,
             utm_source, utm_campaign, utm_content,
             sold_at, source)
          VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,'BRL',$10,$11,$12,$13,$14,$15,$16,$17,'webhook')
          ON CONFLICT DO NOTHING
        `, [
          uuid(), userId, workspaceId, integracoes[plat] || null,
          `fake-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          nome,
          `${nome.toLowerCase().replace(/ /g, '.')}@gmail.com`,
          produto, amount, status, metodo,
          estado, cidade,
          source, campaign,
          `ad-${rand(100000, 999999)}`,
          soldAt,
        ]);
        totalVendas++;
      }
    }
    console.log(`  ${totalVendas} vendas inseridas`);

    console.log('Inserindo visitantes e sessões...');
    let totalSessoes = 0;
    for (let d = 29; d >= 0; d--) {
      const qtdVisitantes = rand(30, 150);
      for (let i = 0; i < qtdVisitantes; i++) {
        const visitorId = `vis_${crypto.randomBytes(8).toString('hex')}`;
        const sessionId = `stl_${crypto.randomBytes(16).toString('hex')}`;
        const source = pick(UTM_SOURCES);
        const campaign = pick(UTM_CAMPAIGNS);
        const visitedAt = new Date(Date.now() - d * 86400000 - rand(0, 86399) * 1000).toISOString();

        await client.query(`
          INSERT INTO tracking_visitors
            (id, workspace_id, visitor_id, first_seen_at, last_seen_at,
             first_utm_source, first_utm_campaign,
             total_sessions, total_pageviews,
             country, region, city, device_type)
          VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,'BR',$9,$10,$11)
          ON CONFLICT DO NOTHING
        `, [uuid(), workspaceId, visitorId, visitedAt, source, campaign, rand(1,4), rand(1,12), pick(ESTADOS), pick(CIDADES), pick(['mobile','desktop','tablet'])]);

        await client.query(`
          INSERT INTO tracking_sessions
            (id, workspace_id, visitor_id, session_id,
             started_at, duration_seconds, pageviews,
             utm_source, utm_campaign,
             landing_page, country, region, city, device_type)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BR',$11,$12,$13)
          ON CONFLICT DO NOTHING
        `, [
          uuid(), workspaceId, visitorId, sessionId,
          visitedAt, rand(10, 480), rand(1,8),
          source, campaign,
          '/oferta', pick(ESTADOS), pick(CIDADES), pick(['mobile','desktop','tablet']),
        ]);
        totalSessoes++;
      }
    }
    console.log(`  ${totalSessoes} sessões inseridas`);

    console.log('Inserindo gasto diário em anúncios...');
    for (let d = 29; d >= 0; d--) {
      const dia = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      const campId = `120245${rand(100000000, 999999999)}`;
      await client.query(`
        INSERT INTO daily_ad_spend
          (id, user_id, workspace_id, date, spend,
           facebook_campaign_id,
           impressions, clicks, link_clicks, landing_page_views)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT DO NOTHING
      `, [
        uuid(), userId, workspaceId, dia,
        (rand(80, 350) + Math.random()).toFixed(2),
        campId,
        rand(1000, 8000), rand(50, 400), rand(40, 350), rand(30, 300),
      ]);
    }
    console.log('  30 dias de ad spend inseridos');

    console.log('\n✓ Dados fake inseridos com sucesso!');
    console.log('  Acesse http://localhost:5173 e explore o dashboard.\n');
  } finally {
    client.release();
    await pool.end();
  }
})();
