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

# Fundamentals layer shells out to python3 + vnstock (pinned in requirements.txt).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
# The python CLI scripts are read at runtime (not bundled by tsc/vite).
COPY scripts/vnstock-fundamentals.py ./scripts/vnstock-fundamentals.py
COPY scripts/vnstock-ownership.py ./scripts/vnstock-ownership.py

# Persist SQLite + any future state under /data so a docker volume mount
# survives image rebuilds.
ENV JOURNAL_DB_PATH=/data/journal.db
RUN mkdir -p /data

EXPOSE 3001
CMD ["node", "dist/server/index.js"]
