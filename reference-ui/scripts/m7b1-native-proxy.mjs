// INERT until Root reviews and starts it inside the exact private API network namespace.
// Adapted from the accepted M7A HTTPS static/API forwarding proxy; never logs auth/body/cookies.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { createHash } from "node:crypto";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const planPath = process.env.M7B1_PROXY_PLAN;
if (process.env.M7B1_REVIEWED_PROXY !== "1" || !planPath || !path.isAbsolute(planPath) || fs.realpathSync(planPath) !== planPath || (fs.statSync(planPath).mode & 0o777) !== 0o600) throw Error("Reviewed protected proxy plan required");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
if (plan.uiCommit !== "26d4ef1924b508a4ca33a184ec21500691003b3f" || !/^[a-f0-9]{64}$/.test(plan.apiId) || !/^[a-f0-9]{40}$/.test(plan.backendSourceCommit)
  || !/^[a-f0-9]{64}$/.test(plan.publishManifestSha256) || !Number.isInteger(plan.apiPid) || !Number.isInteger(plan.apiPort) || plan.apiPort < 1024 || plan.apiPort > 65535
  || typeof plan.privatePgSystemIdentifier !== "string" || !/^\d+$/.test(plan.privatePgSystemIdentifier)
  || fs.readlinkSync("/proc/self/ns/net") !== fs.readlinkSync(`/proc/${plan.apiPid}/ns/net`)) throw Error("Exact private runtime admission required");
const directory = path.dirname(planPath), files = new Map();
for (const [name, pin] of Object.entries(plan.files)) {
  if (name.startsWith("/") || name.split("/").some(part => part === ".." || part.startsWith("."))) throw Error("Invalid static manifest path");
  const bytes = fs.readFileSync(path.join(plan.staticRoot, name));
  if (hash(bytes) !== pin.sha256 || bytes.length !== pin.size) throw Error("Static manifest changed");
  files.set(name, bytes);
}
const server = https.createServer({ cert: fs.readFileSync(path.join(directory, "cert.pem")), key: fs.readFileSync(path.join(directory, "key.pem")), minVersion: "TLSv1.2" }, (request, response) => {
  if (Object.keys(request.headers).some(key => key.startsWith("x-private-") || key.startsWith("x-test-") || ["x-crud-actor", "x-crud-browser-actor"].includes(key))) { response.writeHead(400); response.end(); return; }
  const url = new URL(request.url, "https://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    const headers = { ...request.headers, host: `127.0.0.1:${plan.apiPort}` };
    for (const name of ["connection", "proxy-connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade"]) delete headers[name];
    const upstream = http.request({ hostname: "127.0.0.1", port: plan.apiPort, path: request.url, method: request.method, headers }, reply => { response.writeHead(reply.statusCode, reply.headers); reply.pipe(response); });
    upstream.setTimeout(60000, () => upstream.destroy());
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on("aborted", () => upstream.destroy()); request.pipe(upstream); return;
  }
  const prefix = "/procurement/workspace/";
  let name = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  if (!files.has(name) && url.pathname.startsWith("/procurement/workspace") && !name.includes(".")) name = "index.html";
  if (!["GET", "HEAD"].includes(request.method) || !files.has(name)) { response.writeHead(404); response.end(); return; }
  const bytes = files.get(name), mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" }, type = mime[path.extname(name)] ?? "application/octet-stream";
  response.writeHead(200, { "Content-Type": type, "Content-Length": bytes.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); response.end(request.method === "HEAD" ? undefined : bytes);
});
server.listen(0, "127.0.0.1", () => fs.writeFileSync(path.join(directory, "proxy-receipt.private.json"), JSON.stringify({ origin: `https://127.0.0.1:${server.address().port}`,
  backendContainerId: plan.apiId, backendSourceCommit: plan.backendSourceCommit, publishManifestSha256: plan.publishManifestSha256, uiSourceCommit: plan.uiCommit,
  databaseName: plan.databaseName, privatePgSystemIdentifier: plan.privatePgSystemIdentifier, expiresAt: new Date(Date.now() + 1800000).toISOString(),
  transport: "normal-local-cookie-https-v1", injectsIdentityHeaders: false, mocksBusinessResponses: false, apiPid: plan.apiPid, proxyPid: process.pid, sourceSha256: hash(fs.readFileSync(new URL(import.meta.url))), files: plan.files }), { mode: 0o600, flag: "wx" }));
const guard = setInterval(() => { try { if (fs.readlinkSync(`/proc/${plan.apiPid}/ns/net`) !== fs.readlinkSync("/proc/self/ns/net")) process.exit(2); } catch { process.exit(2); } }, 2000);
guard.unref(); setTimeout(() => server.close(() => process.exit(0)), 1800000).unref();
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.close(() => process.exit(0)));
