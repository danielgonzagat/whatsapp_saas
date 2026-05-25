#!/usr/bin/env node
import { createSuiteRuntime } from './mcp-suite-runtime.mjs';
import { createToolHandlers } from './mcp-suite-tool-handlers.mjs';
import { TOOLSETS } from './mcp-suite-toolsets.mjs';

const ROOT = process.env.MCP_SUITE_ROOT || process.cwd();
const KIND = process.argv[2] || process.env.MCP_SUITE_KIND;
const PROTO_VERSION = '2024-11-05';
const MAX_OUTPUT = 200_000;

if (!KIND) {
  process.stderr.write('missing MCP suite kind\n');
  process.exit(1);
}

const SERVER_INFO = { name: KIND, version: '0.1.0' };

const suiteRuntime = createSuiteRuntime({
  root: ROOT,
  protoVersion: PROTO_VERSION,
  maxOutput: MAX_OUTPUT,
});
const callTool = createToolHandlers({ kind: KIND, root: ROOT, ...suiteRuntime });

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTO_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'tools/list':
      return { tools: TOOLSETS[KIND] || [] };
    case 'tools/call': {
      const out = await callTool(params.name, params.arguments || {});
      return {
        content: [
          { type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) },
        ],
      };
    }
    case 'ping':
    case 'notifications/initialized':
    case 'shutdown':
      return {};
    case 'exit':
      process.exit(0);
      return {};
    default:
      throw new Error(`method not supported: ${method}`);
  }
}

let input = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  input = Buffer.concat([input, chunk]);
  while (true) {
    const headerEnd = input.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      const newline = input.indexOf('\n');
      if (newline === -1) break;
      const line = input.slice(0, newline).toString('utf8').trim();
      input = input.slice(newline + 1);
      if (line) void handleMessage(line);
      continue;
    }
    const header = input.slice(0, headerEnd).toString('utf8');
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match) {
      input = input.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const total = headerEnd + 4 + length;
    if (input.length < total) break;
    const body = input.slice(headerEnd + 4, total).toString('utf8');
    input = input.slice(total);
    void handleMessage(body);
  }
});

async function handleMessage(text) {
  let request;
  try {
    request = JSON.parse(text);
  } catch {
    return;
  }
  if (request.id === undefined) return;
  try {
    const result = await dispatch(request.method, request.params || {});
    send({ jsonrpc: '2.0', id: request.id, result });
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32603, message: error.message || String(error) },
    });
  }
}

function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(json + '\n');
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
