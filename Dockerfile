# ==========================
# Stage 1 - Builder
# ==========================
FROM node:22-bookworm-slim AS builder

# Enable Corepack (pnpm)
RUN corepack enable

WORKDIR /workspace

# ------------------------------------------------------------------
# Copy only files required for dependency resolution
# ------------------------------------------------------------------

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY patches ./patches

COPY browser-worker/package.json ./browser-worker/package.json

# Install ONLY browser-worker dependencies
RUN pnpm install --filter @aixellabs/browser-worker... --frozen-lockfile

# ------------------------------------------------------------------
# Copy browser-worker source
# ------------------------------------------------------------------

COPY browser-worker ./browser-worker

# Build browser-worker
RUN pnpm --filter @aixellabs/browser-worker build

# Deploy to a self-contained directory with flattened production deps (no symlinks)
RUN pnpm --filter @aixellabs/browser-worker deploy --prod /deploy


# ==========================
# Stage 2 - Runtime
# ==========================
FROM node:22-bookworm-slim

# Install Chromium (brings all required shared libs with it)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

# /deploy contains package.json, dist/, and node_modules/ with all deps flattened
COPY --from=builder /deploy ./

EXPOSE 8080

CMD ["node", "dist/server.js"]