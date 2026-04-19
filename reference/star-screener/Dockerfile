# syntax=docker/dockerfile:1.7
# Multi-stage build for star-screener (reference Portal).
# Build context must be the monorepo root so the workspace resolves.

# ---------- deps stage ----------
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# Copy workspace manifest + lockfile first for layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/spec/package.json packages/spec/
COPY reference/star-screener/package.json reference/star-screener/

# Install only star-screener's dependency closure (includes @visitportal/spec via workspace).
# --frozen-lockfile=false because the root lockfile may have drifted during the hackathon.
RUN pnpm install --filter star-screener... --prod=false --frozen-lockfile=false

# ---------- runner stage ----------
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# Copy installed node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/spec/node_modules ./packages/spec/node_modules
COPY --from=deps /app/reference/star-screener/node_modules ./reference/star-screener/node_modules

# Copy source.
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/spec ./packages/spec
COPY reference/star-screener ./reference/star-screener

WORKDIR /app/reference/star-screener

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# tsx loader runs TypeScript directly; matches the dev workflow and avoids a build step.
CMD ["pnpm", "exec", "tsx", "src/server.ts"]
