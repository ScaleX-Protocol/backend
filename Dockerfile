# Use official Node.js image
FROM node:18-alpine

# Set workdir
WORKDIR /app

# Install pnpm and postgres client
RUN npm install -g pnpm && apk update && apk add --no-cache postgresql-client

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the app
COPY . .

# Expose ponder port
EXPOSE 42070

CMD ["pnpm", "run", "dev:ponder:core-chain"]