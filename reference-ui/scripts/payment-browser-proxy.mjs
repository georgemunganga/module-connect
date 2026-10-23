// Private acceptance transport: staged UI assets and the actual local ERP API.
// It forwards normal session cookies unchanged and has no actor-header shortcut.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

function privatePath(name, kind) {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || fs.realpathSync(value) !== value)
    throw new Error(`${name} must be an existing absolute private path`);
  const stat = fs.statSync(value);
  if (kind === 'file' && !stat.isFile() || kind === 'socket' && !stat.isSocket()
    || (stat.mode & 0o077)) throw new Error(`${name} is not a protected ${kind}`);
  return value;
}

const fixturePath = privatePath('PAYMENT_BROWSER_FIXTURE', 'file');
const socketPath = privatePath('PAYMENT_BROWSER_SOCKET', 'socket');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!/^payment-http-[0-9a-f]{16}$/.test(fixture.fixtureTenant)
  || !Array.isArray(fixture.people) || fixture.people.length !== 7)
  throw new Error('A synthetic private payment fixture is required');
const dist = fs.realpathSync(path.resolve(process.env.PAYMENT_BROWSER_DIST || '.verification-dist'));
if (!fs.statSync(dist).isDirectory() || !fs.statSync(path.join(dist, 'index.html')).isFile())
  throw new Error('A staged Procurement build is required');
const directoryFd = fs.openSync(path.dirname(socketPath), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
const transportSocket = `/proc/self/fd/${directoryFd}/${path.basename(socketPath)}`;
// Core's normal hrm_session is Secure. Use an ephemeral localhost TLS certificate
// so the browser sends its real cookie; never downgrade or inject an actor header.
const tlsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-browser-tls-'));
fs.chmodSync(tlsDir, 0o700);
const tlsKey = path.join(tlsDir, 'key.pem'), tlsCert = path.join(tlsDir, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', tlsKey, '-out', tlsCert, '-days', '1', '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
fs.chmodSync(tlsKey, 0o600);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const server = https.createServer({ key: fs.readFileSync(tlsKey), cert: fs.readFileSync(tlsCert) }, (request, response) => {
  if (request.url === '/__payment_proxy_health') { response.writeHead(200); response.end('ready'); return; }
  if (request.url?.startsWith('/api/')) {
    const headers = { ...request.headers, host: 'localhost' };
    delete headers.connection; delete headers['proxy-connection'];
    const upstream = http.request({ socketPath: transportSocket, path: request.url,
      method: request.method, headers }, reply => {
      response.writeHead(reply.statusCode || 502, reply.headers);
      reply.pipe(response);
    });
    upstream.setTimeout(60000, () => upstream.destroy(new Error('Private API deadline')));
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('Private API unavailable');
    });
    request.on('aborted', () => upstream.destroy());
    request.pipe(upstream);
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method || '')) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', 'https://localhost').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  const prefix = '/procurement/workspace';
  if (pathname !== prefix && !pathname.startsWith(prefix + '/')) { response.writeHead(404); response.end(); return; }
  const relative = pathname.slice(prefix.length).replace(/^\/+/, '');
  let file = path.resolve(dist, relative || 'index.html');
  if (file !== dist && !file.startsWith(dist + path.sep)) { response.writeHead(403); response.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(relative)) { response.writeHead(404); response.end(); return; }
    file = path.join(dist, 'index.html');
  }
  const actual = fs.realpathSync(file);
  if (!actual.startsWith(dist + path.sep) || !fs.statSync(actual).isFile()) {
    response.writeHead(403); response.end(); return;
  }
  response.writeHead(200, { 'content-type': mime[path.extname(actual)] || 'application/octet-stream',
    'cache-control': 'no-store' });
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(actual).pipe(response);
});
server.listen(3031, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () =>
  server.close(() => { fs.closeSync(directoryFd); fs.rmSync(tlsDir, { recursive: true, force: true }); process.exit(0); }));
