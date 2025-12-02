# Use official Node.js image
FROM node:18-alpine

# Set workdir
WORKDIR /app

# Install pnpm, postgres client, and curl
RUN npm install -g pnpm && apk update && apk add --no-cache postgresql-client curl

# Copy package files and install dependencies
COPY ponder/package.json ponder/pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the app
COPY . .

# Copy ponder config files and tsconfig to app root for compatibility
COPY ponder/ponder.config.ts ponder/ponder.config.core-chain.ts ponder/ponder.config.side-chain.ts ponder/core-chain-ponder.config.ts ponder/side-chain-ponder.config.ts ponder/pg-ponder.config.ts ponder/ponder.schema.ts ponder/tsconfig.json ./

# Expose ponder port
EXPOSE 42070

CMD ["pnpm", "run", "dev:core-chain"]