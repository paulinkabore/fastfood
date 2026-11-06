# Image de production : le serveur et les écrans construits dans un seul service

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 1. Construction des écrans (frontend)
FROM base AS frontend
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
RUN cd frontend && npx vite build

# 2. Serveur (backend) + écrans construits
FROM base AS app
COPY backend/package*.json backend/
RUN cd backend && npm ci
COPY backend backend
RUN cd backend && npx prisma generate
COPY --from=frontend /app/frontend/dist frontend/dist

ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV TRUST_PROXY=1
WORKDIR /app/backend
EXPOSE 4000

# La base est mise à jour (migrations) avant chaque démarrage
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]