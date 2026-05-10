#!/usr/bin/env node

import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const PULSE_BACKEND_PORT = process.env.PULSE_BACKEND_PORT || '3099';
const PULSE_BACKEND_URL = `http://localhost:${PULSE_BACKEND_PORT}`;
const timeoutMs = Number.parseInt(process.env.PULSE_CI_TIMEOUT_MS || '', 10) || 480000;
const composeProject = 'pulse_deep_ci';
let timeoutTriggered = false;

function log(msg) {
  console.error(`[pulse-deep-ci] ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function runCmd(cmd, opts = {}) {
  log(`Running: ${cmd}`);
  return execSync(cmd, { cwd: rootDir, stdio: 'inherit', ...opts });
}

function killChildTree(pid, signal) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch { /* best effort */ }
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackend(url, maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/health/liveness`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        log(`Backend is healthy at ${url}`);
        return true;
      }
    } catch { /* not ready */ }
    if (i % 5 === 0) log(`Waiting for backend... (attempt ${i + 1}/${maxRetries})`);
    await sleep(2000);
  }
  return false;
}

async function main() {
  let composeUp = false;
  let backendStarted = false;

  try {
    log('Starting test infrastructure via docker compose...');
    ensureDir(path.join(rootDir, '.pulse', 'current'));

    runCmd(
      `docker compose -f docker-compose.test.yml -p ${composeProject} up -d postgres redis`,
      { stdio: 'inherit' },
    );
    composeUp = true;

    log('Waiting for Postgres and Redis to be healthy...');
    await sleep(5000);
    runCmd(`docker compose -f docker-compose.test.yml -p ${composeProject} ps`, { stdio: 'inherit' });

    log('Building and starting backend...');
    ensureDir(path.join(rootDir, 'backend', 'dist'));
    runCmd('npm --prefix backend run prisma:generate', { stdio: 'inherit' });

    const testDbUrl = `postgresql://postgres:password@localhost:55432/whatsapp_saas_test`;
    log(`Applying migrations to ${testDbUrl}...`);
    runCmd(`npx --prefix backend prisma migrate deploy`, {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testDbUrl },
    });

    log(`Starting backend on port ${PULSE_BACKEND_PORT}...`);
    const backendProc = spawn(
      'node',
      [path.join(rootDir, 'backend', 'dist', 'src', 'bootstrap.js')],
      {
        cwd: path.join(rootDir, 'backend'),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: PULSE_BACKEND_PORT,
          DATABASE_URL: testDbUrl,
          REDIS_URL: 'redis://localhost:56379',
          JWT_SECRET: 'pulse-deep-ci-test-secret',
          AUTH_OPTIONAL: 'true',
          ENABLE_LEGACY_BACKEND_AUTOPILOT: 'false',
          GLOBAL_AUTONOMY_KILL_SWITCH: 'false',
          ENABLE_LEGACY_AUTOPILOT_SCANNER: 'false',
          BACKEND_URL: PULSE_BACKEND_URL,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'e2e-dummy-key',
        },
      },
    );

    backendStarted = true;
    backendProc.stdout?.on('data', (data) => process.stderr.write(`[backend] ${data}`));
    backendProc.stderr?.on('data', (data) => process.stderr.write(`[backend:err] ${data}`));

    const backendReady = await waitForBackend(PULSE_BACKEND_URL, 90);
    if (!backendReady) {
      log('ERROR: Backend did not become healthy in time.');
      process.exit(2);
    }

    log('Running runtime probes...');
    const probesProc = spawn(
      process.execPath,
      [
        '-e',
        `
        const { execSync } = require('node:child_process');
        const probes = [
          {id:'health-liveness', path:'/health/liveness'},
          {id:'health-ready', path:'/health/ready'},
          {id:'kloel-health', path:'/kloel/health'},
          {id:'root-health', path:'/health'},
        ];
        const results = [];
        for (const p of probes) {
          try {
            const start = Date.now();
            const stdout = execSync('curl -s -o /dev/stdout -w "\\n%{http_code}" --max-time 5 "${process.env.PULSE_BACKEND_URL}' + p.path + '"', {encoding:'utf-8', timeout:7000});
            const lines = stdout.trim().split('\\n');
            const code = parseInt(lines[lines.length-1], 10);
            results.push({probeId:p.id, target:'GET '+p.path, executed:true, status:code===200?'passed':'failed', latencyMs:Date.now()-start, summary:'HTTP '+code});
          } catch(e) {
            results.push({probeId:p.id, target:'GET '+p.path, executed:true, status:'failed', latencyMs:0, summary:'Error: '+e.message.slice(0,100)});
          }
        }
        const executed = results.filter(r=>r.executed).length;
        const passed = results.filter(r=>r.status==='passed').length;
        require('node:fs').writeFileSync(
          require('node:path').join('${path.join(rootDir, '.pulse', 'current')}', 'PULSE_RUNTIME_EVIDENCE.json'),
          JSON.stringify({
            executed: executed>0,
            executedChecks: results.filter(r=>r.executed).map(r=>r.probeId),
            blockingFindingEvents: [],
            artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json'],
            summary: 'CI deep probes: '+executed+'/'+probes.length+' executed, '+passed+' passed.',
            probes: results.map(r=>({...r, required:true, artifactPaths:['PULSE_RUNTIME_EVIDENCE.json']})),
            runtime_evidence_coverage: probes.length>0?Math.round((executed/probes.length)*100):0,
          }, null, 2)
        );
        console.error('Probes done: '+executed+'/'+probes.length+' executed, '+passed+' passed.');
        `,
      ],
      {
        cwd: rootDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          PULSE_BACKEND_URL,
        },
      },
    );

    await new Promise((resolve, reject) => {
      probesProc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Probes exited with code ${code}`));
      });
      probesProc.on('error', reject);
    });

    log('Running PULSE with --deep flag...');
    const pulseProc = spawn(
      process.execPath,
      [path.join(rootDir, 'scripts', 'pulse', 'run.js'), '--certify', '--tier', '0', '--deep'],
      {
        cwd: rootDir,
        detached: false,
        stdio: 'inherit',
        env: {
          ...process.env,
          PULSE_DISABLE_LOCAL_ENV: 'false',
          PULSE_BACKEND_URL,
          PULSE_DEEP: '1',
          PULSE_EXECUTION_TRACE_PATH: path.join(rootDir, 'PULSE_EXECUTION_TRACE.json'),
        },
      },
    );

    let timer;
    const exitPromise = new Promise((resolve) => {
      pulseProc.on('exit', (code, signal) => {
        clearTimeout(timer);
        if (signal) resolve(124);
        else resolve(code ?? 1);
      });
      pulseProc.on('error', () => resolve(1));
    });

    timer = setTimeout(() => {
      timeoutTriggered = true;
      log(`PULSE timed out after ${timeoutMs / 1000}s.`);
      killChildTree(pulseProc.pid, 'SIGTERM');
      setTimeout(() => {
        killChildTree(pulseProc.pid, 'SIGKILL');
        process.exit(124);
      }, 5000);
    }, timeoutMs);

    const exitCode = await exitPromise;
    log(`PULSE exited with code ${exitCode}`);
    process.exit(exitCode);
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    if (backendStarted) {
      try {
        runCmd(`docker compose -f docker-compose.test.yml -p ${composeProject} down --remove-orphans -t 10`, { stdio: 'ignore' });
      } catch { /* best effort */ }
    }
  }
}

main();
