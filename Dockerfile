FROM oven/bun:latest

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY shared/package.json shared/ 2>/dev/null || true
RUN bun install

# Copy source
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
COPY erg_talk_dist/ erg_talk_dist/

# Build client
RUN cd client && bun run build

# Expose port (Railway sets PORT env var)
EXPOSE ${PORT:-3000}

CMD ["bun", "server/index.ts"]
