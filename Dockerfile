# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install Python and required packages for faiss-node
RUN apk add --no-cache python3 py3-pip make g++

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Create data directory for FAISS index
RUN mkdir -p data

# Expose port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3008/health || exit 1

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

USER nodejs

# Start the application
CMD ["node", "dist/server.js"]

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Install Python and required packages for faiss-node
RUN apk add --no-cache python3 py3-pip make g++

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Create data directory for FAISS index
RUN mkdir -p data

# Expose port
EXPOSE 3008

# Start in development mode
CMD ["npm", "run", "dev"]