#!/usr/bin/env node

import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  allGatesPass,
  buildAssertionReport,
  countExecutedRuntimeProbes,
  countPassedGates,
  totalGates,
} from './run-pulse-deep-ci.assertions.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const PULSE_BACKEND_PORT = process.env.PULSE_BACKEND_PORT || '3099';
const PULSE_BACKEND_URL = `http://localhost:${PULSE_BACKEND_PORT}`;
const timeoutMs = Number.parseInt(process.env.PULSE_CI_TIMEOUT_MS || '', 10) || 600000;
const composeProject = 'pulse_deep_ci';
const args = process.argv.slice(2);
const tripleCycle = args.includes('--triple-cycle');
const cycleCount = tripleCycle ? 3 : 1;
let timeoutTriggered = false;

function log(msg) {
  console.error(`[pulse-deep-ci] ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
}

function runCmd(cmd, opts = {}) {
  log(`Running: ${cmd}`);
  return execSync(cmd, { cwd: rootDir, stdio: 'inherit', ...opts });
}

function killChildTree(pid, signal) {
  if (!pid) {return;}
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

async function waitForBackend(url, maxRetries = 90) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/health/liveness`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        log(`Backend is healthy at ${url}`);
        return true;
      }
    } catch { /* not ready */ }
    if (i % 5 === 0) {log(`Waiting for backend... (attempt ${i + 1}/${maxRetries})`);}
    await sleep(2000);
  }
  return false;
}

function readCertificate(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) {return null;}
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function spawnProcess(cmd, argsList, envExtra = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, argsList, {
      cwd: rootDir,
      detached: false,
      stdio: 'inherit',
      env: { ...process.env, ...envExtra },
    });
    proc.on('exit', (code, signal) => {
      if (signal) {resolve(124);}
      else {resolve(code ?? 1);}
    });
    proc.on('error', () => resolve(1));
  });
}

async function runRuntimeProbes() {
  log('Running runtime probes...');
  const probes = [
    { id: 'health-liveness', path: '/health/liveness' },
    { id: 'health-ready', path: '/health/ready' },
    { id: 'kloel-health', path: '/kloel/health' },
    { id: 'root-health', path: '/health' },
  ];

  const results = [];
  for (const p of probes) {
    try {
      const start = Date.now();
      const stdout = execSync(
        `curl -s -o /dev/stdout -w "\\n%{http_code}" --max-time 5 "${PULSE_BACKEND_URL}${p.path}"`,
        { encoding: 'utf-8', timeout: 7000 },
      );
      const lines = stdout.trim().split('\n');
      const code = Number.parseInt(lines[lines.length - 1], 10);
      results.push({
        probeId: p.id,
        target: `GET ${p.path}`,
        executed: true,
        status: code === 200 ? 'passed' : 'failed',
        latencyMs: Date.now() - start,
        summary: `HTTP ${code}`,
      });
    } catch (e) {
      results.push({
        probeId: p.id,
        target: `GET ${p.path}`,
        executed: true,
        status: 'failed',
        latencyMs: 0,
        summary: `Error: ${e.message.slice(0, 100)}`,
      });
    }
  }

  const executed = results.filter((r) => r.executed).length;
  const passed = results.filter((r) => r.status === 'passed').length;
  const evidencePath = path.join(rootDir, '.pulse', 'current', 'PULSE_RUNTIME_EVIDENCE.json');
  ensureDir(path.join(rootDir, '.pulse', 'current'));
  fs.writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        executed: executed > 0,
        executedChecks: results.filter((r) => r.executed).map((r) => r.probeId),
        blockingFindingEvents: [],
        artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json'],
        summary: `CI deep probes: ${executed}/${probes.length} executed, ${passed} passed.`,
        probes: results.map((r) => ({
          ...r,
          required: true,
          artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json'],
        })),
        runtime_evidence_coverage:
          probes.length > 0 ? Math.round((executed / probes.length) * 100) : 0,
      },
      null,
      2,
    ),
  );
  log(`Probes done: ${executed}/${probes.length} executed, ${passed} passed.`);
}

async function runPulseCycle(cycleIndex) {
  log(`=== PULSE cycle ${cycleIndex}/${cycleCount} ===`);
  const envExtra = {
    PULSE_DISABLE_LOCAL_ENV: 'false',
    PULSE_BACKEND_URL,
    PULSE_DEEP: '1',
    PULSE_EXECUTION_TRACE_PATH: path.join(rootDir, `PULSE_EXECUTION_TRACE_CYCLE_${cycleIndex}.json`),
  };

  const exitCode = await spawnProcess(process.execPath, [
    path.join(rootDir, 'scripts', 'pulse', 'run.js'),
    '--certify',
    '--tier',
    '0',
    '--deep',
  ], envExtra);

  log(`PULSE cycle ${cycleIndex} exited with code ${exitCode}`);

  const certPath = path.join(rootDir, 'PULSE_CERTIFICATE.json');
  const backupPath = path.join(rootDir, `PULSE_CERTIFICATE_CYCLE_${cycleIndex}.json`);

  if (fs.existsSync(certPath)) {
    fs.copyFileSync(certPath, backupPath);
    const internalPath = path.join(rootDir, '.pulse', 'current', 'PULSE_CERTIFICATE.json');
    if (fs.existsSync(internalPath)) {
      fs.copyFileSync(internalPath, path.join(rootDir, '.pulse', 'current', `PULSE_CERTIFICATE_CYCLE_${cycleIndex}.json`));
    }
    log(`Saved PULSE_CERTIFICATE_CYCLE_${cycleIndex}.json`);
  } else {
    log(`WARNING: PULSE_CERTIFICATE.json not found after cycle ${cycleIndex}`);
  }

  return { exitCode, certPath: backupPath };
}

