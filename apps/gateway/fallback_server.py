"""
Kuroryuu Fallback Server - Shows maintenance page when Gateway is down.
Runs on port 8201 as a backup origin for Cloudflare Tunnel.
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import sys

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
        .logo {
            width: 120px;
            height: 120px;
            margin-bottom: 2rem;
            opacity: 0.5;
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

class FallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(503)  # Service Unavailable
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Retry-After', '60')
        self.end_headers()
        self.wfile.write(MAINTENANCE_HTML.encode('utf-8'))
    
    def do_POST(self):
        self.do_GET()
    
    def log_message(self, format, *args):
        print(f"[Fallback] {args[0]}")

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8201
    server = HTTPServer(('0.0.0.0', port), FallbackHandler)
    print(f"Kuroryuu Fallback Server running on port {port}")
    print("Showing maintenance page for all requests...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()

if __name__ == "__main__":
    main()
