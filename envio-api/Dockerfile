# Build stage
FROM oven/bun:slim AS dependencies
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Runtime stage  
FROM oven/bun:slim AS runner
WORKDIR /app

# Copy dependencies from build stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./

# Copy source code
COPY src ./src
COPY tsconfig.json drizzle.config.ts ./

EXPOSE 3000
ENTRYPOINT [ "bun", "run", "src/index.ts" ]