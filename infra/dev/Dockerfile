FROM node:20-alpine

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies first for better caching
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

EXPOSE 3000

# Start in development mode with watch
CMD ["pnpm", "start:dev"]
