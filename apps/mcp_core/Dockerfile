FROM python:3.12-slim

WORKDIR /app

# Install tmux, bash, and curl for PTY support and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    bash \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Environment configuration
# Platform detection will auto-disable Windows-only tools on Linux
ENV KURORYUU_MCP_HOST=0.0.0.0
ENV KURORYUU_MCP_PORT=8100
ENV KURORYUU_PTY_SHELL=/bin/bash
ENV PYTHONUNBUFFERED=1

EXPOSE 8100

CMD ["python", "server.py"]
