FROM oven/bun:1.3.6 AS base
WORKDIR /app
RUN bun add -g turbo@2.9.6

# 1) Prune the monorepo to the subset @strava-mcp/server needs.
#    Produces /app/out/json (package.json files only), /app/out/full (sources),
#    and /app/out/bun.lock (subset lockfile).
FROM base AS pruner
COPY . .
RUN turbo prune @strava-mcp/server --docker

# 2) Build: install full deps (dev + prod) then run turbo build.
#    Because server depends on activity-chart and cadence-trends, turbo ^build
#    runs their vite builds first, producing packages/*/dist/app.html.
FROM base AS builder
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
RUN turbo run build --filter=@strava-mcp/server^...

# 3) Runner: lean image with prod-only deps plus built app.html resources.
#    Prod install links workspace deps by symlink; we fill in the built
#    dist/ from the builder stage so createRequire(...).resolve(...) works
#    at runtime.
FROM base AS runner
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/apps/server/src ./apps/server/src
COPY --from=builder /app/apps/server/scripts ./apps/server/scripts
COPY --from=builder /app/packages/activity-chart/dist ./packages/activity-chart/dist
COPY --from=builder /app/packages/cadence-trends/dist ./packages/cadence-trends/dist

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["bun", "run", "apps/server/src/index.ts"]
