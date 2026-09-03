FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies in a separate layer to take advantage of Docker
# cache invalidation — only when the lockfile changes do we reinstall.
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci

# Build the production bundle.
COPY apps/web/ .
ENV NODE_ENV=production
RUN npm run build

# ── runtime stage ────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# `npm run preview` is a minimal static file server that respects
# VITE_API_PROXY_TARGET and serves the dist/ built in the previous stage.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/vite.config.ts ./vite.config.ts

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
