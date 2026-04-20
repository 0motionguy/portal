# syntax=docker/dockerfile:1.7
# Multi-stage build for trending-demo (reference Portal).
# Build context must be the monorepo root so the workspace resolves.

# ---------- deps stage ----------
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# Copy workspace manifest + lockfile first for layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/spec/package.json packages/spec/
COPY reference/trending-demo/package.json reference/trending-demo/

# Install only trending-demo's dependency closure (includes @visitportal/spec via workspace).
# --frozen-lockfile enforces the committed pnpm-lock.yaml — if CI or a local
# install has drifted the lockfile, the Docker build fails loudly instead of
# pulling in an unpinned dependency graph.
RUN pnpm install --filter trending-demo... --prod=false --frozen-lockfile

# ---------- runner stage ----------
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# Copy installed node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/spec/node_modules ./packages/spec/node_modules
COPY --from=deps /app/reference/trending-demo/node_modules ./reference/trending-demo/node_modules

# Copy source.
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/spec ./packages/spec
COPY reference/trending-demo ./reference/trending-demo

WORKDIR /app/reference/trending-demo

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# tsx loader runs TypeScript directly; matches the dev workflow and avoids a build step.
CMD ["pnpm", "exec", "tsx", "src/server.ts"]
