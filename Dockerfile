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

# Remove dev dependencies
RUN pnpm --filter @aixellabs/browser-worker prune --prod


# ==========================
# Stage 2 - Runtime
# ==========================
FROM node:22-bookworm-slim

RUN corepack enable

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /workspace/browser-worker/dist ./dist
COPY --from=builder /workspace/browser-worker/package.json ./
COPY --from=builder /workspace/browser-worker/node_modules ./node_modules

EXPOSE 8080

CMD ["node", "dist/server.js"]