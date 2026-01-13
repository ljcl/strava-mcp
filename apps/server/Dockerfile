FROM oven/bun:1-alpine AS base
WORKDIR /app

# Build UI (install packages needed for activity-chart build)
FROM base AS ui-builder
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/activity-chart/package.json packages/activity-chart/
COPY packages/design-system/package.json packages/design-system/
RUN bun install --frozen-lockfile --ignore-scripts
COPY packages/ packages/
RUN cd packages/activity-chart && INPUT=app.html bunx vite build

# Install server production deps only
FROM base AS server-deps
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/activity-chart/package.json packages/activity-chart/
COPY packages/design-system/package.json packages/design-system/
RUN cd apps/server && bun install --production --frozen-lockfile --ignore-scripts

# Runner
FROM base AS runner
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=server-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY apps/server/src ./apps/server/src
COPY apps/server/package.json ./apps/server/
COPY --from=ui-builder /app/dist ./dist

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["bun", "run", "apps/server/src/index.ts"]
