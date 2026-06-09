#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');

const CONFIGS = [
  { agent: 'codex', rel: '.codex/hooks.json', requireTraceAudit: true },
  { agent: 'claude', rel: '.claude/settings.json', requireTraceAudit: true },
  { agent: 'claude-local', rel: '.claude/settings.local.json', requireTraceAudit: false },
];

const BAD_COMMAND_START_RE = /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:node|npm|npx|tail|bash|sh)\b/;
const BAD_WRAPPER_TOKEN_RE = /(^|[\n;&|]\s*)(node|npm|npx|tail|bash|sh)\b/;
const ABSOLUTE_COMMAND_RE = /^\s*\//;

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function parseJsonFile(file) {
  try {
    return { ok: true, value: JSON.parse(readText(file) || '{}') };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function stopCommands(parsed) {
  const stop = Array.isArray(parsed?.hooks?.Stop) ? parsed.hooks.Stop : [];
  return stop.flatMap((entry) =>
    Array.isArray(entry?.hooks)
      ? entry.hooks.map((hook) => String(hook?.command ?? '')).filter(Boolean)
      : [],
  );
}

function splitCommandPrefix(command) {
  const parts = String(command).trim().split(/\s+/).filter(Boolean);
  return { executable: parts[0] ?? '', args: parts.slice(1) };
}

function absolutePaths(text) {
  return [...String(text).matchAll(/(?<!\S)\/(?:[^\s"'<>|;&`$(){}]+\/?)+/g)].map((match) => match[0]);
}

function wrapperFromCommand(command) {
  const { executable, args } = splitCommandPrefix(command);
  if (!['/bin/sh', '/bin/bash'].includes(executable)) return null;
  const wrapper = args.find((arg) => arg.startsWith('/') && (arg.endsWith('.sh') || arg.includes('/.codex/') || arg.includes('/.claude/')));
  return wrapper ?? null;
}

function validateCommand(command) {
  const failures = [];
  const wrappers = [];
  const absoluteRefs = absolutePaths(command);
  const { executable } = splitCommandPrefix(command);
  if (!ABSOLUTE_COMMAND_RE.test(command)) failures.push('command does not start with an absolute executable path');
  if (BAD_COMMAND_START_RE.test(command)) failures.push('command starts with PATH-dependent runtime or inline env assignment');
  if (executable && executable.startsWith('/') && !fs.existsSync(executable)) failures.push(`absolute executable missing: ${executable}`);
  const wrapper = wrapperFromCommand(command);
  if (wrapper) {
    wrappers.push(validateWrapper(wrapper));
  }
  for (const ref of absoluteRefs) {
    if (!fs.existsSync(ref) && ref.startsWith(repoRoot)) failures.push(`absolute repo reference missing: ${ref}`);
  }
  return { ok: failures.length === 0 && wrappers.every((entry) => entry.ok), command, failures, wrappers };
}

function validateWrapper(file) {
  const failures = [];
  if (!path.isAbsolute(file)) failures.push('wrapper path is not absolute');
  if (!fs.existsSync(file)) return { ok: false, file, failures: [...failures, 'wrapper file missing'] };
  const text = readText(file);
  if (!text.startsWith('#!/bin/sh') && !text.startsWith('#!/bin/bash')) failures.push('wrapper shebang is not /bin/sh or /bin/bash');
  if (BAD_WRAPPER_TOKEN_RE.test(text)) failures.push('wrapper invokes node/npm/npx/tail/bash/sh without an absolute path');
  const lint = childProcess.spawnSync('/bin/sh', ['-n', file], {
    cwd: repoRoot,
    env: { PATH: '' },
    encoding: 'utf8',
    timeout: 10000,
  });
  if (lint.status !== 0) failures.push(`wrapper fails /bin/sh -n under empty PATH: ${lint.stderr || lint.stdout}`);
  for (const ref of absolutePaths(text)) {
    if (!fs.existsSync(ref) && (ref.startsWith('/bin/') || ref.startsWith('/usr/bin/') || ref.startsWith('/opt/homebrew/bin/') || ref.startsWith(repoRoot))) {
      failures.push(`absolute wrapper reference missing: ${ref}`);
    }
  }
  return { ok: failures.length === 0, file, failures };
}

function liveConfigReport() {
  return CONFIGS.map((config) => {
    const file = path.join(repoRoot, config.rel);
    if (!fs.existsSync(file)) return { ...config, ok: true, file, absent: true, commands: [] };
    const parsed = parseJsonFile(file);
    if (!parsed.ok) return { ...config, ok: false, file, parseError: parsed.error, commands: [] };
    const commands = stopCommands(parsed.value);
    const validations = commands.map((command) => validateCommand(command));
    const traceAuditVisible = !config.requireTraceAudit || commands.some((command) => {
      const wrapper = wrapperFromCommand(command);
      return command.includes('trace-coverage-audit.mjs') || (wrapper ? readText(wrapper).includes('trace-coverage-audit.mjs') : false);
    });
    return {
      ...config,
      ok: validations.every((entry) => entry.ok) && traceAuditVisible,
      file,
      commands,
      traceAuditVisible,
      validations,
    };
  });
}

function fixtureReport() {
  const goodTrace = `/bin/sh ${path.join(repoRoot, '.codex', 'atomic-stop-trace-coverage-hook.sh')} ${path.join(sourceDir, 'trace-coverage-audit.mjs')}`;
  const badCases = [
    'node scripts/mcp/atomic-edit/trace-coverage-audit.mjs --codex-stop-json',
    'PATH=/opt/homebrew/bin:/usr/bin:/bin node scripts/mcp/atomic-edit/trace-coverage-audit.mjs',
    'node scripts/mcp/atomic-edit/trace-coverage-audit.mjs 2>&1 | tail -6 || true',
    'sh .codex/atomic-stop-trace-coverage-hook.sh',
  ];
  return {
    goodTrace: validateCommand(goodTrace),
    badCases: badCases.map((command) => validateCommand(command)),
  };
}

function wiringReport() {
  const ySource = readText(path.join(sourceDir, 'server-tools-y.ts'));
  const selfSource = readText(path.join(sourceDir, 'server-tools-self.ts'));
  const mandatorySource = readText(path.join(sourceDir, 'gates', 'y-certificate-mandatory-domains.proof.mjs'));
  const compiledSource = readText(path.join(sourceDir, 'gates', 'compiled-mcp-y-certificate.proof.mjs'));
  const wholeHostSource = readText(path.join(sourceDir, 'gates', 'whole-host-y-certificate.proof.mjs'));
  return {
    certificateRunsProof: ySource.includes("runJsonScript('gates/agent-hook-runtime-boundary.proof.mjs'") && ySource.includes("domain: 'agentHookRuntimeBoundary'"),
    mandatoryDomain: ySource.includes("'agentHookRuntimeBoundary'") && mandatorySource.includes("'agentHookRuntimeBoundary'"),
    selfExpansionRunsProof: selfSource.includes("node gates/agent-hook-runtime-boundary.proof.mjs --json") && selfSource.includes("phase: 'agent-runtime'"),
    compiledProofRequiresDomain: compiledSource.includes("'agentHookRuntimeBoundary'") && /mandatoryDomains[\s\S]*agentHookRuntimeBoundary/.test(compiledSource),
    wholeHostProofRequiresDomain: wholeHostSource.includes("'agentHookRuntimeBoundary'") && /mandatoryDomains[\s\S]*agentHookRuntimeBoundary/.test(wholeHostSource),
  };
}

function main() {
  const results = [];
  const fixtures = fixtureReport();
  record(results, 'absolute /bin/sh wrapper Stop hook is accepted under empty PATH lint', fixtures.goodTrace.ok, fixtures.goodTrace);
  record(results, 'PATH-dependent Stop hook fixtures are rejected', fixtures.badCases.every((entry) => !entry.ok), fixtures.badCases);

  const live = liveConfigReport();
  record(results, 'Codex and Claude Stop hooks are absolute-wrapper runtime-boundary safe', live.every((entry) => entry.ok), live);

  const wiring = wiringReport();
  record(results, 'Y certificate exposes agentHookRuntimeBoundary as a mandatory domain', wiring.certificateRunsProof && wiring.mandatoryDomain && wiring.compiledProofRequiresDomain && wiring.wholeHostProofRequiresDomain, wiring);
  record(results, 'self-expansion lattice runs the agent hook runtime-boundary proof permanently', wiring.selfExpansionRunsProof, wiring);

  return { ok: results.every((entry) => entry.ok), results };
}

const payload = main();
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
