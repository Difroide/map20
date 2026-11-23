import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { createApp } from './bootstrap';

async function main() {
  const app = await createApp();

  const dist =
    process.env.FRONTEND_DIST || resolve(__dirname, '..', '..', 'frontend', 'dist');

  if (existsSync(dist)) {
    const fastify = app.getHttpAdapter().getInstance();

    await fastify.register(fastifyStatic as any, {
      root: dist,
      wildcard: false,
      setHeaders: (res: any, filePath: string) => {
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });

    // SPA fallback: 404s fora de /api e /health entregam o index.html para o
    // React Router resolver. Usa onSend em vez de setNotFoundHandler porque o
    // NestJS também chama setNotFoundHandler internamente e o Fastify rejeita
    // dois registros para o mesmo prefix.
    const indexHtml = readFileSync(resolve(dist, 'index.html'), 'utf-8');
    fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
      if (reply.statusCode !== 404) return payload;
      const url: string = request.raw?.url ?? request.url ?? '';
      if (url.startsWith('/api') || url.startsWith('/health')) return payload;
      reply.code(200).header('content-type', 'text/html; charset=utf-8');
      return indexHtml;
    });
  } else {
    console.warn(`Frontend não encontrado em ${dist}: servindo só a API.`);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Servidor rodando em http://localhost:${port}`);
}

main();
