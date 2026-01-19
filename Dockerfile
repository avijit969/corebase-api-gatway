FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "src/index.ts"]
