# ─── Stage 1: Install dependencies ─────────────────────────────────────────
# Base image is digest-pinned to block silent drift. Dependabot's `docker`
# ecosystem monitor will open a PR when a new digest ships for the same tag.
# To refresh manually:
#   docker buildx imagetools inspect node:25-alpine --format '{{json .Manifest.Digest}}'
# and replace the sha256 below with the new value.
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS deps
WORKDIR /app

# .npmrc is required: it sets `legacy-peer-deps=true` to satisfy
# @analogjs/vite-plugin-angular's peerOptional on @angular-devkit/build-angular
# (the legacy webpack builder) while this project uses the modern
# @angular/build (Vite-based application builder). Without this, `npm ci`
# fails to reconcile the lock file. Dependency landed in PR #113 (Vitest +
# Analog test infra); the Dockerfile didn't get the corresponding update.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ─── Stage 2: Angular production build ────────────────────────────────────
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY angular.json tsconfig.json tsconfig.app.json package.json ./
COPY src ./src
COPY public ./public

RUN npx ng build --configuration=production

# ─── Stage 3: Nginx static-serve image ────────────────────────────────────
# nginx:1.27-alpine — digest will be added by Dependabot's first docker scan.
FROM nginx:1.27-alpine AS runner

# Drop the default site and replace with our SPA + reverse-proxy config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Angular @angular/build emits to dist/<project>/browser/
COPY --from=builder /app/dist/retirement-dashboard/browser /usr/share/nginx/html

EXPOSE 8080

# Use 127.0.0.1 explicitly: nginx:alpine's /etc/hosts maps `localhost` to
# ::1, but nginx listens on IPv4 only by default. wget against `localhost`
# tries IPv6 first, gets connection refused, and the container is marked
# unhealthy even when nginx is serving fine. Compose may override this
# probe at runtime (see retirement-api/docker-compose.yml dashboard
# service); the in-image HEALTHCHECK is kept consistent for parity.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
