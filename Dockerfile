# Use official Node.js image
FROM node:18-alpine

# Set workdir to ponder directory
WORKDIR /app

# Install pnpm and postgres client
RUN npm install -g pnpm && apk update && apk add --no-cache postgresql-client

# Copy package files and install dependencies
COPY ponder/package.json ponder/pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

# Copy ponder contents (maintaining the directory structure)
COPY ponder/ ./
COPY docker-entrypoint.sh ./

# Expose ponder port
EXPOSE 42070

CMD ["pnpm", "run", "dev:core-chain"]