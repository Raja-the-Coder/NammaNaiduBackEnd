FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose the backend port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/ || exit 1

# Start the application
CMD ["node", "src/server.js"]
