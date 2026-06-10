/**
 * In-process HTTP injection for controller specs.
 *
 * supertest cannot run inside the network-denied verification sandbox:
 * `Test.serverAddress` (supertest/lib/test.js) unconditionally calls
 * `app.listen(0)` when the server has no address, and the sandbox denies
 * every socket bind (0.0.0.0, 127.0.0.1 and unix-domain alike) with
 * `listen EPERM: operation not permitted`.
 *
 * This helper dispatches a request through the real Nest/Express pipeline
 * (routing, body parsers, guards, exception filters) WITHOUT any socket:
 * it builds a genuine `http.IncomingMessage` / `http.ServerResponse` pair
 * over an in-memory duplex stream and emits the server's own 'request'
 * event — the same mechanism `light-my-request` uses.
 *
 * Usage:
 * ```ts
 * const response = await injectHttpRequest(app.getHttpServer() as Server, {
 *   method: 'POST',
 *   path: '/gdpr/facebook-callback',
 *   headers: { 'content-type': 'application/x-www-form-urlencoded' },
 *   body: new URLSearchParams({ signed_request: 'sig.payload' }).toString(),
 * });
 * expect(response.status).toBe(200);
 * expect(response.json()).toEqual(expect.objectContaining({ ... }));
 * ```
 */
import { IncomingMessage, ServerResponse, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { Duplex } from 'node:stream';

export interface InjectedRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
  headers?: Record<string, string>;
  /** Pre-serialized request body (set the matching content-type header). */
  body?: string | Buffer;
}

export interface InjectedResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json<T = unknown>(): T;
}

/** Collects everything the ServerResponse writes, instead of a TCP socket. */
class InMemorySocket extends Duplex {
  readonly chunks: Buffer[] = [];
  remoteAddress = '127.0.0.1';
  remoteFamily = 'IPv4';
  remotePort = 0;

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  override _read(): void {
    // no-op: request payload is pushed explicitly in injectHttpRequest
  }

  setTimeout(): this {
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setKeepAlive(): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

function decodeChunkedBody(body: Buffer): Buffer {
  const parts: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const lineEnd = body.indexOf('\r\n', offset);
    if (lineEnd === -1) {
      break;
    }
    const size = Number.parseInt(body.subarray(offset, lineEnd).toString('ascii'), 16);
    if (!Number.isFinite(size) || size <= 0) {
      break;
    }
    parts.push(body.subarray(lineEnd + 2, lineEnd + 2 + size));
    offset = lineEnd + 2 + size + 2;
  }
  return Buffer.concat(parts);
}

function parseRawResponse(raw: Buffer): InjectedResponse {
  const separatorIndex = raw.indexOf('\r\n\r\n');
  const head =
    separatorIndex === -1 ? raw.toString('utf8') : raw.subarray(0, separatorIndex).toString('utf8');
  let bodyBuffer = separatorIndex === -1 ? Buffer.alloc(0) : raw.subarray(separatorIndex + 4);

  const [statusLine = '', ...headerLines] = head.split('\r\n');
  const statusMatch = /^HTTP\/\d+\.\d+ (\d{3})/.exec(statusLine);
  const status = statusMatch ? Number(statusMatch[1]) : 0;

  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    headers[line.slice(0, colonIndex).trim().toLowerCase()] = line.slice(colonIndex + 1).trim();
  }

  if ((headers['transfer-encoding'] ?? '').includes('chunked')) {
    bodyBuffer = decodeChunkedBody(bodyBuffer);
  }

  const text = bodyBuffer.toString('utf8');
  return {
    status,
    headers,
    text,
    json<T = unknown>(): T {
      return JSON.parse(text) as T;
    },
  };
}

/**
 * Dispatch one HTTP request in-process against a (non-listening) `http.Server`
 * whose request listener is the framework handler — e.g. the server returned
 * by `app.getHttpServer()` after `await app.init()`.
 */
export async function injectHttpRequest(
  server: Server,
  options: InjectedRequestOptions,
): Promise<InjectedResponse> {
  const socket = new InMemorySocket();
  const fakeSocket = socket as unknown as Socket;

  const req = new IncomingMessage(fakeSocket);
  req.method = options.method;
  req.url = options.path;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }
  const bodyBuffer =
    options.body === undefined
      ? null
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body);
  if (bodyBuffer && headers['content-length'] === undefined) {
    headers['content-length'] = String(bodyBuffer.length);
  }
  req.headers = headers;
  req.on('end', () => {
    req.complete = true;
  });
  if (bodyBuffer) {
    req.push(bodyBuffer);
  }
  req.push(null);

  const res = new ServerResponse(req);
  res.shouldKeepAlive = false;
  // Keep the captured payload byte-identical to the JSON body (no chunked framing).
  (res as ServerResponse & { useChunkedEncodingByDefault: boolean }).useChunkedEncodingByDefault =
    false;
  res.assignSocket(fakeSocket);

  const settled = new Promise<void>((resolve, reject) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    res.on('error', reject);
  });

  server.emit('request', req, res);
  await settled;
  // Let any corked/queued socket writes drain before reading the capture.
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (res.socket === fakeSocket) {
    res.detachSocket(fakeSocket);
  }

  return parseRawResponse(Buffer.concat(socket.chunks));
}
