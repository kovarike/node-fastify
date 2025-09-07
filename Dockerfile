# Etapa 1: Instala dependências
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Etapa 2: Copia código e dependências
FROM node:20-alpine AS runner
WORKDIR /app

# Copia dependências instaladas
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copia todo o código fonte
COPY . .

# Expõe a porta da API
EXPOSE 8080

# Usa .env local (ajuste se quiser variáveis via Docker secrets/env)
ENV NODE_ENV=production

# Comando de inicialização (tsx + .env)
CMD ["npx", "tsx", "--env-file", ".env", "src/server.ts"]
