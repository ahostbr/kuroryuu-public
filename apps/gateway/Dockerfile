FROM python:3.12-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Environment configuration
ENV KURORYUU_GATEWAY_HOST=0.0.0.0
ENV KURORYUU_GATEWAY_PORT=8200
ENV PYTHONUNBUFFERED=1

EXPOSE 8200

CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8200"]
