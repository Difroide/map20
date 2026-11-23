# ============================================================
# Painel de tracking — imagem única para o Coolify
# Builda os dois pacotes e serve tudo de um processo só: o NestJS
# atende /api e /health e entrega o frontend estático (SPA).
# ============================================================

FROM node:22-alpine AS build
WORKDIR /app

# Instala com o lockfile primeiro: mudanças de código não invalidam o cache.
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN npm ci

COPY . .
RUN npm run build

# Só as dependências de produção na imagem final.
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/backend/package.json ./packages/backend/
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/frontend/dist ./packages/frontend/dist

ENV PORT=3001
EXPOSE 3001

# O main.js resolve o frontend em ../../frontend/dist a partir do dist do
# backend — exatamente o layout copiado acima.
CMD ["node", "packages/backend/dist/main.js"]
