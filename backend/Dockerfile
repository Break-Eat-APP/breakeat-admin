# ─── Break Eat — Backend Dockerfile (Phase 10) ───────────────────────────────
#
# Multi-stage build:
#   deps     → install all dependencies (pnpm)
#   builder  → compile TypeScript + generate Prisma client
#   runner   → minimal production image (no dev deps, no src files)
#
# Build from monorepo root:
#   docker build -f backend/Dockerfile -t break-eat-backend .
#
# The image expects these env vars at runtime (see .env.example):
#   DATABASE_URL, JWT_SECRET, PORT, NODE_ENV=production, etc.

# ─── Stage 1: base — pnpm install ────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests first (layer cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/

# Install all dependencies (including devDeps needed for build)
RUN pnpm install --frozen-lockfile


# ─── Stage 2: builder — TypeScript compile + Prisma generate ─────────────────
FROM deps AS builder

WORKDIR /app

# Copy backend source
COPY backend/ ./backend/

# Generate Prisma client, then compile NestJS
RUN cd backend && pnpm db:generate && pnpm build


# ─── Stage 3: runner — lean production image ─────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install pnpm (needed for production install)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create a non-root user for security
RUN addgroup --system --gid 1001 breakeat && \
    adduser  --system --uid 1001 breakeat

# Copy workspace manifests + lock file
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/

# Production-only install (no devDeps)
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output + Prisma client from builder
COPY --from=builder /app/backend/dist        ./backend/dist
COPY --from=builder /app/backend/prisma      ./backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma

# Switch to non-root user
USER breakeat

# Expose API port
EXPOSE 3000

# Health check — matches Railway healthcheckPath
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run Prisma migrations then start the server.
# Mirrors the Railway startCommand in railway.json.
CMD ["sh", "-c", "cd backend && pnpm db:migrate:prod && node dist/main"]
