# Use Bun Alpine image
FROM oven/bun:alpine AS base

# Install system dependencies
RUN apk add --no-cache libc6-compat openssl postgresql-client curl

WORKDIR /app

# Copy lockfiles
COPY package.json bun.lockb ./

# Install ALL dependencies
RUN bun pm cache rm && bun install

# Clean cache (optional)
RUN bun pm cache rm

# Copy source
COPY src ./src
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S bunjs -u 1001 -G nodejs

# Create logs directory with correct permissions
RUN mkdir -p /app/logs && chown -R bunjs:nodejs /app/logs

USER bunjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["bun", "run", "src/index.ts"]