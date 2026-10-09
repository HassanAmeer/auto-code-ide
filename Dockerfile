# ==============================================================================
# Stage 1: Build Web Frontend and Server Bundle
# ==============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native compilation toolchain required by node-pty and native addons
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enable and prepare pnpm
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

# Copy monorepo build configs and patches
COPY package.json pnpm-lock.yaml tsconfig.base.json t3.json vite.config.ts ./
COPY pnpm-workspace.docker.yaml ./pnpm-workspace.yaml
COPY patches/ ./patches/
COPY scripts/ ./scripts/

# Copy shared packages and web/server applications
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY apps/server/ ./apps/server/

# Install workspace dependencies for web and server targets
RUN pnpm install --frozen-lockfile=false

# Build React / Vite Web Frontend
RUN pnpm --filter @t3tools/web build

# Build Node.js Server Bundle
RUN pnpm --filter t3 build:bundle

# Bundle compiled web client directly into server client distribution folder
RUN mkdir -p apps/server/dist/client && cp -r apps/web/dist/* apps/server/dist/client/

# ==============================================================================
# Stage 2: Minimal Production Runtime
# ==============================================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install runtime utilities:
# - git: essential for project repositories, worktrees, and checkpointing
# - curl, bash, ca-certificates: basic operational tools
# - chromium: enables headless server-side browser streaming for live web preview
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    bash \
    ca-certificates \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Create persistent state directory and workspace mount point
RUN mkdir -p /app/data /workspace

# Copy production artifacts and dependency closures
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Production environment defaults
ENV NODE_ENV=production \
    T3CODE_HOST=0.0.0.0 \
    T3CODE_PORT=3000 \
    T3CODE_MODE=web \
    T3CODE_HOME=/app/data \
    T3CODE_PROJECTS_DIR=/workspace \
    T3CODE_STATIC_DIR=/app/apps/server/dist/client \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE 3000

# Mount points for app state (database, settings) and user projects
VOLUME ["/app/data", "/workspace"]

# Start server in headless web mode listening on all interfaces
CMD ["node", "apps/server/dist/bin.mjs", "serve", "--host", "0.0.0.0", "--port", "3000", "--base-dir", "/app/data"]
