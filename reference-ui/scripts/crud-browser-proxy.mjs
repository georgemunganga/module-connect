// Private test-only static candidate server and Unix-domain HTTP bridge. No business mocks.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const required = name => { const value = process.env[name]; if (!value || !path.isAbsolute(value)) throw new Error(`${name} must be an absolute private path`); return value; };
const fixturePath = required('CRUD_BROWSER_FIXTURE'), socketPath = required('CRUD_BROWSER_SOCKET');
if (fs.realpathSync(fixturePath) !== fixturePath || !fs.statSync(fixturePath).isFile() || fs.statSync(fixturePath).size > 65536 || (fs.statSync(fixturePath).mode & 0o077)) throw new Error('Protected fixture file required');
if (fs.realpathSync(socketPath) !== socketPath || !fs.statSync(socketPath).isSocket()) throw new Error('Actual private API socket required');
// Linux limits sockaddr_un paths to 107 bytes. Keep the verified evidence path,
// but address its already-open parent directory through this process's fd.
const socketDirectoryFd = fs.openSync(path.dirname(socketPath), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
const transportSocketPath = `/proc/self/fd/${socketDirectoryFd}/${path.basename(socketPath)}`;
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!/^procurement_crud_http_[a-zA-Z0-9_]+$/.test(fixture.database) || fixture.database.length > 63 || fixture.production !== false || fixture.cliProofComplete !== true || fixture.authenticationHeader !== 'X-Crud-Actor' || !guid.test(fixture.actorId) || !guid.test(fixture.companyId) || !guid.test(fixture.branchId)) throw new Error('Actual private CRUD fixture contract required');
const root = fs.realpathSync(path.resolve(process.env.CRUD_BROWSER_DIST || '.verification-dist'));
if (!fs.statSync(root).isDirectory() || !fs.statSync(path.join(root, 'index.html')).isFile()) throw new Error('Staged candidate root required');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((request, response) => {
  if (request.url === '/__crud_proxy_health') { response.writeHead(200); response.end('ready'); return; }
  if (request.url?.startsWith('/api/')) {
    const headers = { ...request.headers, host: 'localhost', 'x-crud-actor': fixture.actorId };
    delete headers.connection; delete headers['proxy-connection'];
    const upstream = http.request({ socketPath: transportSocketPath, path: request.url, method: request.method, headers }, reply => {
      response.writeHead(reply.statusCode || 502, reply.headers); reply.pipe(response);
    });
    upstream.setTimeout(60000, () => upstream.destroy(new Error('Private API deadline')));
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' }); response.end('Private API unavailable'); });
    request.on('aborted', () => upstream.destroy()); request.pipe(upstream); return;
  }
  if (!['GET', 'HEAD'].includes(request.method || '')) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname); } catch { response.writeHead(400); response.end(); return; }
  const prefix = '/procurement/workspace';
  if (pathname !== prefix && !pathname.startsWith(prefix + '/')) { response.writeHead(404); response.end(); return; }
  const relative = pathname.slice(prefix.length).replace(/^\/+/, '');
  let file = path.resolve(root, relative || 'index.html');
  if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(relative)) { response.writeHead(404); response.end(); return; }
    file = path.join(root, 'index.html');
  }
  const actual = fs.realpathSync(file);
  if (!actual.startsWith(root + path.sep) || !fs.statSync(actual).isFile()) { response.writeHead(403); response.end(); return; }
  response.writeHead(200, { 'content-type': mime[path.extname(actual)] || 'application/octet-stream', 'cache-control': 'no-store' });
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(actual).pipe(response);
});
server.listen(3027, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => { fs.closeSync(socketDirectoryFd); process.exit(0); }));
