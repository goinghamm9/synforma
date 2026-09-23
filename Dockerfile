# syntax=docker/dockerfile:1.7
# Synforma as one container: a Next.js standalone server run by Node as a non-root user. Configuration is
# environment variables at run time (.env.example); nothing secret is read at build time.

FROM node:25-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    SYNFORMA_STANDALONE=1
RUN npm run build

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S synforma && adduser -S synforma -G synforma
COPY --from=build --chown=synforma:synforma /app/.next/standalone ./
COPY --from=build --chown=synforma:synforma /app/.next/static ./.next/static
COPY --from=build --chown=synforma:synforma /app/public ./public
USER synforma
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/planner/status').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
