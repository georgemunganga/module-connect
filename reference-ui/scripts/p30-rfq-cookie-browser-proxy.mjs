// P30 private normal-cookie RFQ acceptance transport. No identity aliases or business mocks.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const need = (condition, message) => { if (!condition) throw new Error(message); };
const absolute = name => { const value = process.env[name]; need(value && path.isAbsolute(value), 'Absolute private input path required'); return value; };
function protectedFile(name) {
  const file = absolute(name); const stat = fs.lstatSync(file);
  need(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600 && fs.realpathSync(file) === file, 'Regular0600 private file required');
  return file;
}
need(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG, 'Debug logging must be disabled');
const fixturePath = protectedFile('P30_RFQ_COOKIE_FIXTURE');
need(fixturePath === '/p25-evidence/p30-rfq-local-cookie-fixture.private.json', 'Exact P30 RFQ private fixture required');
need(fs.statSync(fixturePath).size <= 65536, 'Bounded synthetic fixture required');
const fixtureBytes = fs.readFileSync(fixturePath);
let fixture; try { fixture = JSON.parse(fixtureBytes.toString('utf8')); } catch { throw new Error('Malformed protected fixture'); }
const guid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000';
need(fixture.schemaVersion === 3 && fixture.controlPlaneOnly === true && fixture.secureCookieRequiresHttpsProxy === true
  && fixture.browserAuthenticationRequired === 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  && fixture.apiSetupAuthentication === 'PRIVATE_SUBJECT_TEST_AUTH_ONLY'
  && fixture.localCookieLoginVerified === false && fixture.browserAcceptanceVerified === false
  && fixture.nativeIdentityProviderVerified === false && fixture.externalFinanceAuthority === false
  && /^proc_p30_http_po_[a-z0-9_]{1,40}$/.test(fixture.database) && fixture.database.length <= 63
  && fixture.database === process.env.P30_RFQ_COOKIE_EXPECTED_DATABASE
  && [fixture.companyId, fixture.branchId, fixture.buyerPrincipalId, fixture.approvedRequestId,
    fixture.approvedRequestLineId, fixture.nativeEventId, fixture.nativePolicyId,
    fixture.nativeCaseId, fixture.reviewerPrincipalId].every(guid)
  && Array.isArray(fixture.nativeSupplierIds) && fixture.nativeSupplierIds.length === 2
  && fixture.nativeSupplierIds.every(guid) && fixture.nativeSupplierIds[0] !== fixture.nativeSupplierIds[1]
  && Array.isArray(fixture.syntheticCredentials) && fixture.syntheticCredentials.length === 7
  && fixture.syntheticCredentials.filter(value => value.principalId === fixture.buyerPrincipalId).length === 1
  && fixture.syntheticCredentials.filter(value => value.principalId === fixture.reviewerPrincipalId).length === 1
  && /^[a-f0-9]{64}$/.test(fixture.challenge)
  && fixture.completionPath === '/p25-evidence/p30-rfq-local-cookie-browser-completion.private.json'
  && !fs.existsSync(fixture.completionPath)
  && Number.isFinite(Date.parse(fixture.expiresAt)) && Date.parse(fixture.expiresAt) > Date.now(), 'Current private P30 RFQ local-cookie fixture required');
const api = new URL(fixture.apiUrl);
need(api.protocol === 'http:' && api.hostname === '127.0.0.1' && Number(api.port) > 0 && api.pathname === '/' && !api.username && !api.password && !api.search && !api.hash, 'Ephemeral private loopback API required');
const runtimePid = process.env.P30_RFQ_COOKIE_RUNTIME_PID;
need(/^[1-9][0-9]*$/.test(runtimePid || '') && fs.readlinkSync('/proc/self/ns/net') === fs.readlinkSync(`/proc/${runtimePid}/ns/net`), 'Run inside the exact API network namespace');
const cert = fs.readFileSync(protectedFile('P30_RFQ_COOKIE_TLS_CERT'));
const key = fs.readFileSync(protectedFile('P30_RFQ_COOKIE_TLS_KEY'));
const root = fs.realpathSync(absolute('P30_RFQ_COOKIE_DIST'));
need(fs.statSync(root).isDirectory() && fs.statSync(path.join(root,'index.html')).isFile(), 'Existing prebuilt static root required');
const receiptPath = absolute('P30_RFQ_COOKIE_PROXY_RECEIPT');
need(!fs.existsSync(receiptPath) && (fs.statSync(path.dirname(receiptPath)).mode & 0o777) === 0o700, 'New protected startup receipt required');
const aliases = new Set(['x-private-p25-subject','x-crud-actor','x-crud-browser-actor','x-test-role','x-test-worker','x-test-subject','x-test-subject-id','x-test-permission','x-test-permissions']);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.ico':'image/x-icon' };
const server = https.createServer({ cert, key, minVersion:'TLSv1.2' }, (request,response) => {
  if (Object.keys(request.headers).some(name => aliases.has(name))) { response.writeHead(400); response.end('Private identity aliases are forbidden'); return; }
  if (request.url === '/__p30_rfq_cookie_proxy_health') { response.writeHead(200); response.end('ready'); return; }
  if (request.url?.startsWith('/api/')) {
    // Preserve real browser selection headers, Cookie and exact body. Add no actor,
    // role, worker, permission or company/branch selection derived from the fixture.
    const headers = { ...request.headers, host:api.host };
    for (const name of ['connection','proxy-connection','keep-alive','transfer-encoding','te','trailer','upgrade']) delete headers[name];
    const upstream = http.request({ hostname:'127.0.0.1', port:api.port, path:request.url, method:request.method, headers }, reply => {
      response.writeHead(reply.statusCode || 502, reply.headers); reply.pipe(response);
    });
    upstream.setTimeout(60000, () => upstream.destroy());
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Private API unavailable'); });
    request.on('aborted', () => upstream.destroy()); request.pipe(upstream); return;
  }
  if (!['GET','HEAD'].includes(request.method || '')) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', 'https://127.0.0.1').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  const prefix = '/procurement/workspace';
  if (pathname !== prefix && !pathname.startsWith(prefix + '/')) { response.writeHead(404); response.end(); return; }
  const relative = pathname.slice(prefix.length).replace(/^\/+/, '');
  let file = path.resolve(root, relative || 'index.html');
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(relative)) { response.writeHead(404); response.end(); return; }
    file = path.join(root,'index.html');
  }
  const actual = fs.realpathSync(file);
  if (!actual.startsWith(root + path.sep) || !fs.statSync(actual).isFile()) { response.writeHead(403); response.end(); return; }
  response.writeHead(200, { 'content-type':mime[path.extname(actual)] || 'application/octet-stream', 'cache-control':'no-store' });
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(actual).pipe(response);
});
server.listen(0,'127.0.0.1', () => {
  const address = server.address(); need(address && typeof address === 'object', 'Private listener unavailable');
  fs.writeFileSync(receiptPath, JSON.stringify({ schemaVersion:3, transport:'normal-local-cookie-https-v1',
    origin:`https://127.0.0.1:${address.port}`, apiUrl:fixture.apiUrl, database:fixture.database,
    fixtureSha256:createHash('sha256').update(fixtureBytes).digest('hex'),
    certificateSha256:createHash('sha256').update(cert).digest('hex'), staticRoot:root,
    indexSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex'),
    runtimePid:Number(runtimePid), netNamespace:fs.readlinkSync('/proc/self/ns/net'),
    injectsIdentityHeaders:false, mocksBusinessResponses:false, browserAcceptanceVerified:false }), { mode:0o600, flag:'wx' });
});
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
