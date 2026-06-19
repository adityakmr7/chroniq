FROM oven/bun:1.2.19
WORKDIR /usr/src/app

# Install system dependencies, including FFmpeg for video rendering
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy package files first to optimize Docker build caching
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/agents/package.json ./packages/agents/
COPY packages/db/package.json ./packages/db/

# Install workspaces dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Expose ports for API and Dashboard
EXPOSE 3000
EXPOSE 5173