async function main() {
  let composeUp = false;
  let backendStarted = false;

  try {
    if (tripleCycle) {
      log(`Triple-cycle mode: will run PULSE --deep ${cycleCount} times consecutively.`);
    }

    log('Starting test infrastructure via docker compose...');
    ensureDir(path.join(rootDir, '.pulse', 'current'));

    runCmd(
      `docker compose -f docker-compose.test.yml -p ${composeProject} up -d postgres redis`,
      { stdio: 'inherit' },
    );
    composeUp = true;

    log('Waiting for Postgres and Redis to be healthy...');
    await sleep(5000);
    runCmd(`docker compose -f docker-compose.test.yml -p ${composeProject} ps`, {
      stdio: 'inherit',
    });

    log('Building and starting backend...');
    ensureDir(path.join(rootDir, 'backend', 'dist'));
    runCmd('npm --prefix backend run prisma:generate', { stdio: 'inherit' });

    const testDbUrl = 'postgresql://postgres:password@localhost:55432/whatsapp_saas_test';
    log(`Applying migrations to ${testDbUrl}...`);
    runCmd('npx prisma migrate deploy', {
      cwd: path.join(rootDir, 'backend'),
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
          NODE_ENV: 'test',
          PORT: PULSE_BACKEND_PORT,
          DATABASE_URL: testDbUrl,
          REDIS_MODE: 'required',
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

    await runRuntimeProbes();

    const cycleResults = [];
    for (let c = 0; c < cycleCount; c++) {
      const { exitCode, certPath } = await runPulseCycle(c + 1);
      const cert = readCertificate(certPath);
      cycleResults.push({ exitCode, certPath, cert });

      if (tripleCycle) {
        log(
          `Cycle ${c + 1} summary: runtime_probes=${countExecutedRuntimeProbes(cert)}, ` +
            `gates=${countPassedGates(cert)}/${totalGates(cert)} PASS, ` +
            `all_pass=${allGatesPass(cert)}`,
        );
      }
    }

    if (tripleCycle) {
      const report = buildAssertionReport(cycleResults, cycleCount);
      const reportPath = path.join(rootDir, 'PULSE_CERTIFICATE_ASSERTIONS.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      log('');
      log('=== TRIPLE-CYCLE ASSERTION REPORT ===');
      log(`runtime_evidence > 0: ${report.assertions.runtime_evidence_gt_zero.passed ? 'PASS' : 'FAIL'}`);
      log(`all_subgates_pass:   ${report.assertions.all_subgates_pass.passed ? 'PASS' : 'FAIL'}`);
      log(`no_regression:       ${report.assertions.no_regression.passed ? 'PASS' : 'FAIL'}`);
      log(`overall:             ${report.overall}`);
      log(`Report written to: ${reportPath}`);

      if (!report.assertions.runtime_evidence_gt_zero.passed) {
        log(`  ${report.assertions.runtime_evidence_gt_zero.detail}`);
      }
      if (!report.assertions.all_subgates_pass.passed) {
        log(`  ${report.assertions.all_subgates_pass.detail}`);
        for (const [cycle, gates] of Object.entries(
          report.assertions.all_subgates_pass.failing_gates_by_cycle,
        )) {
          if (gates.length > 0) {log(`    ${cycle}: ${gates.join(', ')}`);}
        }
      }
      if (!report.assertions.no_regression.passed) {
        log(`  ${report.assertions.no_regression.detail}`);
      }

      if (report.overall === 'FAIL') {
        log('');
        log('Triple-cycle assertions FAILED. Fix underlying code, not the gate.');
        process.exit(3);
      }

      log('');
      log('All triple-cycle assertions PASSED. CI green: CERTIFIED.');
      process.exit(0);
    }

    const lastResult = cycleResults[cycleResults.length - 1];
    process.exit(lastResult.exitCode);
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    if (backendStarted) {
      try {
        runCmd(
          `docker compose -f docker-compose.test.yml -p ${composeProject} down --remove-orphans -t 10`,
          { stdio: 'ignore' },
        );
      } catch { /* best effort */ }
    }
  }
}

main();
