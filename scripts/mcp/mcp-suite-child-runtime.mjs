import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function createChildRuntime({ root, protoVersion, commandExists }) {
  const ROOT = root;
  const PROTO_VERSION = protoVersion;

  function childCommands() {
    return {
      'atomic-edit': {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/atomic-edit-mcp-launcher.sh')],
        transport: 'line',
      },
      'graphify-plus': {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/graphify-plus-mcp/launcher.sh')],
        transport: 'line',
      },
      'saas-compiler': {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/saas-compiler-mcp/launcher.sh')],
        transport: 'line',
      },
      'codebody-navigator': {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/codebody-navigator-mcp/launcher.sh')],
        transport: 'line',
      },
      kaisser: {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/kaisser-mcp/launcher.sh')],
        transport: 'lsp',
      },
      pulse: {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/pulse-mcp/launcher.sh')],
        transport: 'line',
      },
      'test-runner': {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/test-runner-mcp/launcher.sh')],
        transport: 'line',
      },
      'task-graph': {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/task-graph-mcp/launcher.sh')],
        transport: 'line',
      },
      postgres: {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/postgres-mcp/launcher.sh')],
        transport: 'line',
      },
      'sentry-bridge': {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/sentry-bridge-mcp/launcher.sh')],
        transport: 'lsp',
      },
      mercadopago: {
        command: 'bash',
        args: [join(ROOT, 'scripts/mcp/mercadopago-mcp-launcher.sh')],
        transport: 'line',
      },
      gitnexus: { command: '/opt/homebrew/bin/gitnexus', args: ['mcp'], transport: 'line' },
      codegraph: { command: 'codegraph', args: ['serve', '--mcp'], transport: 'line' },
    };
  }

  function childAvailable(command) {
    if (command.command === 'bash') return existsSync(command.args[0]);
    return commandExists(command.command);
  }

  function mcpChildRequest(command, method, params, timeoutMs) {
    if (!childAvailable(command))
      return Promise.resolve({ ok: false, error: 'child command unavailable' });
    return new Promise((resolvePromise) => {
      const child = spawn(command.command, command.args, {
        cwd: ROOT,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let buffer = Buffer.alloc(0);
      let stderr = '';
      let nextId = 1;
      const pending = new Map();
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolvePromise({
          ok: false,
          error: `timeout after ${timeoutMs}ms`,
          stderr: stderr.slice(-20_000),
        });
      }, timeoutMs);

      function done(value) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        resolvePromise(value);
      }

      function writeMessage(message) {
        const json = JSON.stringify(message);
        if (command.transport === 'lsp')
          child.stdin.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
        else child.stdin.write(`${json}\n`);
      }

      function sendRequest(reqMethod, reqParams) {
        const id = nextId++;
        writeMessage({ jsonrpc: '2.0', id, method: reqMethod, params: reqParams || {} });
        return new Promise((resolveReq, rejectReq) => pending.set(id, { resolveReq, rejectReq }));
      }

      function parseChunk(chunk) {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) {
            const newline = buffer.indexOf('\n');
            if (newline === -1) break;
            const line = buffer.slice(0, newline).toString('utf8').trim();
            buffer = buffer.slice(newline + 1);
            if (line) dispatchMessage(line);
            continue;
          }
          const header = buffer.slice(0, headerEnd).toString('utf8');
          const match = /Content-Length: (\d+)/i.exec(header);
          if (!match) {
            buffer = buffer.slice(headerEnd + 4);
            continue;
          }
          const length = Number(match[1]);
          const total = headerEnd + 4 + length;
          if (buffer.length < total) break;
          const body = buffer.slice(headerEnd + 4, total).toString('utf8');
          buffer = buffer.slice(total);
          dispatchMessage(body);
        }
      }

      function dispatchMessage(text) {
        let message;
        try {
          message = JSON.parse(text);
        } catch {
          return;
        }
        if (!pending.has(message.id)) return;
        const p = pending.get(message.id);
        pending.delete(message.id);
        if (message.error)
          p.rejectReq(new Error(message.error.message || JSON.stringify(message.error)));
        else p.resolveReq(message.result);
      }

      child.stdout.on('data', parseChunk);
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      child.on('error', (error) =>
        done({ ok: false, error: error.message, stderr: stderr.slice(-20_000) }),
      );
      child.on('exit', (code) => {
        if (pending.size)
          done({
            ok: false,
            error: `child exited before response code=${code}`,
            stderr: stderr.slice(-20_000),
          });
      });

      (async () => {
        await sendRequest('initialize', {
          protocolVersion: PROTO_VERSION,
          capabilities: {},
          clientInfo: { name: 'kloel-os-proxy', version: '0.1.0' },
        });
        writeMessage({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
        const result = await sendRequest(method, params || {});
        done({ ok: true, result });
      })().catch((error) =>
        done({ ok: false, error: error.message, stderr: stderr.slice(-20_000) }),
      );
    });
  }

  return { childCommands, childAvailable, mcpChildRequest };
}
