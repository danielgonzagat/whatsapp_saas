#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const SERVERS = [
  ['graphify-plus', 'scripts/mcp/graphify-plus-mcp/launcher.sh', 'graphify-plus'],
  ['saas-compiler', 'scripts/mcp/saas-compiler-mcp/launcher.sh', 'saas-compiler'],
  ['codebody-navigator', 'scripts/mcp/codebody-navigator-mcp/launcher.sh', 'kloel-codebody-navigator'],
];

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'stdio-transport-smoke', version: '0.1.0' },
  },
};

function encodeLine(message) {
  return `${JSON.stringify(message)}\n`;
}

function encodeFrame(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function firstNonEmptyLine(text) {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
}

function parseLineResponse(text) {
  const line = firstNonEmptyLine(text).trim();
  if (!line.startsWith('{')) {
    throw new Error(`line response did not start with JSON: ${line.slice(0, 80)}`);
  }
  return JSON.parse(line);
}

function parseFrameResponse(text) {
  const headerEnd = text.indexOf('\r\n\r\n');
  if (headerEnd === -1) {
    throw new Error(`missing frame header: ${text.slice(0, 80)}`);
  }
  const header = text.slice(0, headerEnd);
  const match = /Content-Length:\s*(\d+)/i.exec(header);
  if (!match) {
    throw new Error(`missing content length: ${header.slice(0, 80)}`);
  }
  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const body = text.slice(bodyStart, bodyStart + length);
  return JSON.parse(body);
}

function hasCompleteFrame(text) {
  const headerEnd = text.indexOf('\r\n\r\n');
  if (headerEnd === -1) return false;
  const match = /Content-Length:\s*(\d+)/i.exec(text.slice(0, headerEnd));
  if (!match) return false;
  const total = headerEnd + 4 + Number(match[1]);
  return Buffer.byteLength(text, 'utf8') >= total;
}

async function requestOnce(launcher, mode) {
  const child = spawn('bash', [resolve(launcher)], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';

  const done = new Promise((resolveP, rejectP) => {
    const timer = setTimeout(() => rejectP(new Error(`timeout waiting for ${mode} response; stderr=${stderr.slice(0, 300)}`)), 3000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (mode === 'line' && stdout.includes('\n')) {
        clearTimeout(timer);
        resolveP(stdout);
      }
      if (mode === 'frame' && hasCompleteFrame(stdout)) {
        clearTimeout(timer);
        resolveP(stdout);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectP(error);
    });
    child.on('exit', (code) => {
      if (!stdout) {
        clearTimeout(timer);
        rejectP(new Error(`server exited before response code=${code}; stderr=${stderr.slice(0, 300)}`));
      }
    });
  });

  child.stdin.write(mode === 'line' ? encodeLine(INIT) : encodeFrame(INIT));
  const response = await done;
  child.kill('SIGINT');
  return response;
}

async function requestMixedLineSession(launcher) {
  const child = spawn('bash', [resolve(launcher)], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let consumed = 0;

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  function waitForNextLine(label) {
    return new Promise((resolveP, rejectP) => {
      const started = Date.now();
      const interval = setInterval(() => {
        const newline = stdout.indexOf('\n', consumed);
        if (newline !== -1) {
          const line = stdout.slice(consumed, newline + 1);
          consumed = newline + 1;
          clearInterval(interval);
          resolveP(line);
          return;
        }
        if (Date.now() - started > 3000) {
          clearInterval(interval);
          rejectP(new Error(`timeout waiting for ${label}; stderr=${stderr.slice(0, 300)}`));
        }
      }, 10);
    });
  }

  child.stdin.write(encodeLine(INIT));
  parseLineResponse(await waitForNextLine('line initialize'));

  child.stdin.write(encodeFrame({ jsonrpc: '2.0', id: 2, method: 'ping', params: {} }));
  const response = await waitForNextLine('mixed framed ping response');
  child.kill('SIGINT');
  return response;
}

async function checkServer([name, launcher, expectedServerName]) {
  const lineRaw = await requestOnce(launcher, 'line');
  const line = parseLineResponse(lineRaw);
  if (line?.result?.serverInfo?.name !== expectedServerName) {
    throw new Error(`${name} line initialize returned unexpected serverInfo: ${JSON.stringify(line?.result?.serverInfo)}`);
  }

  const frameRaw = await requestOnce(launcher, 'frame');
  const frame = parseFrameResponse(frameRaw);
  if (frame?.result?.serverInfo?.name !== expectedServerName) {
    throw new Error(`${name} frame initialize returned unexpected serverInfo: ${JSON.stringify(frame?.result?.serverInfo)}`);
  }

  const mixedRaw = await requestMixedLineSession(launcher);
  const mixed = parseLineResponse(mixedRaw);
  if (mixed?.result == null) {
    throw new Error(`${name} mixed line session ping failed: ${JSON.stringify(mixed)}`);
  }
}

let failed = 0;
for (const server of SERVERS) {
  try {
    await checkServer(server);
    console.log(`PASS ${server[0]}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${server[0]}: ${error.message}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
