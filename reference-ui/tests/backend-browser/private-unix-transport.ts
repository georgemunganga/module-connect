import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { request as socketRequest } from "node:http";
import type { APIRequestContext } from "@playwright/test";

type Fixture = { baseUrl: string; transport?: string; socketPath?: string; noTcpListener?: boolean };
type Input = { method?: string; headers?: Record<string, string>; body?: string | null };
/** Transport only: forwards every actual Procurement response without business fixtures. */
export async function privateFixtureRequest(context: APIRequestContext, fixture: Fixture, path: string, input: Input = {}) {
  const url = new URL(path, fixture.baseUrl);
  if (url.origin !== new URL(fixture.baseUrl).origin || !url.pathname.startsWith("/api/procurement/"))
    throw new Error("Only actual fixture Procurement API paths may be forwarded.");
  const socket = process.env.PROCUREMENT_APPROVAL_BROWSER_SOCKET;
  let status: number, headers: Record<string, string>, body: Buffer;
  if (fixture.transport === "unix" || socket) {
    if (fixture.transport !== "unix" || fixture.socketPath !== "/procurement-browser/probe.sock" || fixture.noTcpListener !== true
      || !socket || !isAbsolute(socket) || basename(socket) !== "probe.sock" || realpathSync(dirname(socket)) !== resolve(dirname(socket)))
      throw new Error("Require explicit matching private Unix fixture and socket; never fall back to TCP.");
    const info = lstatSync(socket), parent = lstatSync(dirname(socket));
    if (!info.isSocket() || info.isSymbolicLink() || (info.mode & 0o077) || !parent.isDirectory() || (parent.mode & 0o077))
      throw new Error("Fixture socket and its directory must be owner-private.");
    ({ status, headers, body } = await new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((accept, reject) => {
      const forwarded = { ...input.headers, host: "127.0.0.1", "accept-encoding": "identity" };
      delete (forwarded as Record<string, string>)["content-length"];
      const request = socketRequest({ socketPath: socket, method: input.method ?? "GET", path: url.pathname + url.search, headers: forwarded }, response => {
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 8 * 1024 * 1024) request.destroy(new Error("Fixture API response exceeds bounded test capture.")); else chunks.push(chunk); });
        response.on("error", reject);
        response.on("end", () => {
          const fields: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) if (value !== undefined && !["connection", "transfer-encoding", "content-length"].includes(name)) fields[name] = Array.isArray(value) ? value.join(", ") : value;
          accept({ status: response.statusCode ?? 0, headers: fields, body: Buffer.concat(chunks) });
        });
      });
      request.setTimeout(45_000, () => request.destroy(new Error("Private fixture request timed out; never retried.")));
      request.on("error", reject); request.end(input.body ?? undefined);
    }));
  } else {
    const response = await context.fetch(url.href, { method: input.method ?? "GET", headers: input.headers,
      data: input.body ?? undefined, timeout: 45_000, maxRetries: 0, maxRedirects: 0 });
    status = response.status(); headers = response.headers(); body = await response.body();
  }
  return { status: () => status, text: async () => body.toString("utf8"), json: async (): Promise<unknown> => JSON.parse(body.toString("utf8")) as unknown,
    fulfill: { status, headers, body } };
}
