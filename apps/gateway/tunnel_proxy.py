"""
Kuroryuu Tunnel Proxy - Sits between Cloudflare and Gateway.
Forwards requests to Gateway (8200), shows maintenance page if Gateway is down.
Run this on port 8199 and point Cloudflare Tunnel to it.

Environment Variables:
    KURORYUU_GATEWAY_HOST: Gateway host (default: localhost)
    KURORYUU_GATEWAY_PORT: Gateway port (default: 8200)
    KURORYUU_PROXY_PORT: Proxy port (default: 8199)
"""
import http.client
import os
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import sys

# Configuration from environment (or defaults)
GATEWAY_HOST = os.environ.get("KURORYUU_GATEWAY_HOST", "localhost")
GATEWAY_PORT = int(os.environ.get("KURORYUU_GATEWAY_PORT", "8200"))
PROXY_PORT = int(os.environ.get("KURORYUU_PROXY_PORT", "8199"))

MAINTENANCE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kuroryuu - Offline</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #09090b;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #fafafa;
        }
        .container {
            text-align: center;
            padding: 2rem;
            max-width: 500px;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
            color: #a1a1aa;
        }
        p {
            color: #71717a;
            line-height: 1.6;
            margin-bottom: 1.5rem;
        }
        .status {
            display: inline-block;
            padding: 0.5rem 1rem;
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 6px;
            font-size: 0.875rem;
            color: #a1a1aa;
        }
        .dragon {
            font-size: 4rem;
            margin-bottom: 1rem;
            filter: grayscale(1) opacity(0.5);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="dragon">🐉</div>
        <h1>Kuroryuu is Sleeping</h1>
        <p>The chat server is currently offline for maintenance or updates. Please check back in a few minutes.</p>
        <div class="status">Server Status: Offline</div>
    </div>
</body>
</html>
"""


def is_gateway_up():
    """Quick check if Gateway is accepting connections."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((GATEWAY_HOST, GATEWAY_PORT))
        sock.close()
        return result == 0
    except:
        return False


class ProxyHandler(BaseHTTPRequestHandler):
    def proxy_request(self, method):
        if not is_gateway_up():
            self.send_maintenance_page()
            return
        
        try:
            # Forward to Gateway
            conn = http.client.HTTPConnection(GATEWAY_HOST, GATEWAY_PORT, timeout=30)
            
            # Read request body if present
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else None
            
            # Forward headers (excluding hop-by-hop)
            headers = {}
            for key, value in self.headers.items():
                if key.lower() not in ('host', 'connection', 'keep-alive', 'transfer-encoding'):
                    headers[key] = value
            headers['Host'] = f"{GATEWAY_HOST}:{GATEWAY_PORT}"
            
            # Make request
            conn.request(method, self.path, body=body, headers=headers)
            response = conn.getresponse()
            
            # Send response back
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(key, value)
            self.end_headers()
            
            # Stream response body
            self.wfile.write(response.read())
            conn.close()
            
        except Exception as e:
            print(f"[Proxy] Error forwarding request: {e}")
            self.send_maintenance_page()
    
    def send_maintenance_page(self):
        self.send_response(503)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Retry-After', '30')
        self.end_headers()
        self.wfile.write(MAINTENANCE_HTML.encode('utf-8'))
    
    def do_GET(self):
        self.proxy_request('GET')
    
    def do_POST(self):
        self.proxy_request('POST')
    
    def do_PUT(self):
        self.proxy_request('PUT')
    
    def do_DELETE(self):
        self.proxy_request('DELETE')
    
    def do_OPTIONS(self):
        self.proxy_request('OPTIONS')
    
    def do_PATCH(self):
        self.proxy_request('PATCH')
    
    def log_message(self, format, *args):
        status = "-> Gateway" if is_gateway_up() else "-> Maintenance"
        print(f"[Proxy {status}] {args[0]}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PROXY_PORT
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f"+------------------------------------------------------+")
    print(f"|  Kuroryuu Tunnel Proxy running on port {port}          |")
    print(f"|  Forwarding to Gateway at {GATEWAY_HOST}:{GATEWAY_PORT}            |")
    print(f"|  Maintenance page shown when Gateway is down         |")
    print(f"+------------------------------------------------------+")
    
    gateway_status = "UP" if is_gateway_up() else "DOWN"
    print(f"Gateway status: {gateway_status}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down proxy...")
        server.shutdown()


if __name__ == "__main__":
    main()
