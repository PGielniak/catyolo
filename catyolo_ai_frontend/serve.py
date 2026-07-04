#!/usr/bin/env python3
import http.client
import http.server
import json
import os
import socket
import socketserver

FRONTEND_PORT = int(os.environ.get('FRONTEND_PORT', '3100'))
BACKEND_PORT = int(os.environ.get('BACKEND_PORT', '8100'))
DIST = os.environ.get('FRONTEND_DIST', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist'))
os.makedirs(DIST, exist_ok=True)

# Paths that are proxied to the backend instead of served as static files
API_PREFIXES = ('/scene/', '/action/', '/log/', '/api_key/', '/frame')

# Headers we strip when forwarding the backend response (browser handles these itself)
_DROP_RESPONSE_HEADERS = frozenset({
    'transfer-encoding', 'connection', 'keep-alive',
    'access-control-allow-origin', 'access-control-allow-methods',
    'access-control-allow-headers', 'access-control-allow-credentials',
})

# Headers we strip when forwarding the request to the backend
_DROP_REQUEST_HEADERS = frozenset({'host', 'connection', 'transfer-encoding'})


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


local_ip = get_local_ip()

# Runtime config read by the frontend on startup.
# backendPort points at this proxy, NOT the raw backend port.
config = {
    'skipAuth': os.environ.get('SKIP_AUTH', 'false').lower() == 'true',
    'backendHost': local_ip,
    'backendPort': str(FRONTEND_PORT),
}
with open(os.path.join(DIST, 'config.json'), 'w') as f:
    json.dump(config, f)


class Handler(http.server.SimpleHTTPRequestHandler):

    def _is_api(self) -> bool:
        return any(self.path.startswith(p) for p in API_PREFIXES)

    # Add CORS headers to every response (static files and proxied API alike)
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Accept')
        super().end_headers()

    def do_GET(self):
        if self._is_api():
            self._proxy('GET')
        else:
            full = os.path.join(DIST, self.path.lstrip('/'))
            if not os.path.isfile(full):
                self.path = '/index.html'
            super().do_GET()

    def do_POST(self):   self._proxy('POST')
    def do_PATCH(self):  self._proxy('PATCH')
    def do_DELETE(self): self._proxy('DELETE')

    # Answer CORS preflight immediately — no need to hit the backend
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def _proxy(self, method: str):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else None
        fwd_headers = {k: v for k, v in self.headers.items()
                       if k.lower() not in _DROP_REQUEST_HEADERS}
        try:
            conn = http.client.HTTPConnection('127.0.0.1', BACKEND_PORT, timeout=20)
            conn.request(method, self.path, body=body, headers=fwd_headers)
            res = conn.getresponse()
            data = res.read()
            conn.close()

            self.send_response(res.status)
            for k, v in res.getheaders():
                if k.lower() not in _DROP_RESPONSE_HEADERS:
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            self.send_error(502, f'Proxy error: {exc}')

    def log_message(self, fmt, *args):
        print(fmt % args)


os.chdir(DIST)

print(f'Local IP  : {local_ip}')
print(f'Frontend  : http://{local_ip}:{FRONTEND_PORT}')
print(f'Proxying  : {" ".join(API_PREFIXES)} → localhost:{BACKEND_PORT}')

with socketserver.TCPServer(('0.0.0.0', FRONTEND_PORT), Handler) as httpd:
    httpd.serve_forever()
