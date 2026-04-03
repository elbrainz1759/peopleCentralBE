# ─── Stage 1: Build ───────────────────────────────────────────────────────────
# Installs ALL dependencies and compiles TypeScript → dist/
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (better Docker layer caching)
# If package.json didn't change, this layer is reused on next build
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY . .
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
# Lean final image — only production deps + compiled dist/
FROM node:20-alpine AS production

WORKDIR /app

# dumb-init ensures signals (SIGTERM, SIGINT) are handled correctly
# so Docker can gracefully stop your container
RUN apk add --no-cache dumb-init

# Create a non-root user (security best practice)
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Install ONLY production dependencies (no devDependencies)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER nestjs

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Tell Docker this container listens on port 3000
EXPOSE 3000

# Start app using your existing start:prod script → node dist/main
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start:prod"]