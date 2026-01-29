FROM node:20-alpine

WORKDIR /app

# Install build tools for node-pty native module + tmux + bash
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    bash \
    tmux

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Environment configuration
ENV PTY_DAEMON_HOST=0.0.0.0
ENV PTY_DAEMON_PORT=7072

EXPOSE 7072

CMD ["npm", "start"]
