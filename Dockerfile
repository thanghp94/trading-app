# Multi-stage build: install deps, build vite frontend + tsc backend, run.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

# Persist SQLite + any future state under /data so a docker volume mount
# survives image rebuilds.
ENV JOURNAL_DB_PATH=/data/journal.db
RUN mkdir -p /data

EXPOSE 3001
CMD ["node", "dist/server/index.js"]
