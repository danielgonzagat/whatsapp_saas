import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
import { fail, ok } from './server-helpers-result.js';

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type ChromeTarget = 'primary' | 'live' | 'open';

type ChromeBridgeOptions = {
  target?: ChromeTarget;
  browserUrl?: string;
  extraArgs?: string[];
  timeoutMs?: number;
};

const TARGET_BROWSER_URLS: Record<ChromeTarget, string> = {
  primary: 'http://127.0.0.1:9222',
  live: 'http://127.0.0.1:9223',
  open: 'http://127.0.0.1:9333',
};

const DEFAULT_EXPERIMENTAL_ARGS = [
  '--experimentalPageIdRouting',
  '--experimentalDevtools',
  '--experimentalVision',
  '--experimentalStructuredContent',
  '--experimentalIncludeAllPages',
];

function timeoutMs(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30_000;
  return Math.max(1_000, Math.min(120_000, Math.trunc(value ?? 30_000)));
}

function launcherPath(): string {
  return path.join(REPO_ROOT, 'scripts/mcp/chrome-devtools-open-mcp-launcher.sh');
}

function runtimeRoot(): string {
  return path.join(REPO_ROOT, '.codex-artifacts/chrome-devtools-mcp');
}

function resolveBrowserUrl(options: ChromeBridgeOptions): string {
  const raw = options.browserUrl?.trim();
  if (raw) return raw;
  return TARGET_BROWSER_URLS[options.target ?? 'primary'];
}

function writeJsonLine(child: ChildProcessWithoutNullStreams, message: JsonRpcMessage): void {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function trimForReceipt(value: string, maxChars = 12_000): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

async function callChromeMcp(method: string, params: unknown, options: ChromeBridgeOptions): Promise<unknown> {
  const root = runtimeRoot();
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  const args = [
    launcherPath(),
    `--browserUrl=${resolveBrowserUrl(options)}`,
    ...DEFAULT_EXPERIMENTAL_ARGS,
    ...(options.extraArgs ?? []),
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        KLOEL_CHROME_DEVTOOLS_TMP: root,
        KLOEL_CHROME_DEVTOOLS_HOME: path.join(root, 'home'),
        KLOEL_CHROME_DEVTOOLS_RUNTIME: path.join(root, 'runtime'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        // ignore close races
      }
      setTimeout(() => {
        if (!child.killed) child.kill('SIGTERM');
      }, 250).unref();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`chrome-devtools MCP ${method} timed out; stderr=${trimForReceipt(stderr, 4_000)}`));
      });
    }, timeoutMs(options.timeoutMs));

    child.on('error', (error) => {
      finish(() => reject(error));
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdout += text;
      lineBuffer += text;
      for (;;) {
        const idx = lineBuffer.indexOf('\n');
        if (idx < 0) break;
        const line = lineBuffer.slice(0, idx).trim();
        lineBuffer = lineBuffer.slice(idx + 1);
        if (!line.startsWith('{')) continue;
        let msg: JsonRpcMessage;
        try {
          msg = JSON.parse(line) as JsonRpcMessage;
        } catch {
          continue;
        }
        if (msg.id !== 2) continue;
        finish(() => {
          if (msg.error) {
            reject(new Error(JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        });
      }
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      finish(() => {
        reject(
          new Error(
            `chrome-devtools MCP exited before ${method} response; code=${code ?? 'null'} signal=${signal ?? 'null'} stdout=${trimForReceipt(stdout, 4_000)} stderr=${trimForReceipt(stderr, 4_000)}`,
          ),
        );
      });
    });

    writeJsonLine(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'atomic-chrome-devtools-bridge', version: '1.0.0' },
      },
    });
    writeJsonLine(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    writeJsonLine(child, { jsonrpc: '2.0', id: 2, method, params });
  });
}

const chromeBridgeSchema = {
  target: z.enum(['primary', 'live', 'open']).optional(),
  browserUrl: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
};

export function registerToolsChromeDevtools(server: McpServer): void {
  server.registerTool(
    'chrome_devtools_list_tools',
    {
      title: 'Chrome DevTools MCP bridge: list tools',
      description:
        'Lists tools from the configured Chrome DevTools MCP through Atomic. Use this when Codex has counted the chrome-devtools server but tool_search did not materialize its namespace.',
      inputSchema: chromeBridgeSchema,
    },
    async (a) => {
      try {
        const result = await callChromeMcp('tools/list', {}, a);
        return ok({ target: a.target ?? 'primary', browserUrl: resolveBrowserUrl(a), result });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'chrome_devtools_call',
    {
      title: 'Chrome DevTools MCP bridge: call any tool',
      description:
        'Calls any tool exposed by Chrome DevTools MCP through Atomic. toolName is the raw Chrome MCP tool name such as list_pages, new_page, navigate_page, take_snapshot, take_screenshot, evaluate_script, click, fill, or list_network_requests.',
      inputSchema: {
        ...chromeBridgeSchema,
        toolName: z.string(),
        arguments: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (a) => {
      try {
        const result = await callChromeMcp(
          'tools/call',
          { name: a.toolName, arguments: a.arguments ?? {} },
          a,
        );
        return ok({ toolName: a.toolName, target: a.target ?? 'primary', browserUrl: resolveBrowserUrl(a), result });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
