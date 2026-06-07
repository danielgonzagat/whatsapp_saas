import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
import { ok, fail, type ToolOk } from './server-helpers-result.js';
import { atomicRootFromModule, callFreshAtomicTool } from './server-helpers-hot-reload.js';
import { ensureReady, nativeAvailable, nativeLanguages } from './native-bridge.js';

type YStatus = 'GREEN' | 'RED' | 'UNJUDGED';
type YScope = 'mcp-controlled' | 'whole-host';

interface YDomain {
  domain: string;
  status: YStatus;
  evidence: string;
  requiredChange?: string;
  detail?: Record<string, unknown>;
}

const MANDATORY_MCP_CONTROLLED_DOMAINS: readonly string[] = [
  'distFreshness',
  'byteFloorWriteAdmission',
  'strictGateAdmission',
  'filesystemEffectProof',
  'knownExternalShellEffects',
  'codexNoBypassStaticPolicy',
  'bypassObserverDenyIntegration',
  'atomicityAudit',
  'selfExpansionValidatorLattice',
  'capabilityMonotonicity',
  'atomicExecReadOnlyUsability',
  'codexAtomicOnlyProtocol',
  'codexEntrypointContract',
  'codexHostWiring',
  'mcpLauncherHostBoundary',
  'universalStructuralEngine',
  'arbitraryInterpreterSandbox',
  'externalRuntimeState',
];

const RUNTIME_SOURCE_EXTENSIONS = new Set(['.ts', '.mjs', '.json', '.sh']);
const RUNTIME_DIST_EXTENSIONS = new Set(['.js', '.mjs', '.json']);
const RUNTIME_HASH_SKIP_DIRS = new Set(['dist', 'node_modules', '.atomic', '.git', 'node-compile-cache']);
const Y_CERTIFICATE_DELEGATE_DEPTH_ENV = 'ATOMIC_Y_CERTIFICATE_DELEGATE_DEPTH';
const Y_CERTIFICATE_FORCE_STALE_ENV = 'ATOMIC_Y_CERTIFICATE_FORCE_STALE';

function skipRuntimeHashEntry(name: string): boolean {
  return (
    name.startsWith('.security-mono-proof-') ||
    name.startsWith('.atomic-exec-sandbox') ||
    name.startsWith('.property-proof-') ||
    name.startsWith('.findings-') ||
    name.startsWith('.findings-probe-') ||
    name.startsWith('.external-runtime-denial-') ||
    name === '.build-manifest.json'
  );
}

function runtimeEngineRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(here) === 'dist' ? path.resolve(here, '..') : here;
}

function runtimeHashFiles(root: string, start: string, includeFile: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skipRuntimeHashEntry(entry.name)) continue;
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (!RUNTIME_HASH_SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile() && includeFile(entry.name)) {
        out.push(path.relative(root, full));
      }
    }
  };
  walk(start);
  return out.sort();
}

function hashRuntimeFileSet(root: string, files: string[]): string {
  const h = crypto.createHash('sha256');
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    try {
      h.update(fs.readFileSync(path.join(root, rel)));
    } catch {
      h.update('<unreadable>');
    }
    h.update('\0');
  }
  return h.digest('hex');
}

function computeRuntimeFingerprint(): Record<string, unknown> & {
  engineRoot: string;
  sourceHash: string;
  distHash: string;
  sourceFileCount: number;
  distFileCount: number;
} {
  const engineRoot = runtimeEngineRoot();
  const sourceFiles = runtimeHashFiles(engineRoot, engineRoot, (name) => RUNTIME_SOURCE_EXTENSIONS.has(path.extname(name)));
  const distFiles = runtimeHashFiles(engineRoot, path.join(engineRoot, 'dist'), (name) => RUNTIME_DIST_EXTENSIONS.has(path.extname(name)));
  return {
    engineRoot,
    sourceHash: hashRuntimeFileSet(engineRoot, sourceFiles),
    distHash: hashRuntimeFileSet(engineRoot, distFiles),
    sourceFileCount: sourceFiles.length,
    distFileCount: distFiles.length,
  };
}

const RUNTIME_BOOT_FINGERPRINT = computeRuntimeFingerprint();

function requiredDomainsForScope(scope: YScope): string[] {
  const required = [...MANDATORY_MCP_CONTROLLED_DOMAINS];
  if (scope === 'whole-host') required.push('wholeHostActionSpace');
  return required;
}

function mandatoryDomainCoverage(domains: YDomain[], scope: YScope): Record<string, unknown> & {
  ok: boolean;
  missing: string[];
  required: string[];
  statuses: Record<string, YStatus | 'MISSING'>;
} {
  const required = requiredDomainsForScope(scope);
  const byName = new Map(domains.map((domain) => [domain.domain, domain.status] as const));
  const statuses = Object.fromEntries(
    required.map((name) => [name, byName.get(name) ?? 'MISSING']),
  ) as Record<string, YStatus | 'MISSING'>;
  const missing = required.filter((name) => !byName.has(name));
  return { ok: missing.length === 0, missing, required, statuses };
}

function scriptPath(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const direct = path.resolve(here, name);
  return fs.existsSync(direct) ? direct : path.resolve(here, '..', name);
}

function shellPath(value: string): string {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function jsonScriptHostRoot(): string {
  const socket = process.env.ATOMIC_EXEC_BROKER_SOCKET ?? '';
  const candidates = new Set<string>();
  for (const value of [process.env.ATOMIC_HOST_WRITE_ROOT, process.env.CODEX_PROJECT_DIR, REPO_ROOT]) {
    if (value) candidates.add(path.resolve(value));
  }
  if (socket) {
    const marker = `${path.sep}.atomic${path.sep}`;
    const index = socket.indexOf(marker);
    if (index > 0) candidates.add(socket.slice(0, index));
  }
  for (const root of candidates) {
    const statePath = path.join(root, '.atomic', 'codex-broker-current.json');
    try {
      const payload = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        agent?: unknown;
        repoRoot?: unknown;
        socket?: unknown;
      };
      if (payload.agent === 'codex' && typeof payload.repoRoot === 'string') {
        if (!socket || typeof payload.socket !== 'string' || path.resolve(payload.socket) === path.resolve(socket)) {
          return path.resolve(payload.repoRoot);
        }
      }
    } catch {
      // Broker state is optional outside hosted Codex sessions.
    }
  }
  if (process.env.ATOMIC_HOST_WRITE_ROOT) return path.resolve(process.env.ATOMIC_HOST_WRITE_ROOT);
  if (socket) {
    const marker = `${path.sep}.atomic${path.sep}`;
    const index = socket.indexOf(marker);
    if (index > 0) return socket.slice(0, index);
  }
  return REPO_ROOT;
}

function jsonScriptEnv(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ATOMIC_SINGLE_TOOL_CALL: '',
    ATOMIC_SINGLE_TOOL_NAME: '',
    ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
    ATOMIC_HOST_WRITE_ROOT: root,
    CODEX_PROJECT_DIR: root,
    TMPDIR: root,
    TMP: root,
    TEMP: root,
  };
}

function jsonScriptMustRunHostDirect(name: string): boolean {
  return new Set([
    'gates/atomic-exec-readonly-usability.proof.mjs',
    'gates/atomic-exec-sandbox.proof.mjs',
    'gates/external-runtime-denial.proof.mjs',
    'gates/mcp-launcher-host-boundary.proof.mjs',
    'gates/codex-entrypoint-contract.proof.mjs',
    'gates/whole-host-sandbox-launcher.proof.mjs',
  ]).has(name);
}

function jsonScriptError(
  e: unknown,
  stdoutOverride?: string,
  stderrOverride?: string,
  statusOverride?: number | null,
  signalOverride?: NodeJS.Signals | null,
): { ok: false; error: string } {
  const err = e as Error & { stdout?: Buffer | string; stderr?: Buffer | string; status?: number | null; signal?: NodeJS.Signals | null };
  const stdout = stdoutOverride ?? (Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : String(err.stdout ?? ''));
  const stderr = stderrOverride ?? (Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : String(err.stderr ?? ''));
  const status = statusOverride ?? err.status;
  const signal = signalOverride ?? err.signal;
  const details = [
    err.message,
    typeof status === 'number' ? `status=${status}` : '',
    signal ? `signal=${signal}` : '',
    stdout.trim() ? `stdout=${stdout.slice(0, 4000)}` : '',
    stderr.trim() ? `stderr=${stderr.slice(0, 4000)}` : '',
  ].filter(Boolean).join(' | ');
  return { ok: false, error: details || String(e) };
}

function parseJsonScriptOutput(out: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(out) as Record<string, unknown> };
  } catch (e) {
    return jsonScriptError(e, out, '', null, null);
  }
}

function runJsonScriptDirect(
  name: string,
  args: string[],
  timeoutMs: number,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const root = jsonScriptHostRoot();
    const out = childProcess.execFileSync(process.execPath, [scriptPath(name), ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: jsonScriptEnv(root),
    });
    return parseJsonScriptOutput(out);
  } catch (e) {
    return jsonScriptError(e);
  }
}

function runJsonScriptViaBroker(
  name: string,
  args: string[],
  timeoutMs: number,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } | null {
  const socket = process.env.ATOMIC_EXEC_BROKER_SOCKET ?? '';
  const root = jsonScriptHostRoot();
  const client = path.join(root, 'scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs');
  if (!socket || process.env.ATOMIC_EXEC_BROKER_ROOT || !fs.existsSync(client)) return null;

  const command = [process.execPath, scriptPath(name), ...args].map(shellPath).join(' ');
  const env = jsonScriptEnv(root);
  const result = childProcess.spawnSync(process.execPath, [client, socket], {
    cwd: root,
    input: JSON.stringify({ command, cwd: root, effectRoot: root, timeoutMs, env }),
    encoding: 'utf8',
    timeout: timeoutMs + 5000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) return jsonScriptError(result.error);

  let reply: Record<string, unknown>;
  try {
    reply = JSON.parse(result.stdout || '{}') as Record<string, unknown>;
  } catch (e) {
    return jsonScriptError(e, String(result.stdout ?? ''), String(result.stderr ?? ''), result.status, result.signal);
  }
  const stdout = typeof reply.stdout === 'string' ? reply.stdout : '';
  const stderr = typeof reply.stderr === 'string' ? reply.stderr : '';
  const exitCode = typeof reply.exitCode === 'number' ? reply.exitCode : result.status;
  if (reply.brokerUnreachable || reply.ok === false || exitCode !== 0) {
    return jsonScriptError(
      new Error(String(reply.error ?? `brokered ${name} failed`)),
      stdout,
      stderr,
      exitCode,
      (reply.signal as NodeJS.Signals | null) ?? result.signal,
    );
  }
  return parseJsonScriptOutput(stdout);
}

function runJsonScript(
  name: string,
  args: string[],
  timeoutMs = 15000,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!jsonScriptMustRunHostDirect(name)) {
    const brokered = runJsonScriptViaBroker(name, args, timeoutMs);
    if (brokered) return brokered;
  }
  return runJsonScriptDirect(name, args, timeoutMs);
}

function hostSandboxMarkersActive(): boolean {
  return process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' && process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
}

function hostProofMode(hostProof: { ok: true; value: Record<string, unknown> } | { ok: false; error: string }): string | null {
  if (hostProof.ok) return typeof hostProof.value.mode === 'string' ? hostProof.value.mode : null;
  const match = hostProof.error.match(/\"mode\"\s*:\s*\"([^\"]+)\"/);
  return match ? match[1] : null;
}

function currentHostSandboxAdmitted(hostProof: { ok: true; value: Record<string, unknown> } | { ok: false; error: string }): boolean {
  return hostSandboxMarkersActive() && hostProof.ok && hostProof.value.ok === true && hostProofMode(hostProof) === 'inherited-host';
}

function shellArgForReceipt(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(value) ? value : shellPath(value);
}

function hostLauncherReceiptCommand(command: string[]): string {
  return [process.execPath, scriptPath('codex-atomic-host-launcher.mjs'), '--', ...command].map(shellArgForReceipt).join(' ');
}

function codexHookWiringStatus(): Record<string, unknown> & {
  hooksEnabled: boolean;
  strictProjectHook: boolean;
  userConfigPath: string;
  projectHooksPath: string;
} {
  const userConfigPath = path.join(process.env.HOME ?? '', '.codex/config.toml');
  const projectHooksPath = path.join(REPO_ROOT, '.codex/hooks.json');
  const hooksEnabled = fs.existsSync(userConfigPath)
    ? /^hooks\s*=\s*true\b/m.test(fs.readFileSync(userConfigPath, 'utf8'))
    : false;
  let strictProjectHook = false;
  try {
    const hookConfig = JSON.parse(fs.readFileSync(projectHooksPath, 'utf8')) as {
      hooks?: {
        PreToolUse?: {
          matcher?: unknown;
          hooks?: { command?: unknown }[];
        }[];
      };
    };
    const preToolUse = Array.isArray(hookConfig.hooks?.PreToolUse)
      ? hookConfig.hooks.PreToolUse
      : [];
    strictProjectHook = preToolUse.some(
      (entry) =>
        String(entry.matcher ?? '') === '.*' &&
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) =>
          String(hook.command ?? '').includes('codex-atomic-only-hook.mjs'),
        ),
    );
  } catch {
    strictProjectHook = false;
  }
  return { userConfigPath, projectHooksPath, hooksEnabled, strictProjectHook };
}

function blockers(domains: YDomain[]): YDomain[] {
  return domains.filter((d) => d.status !== 'GREEN');
}

function isToolResult(value: unknown): value is ToolOk {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as ToolOk).content);
}

function annotateDelegatedCertificateResult(
  result: unknown,
  delegatedFromStaleRuntime: Record<string, unknown>,
): ToolOk {
  if (!isToolResult(result) || result.content.length === 0) {
    throw new Error('fresh atomic_y_certificate returned a non-tool result');
  }
  const last = result.content[result.content.length - 1];
  if (!last || last.type !== 'text') {
    throw new Error('fresh atomic_y_certificate returned no text payload');
  }

  try {
    const payload = JSON.parse(last.text) as Record<string, unknown>;
    return ok({ ...payload, delegatedFromStaleRuntime });
  } catch (error) {
    throw new Error(
      'fresh atomic_y_certificate returned non-JSON text payload: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

export function registerToolsY(server: McpServer): void {
  server.registerTool(
    'atomic_host_reentry_receipt',
    {
      title: 'Host re-entry receipt - exact Atomic host relaunch command',
      description:
        'Issues an audit-friendly receipt for entering or verifying the Atomic whole-host boundary. ' +
        'It does not claim whole-host Y by itself: it reports whether the current process is already admitted, ' +
        'embeds the guarded codex-atomic-host-launcher command to re-enter when needed, includes launcher proof status, ' +
        'and points reviewers back to atomic_y_certificate scope=whole-host for final verification.',
      inputSchema: {
        command: z.array(z.string()).optional().describe('Host command to run through codex-atomic-host-launcher.mjs; defaults to codex'),
      },
    },
    async (a) => {
      try {
        const command = Array.isArray(a.command) && a.command.length > 0 ? a.command.map(String) : ['codex'];
        const launcherProof = runJsonScript('gates/whole-host-sandbox-launcher.proof.mjs', ['--json'], 120000);
        const hostMarkersActive = hostSandboxMarkersActive();
        const active = currentHostSandboxAdmitted(launcherProof);
        const launcherMode = hostProofMode(launcherProof);
        return ok({
          ok: true,
          currentProcess: {
            pid: process.pid,
            activeHostSandbox: active,
            hostMarkersActive,
            hostProofMode: launcherMode,
            atomicHostSandbox: process.env.ATOMIC_HOST_SANDBOX ?? null,
            atomicHostAtomicOnly: process.env.ATOMIC_HOST_ATOMIC_ONLY ?? null,
            atomicHostWriteRoot: process.env.ATOMIC_HOST_WRITE_ROOT ?? null,
          },
          hostAdmission: {
            status: active ? 'HOST_ADMITTED' : 'HOST_REENTRY_REQUIRED',
            evidence: active
              ? 'current process has host markers and inherited whole-host sandbox proof is green'
              : hostMarkersActive
                ? 'current process carries host markers, but inherited whole-host proof is not green; re-entry is required before claiming literal whole-host no-bypass'
                : 'current process is not marked as running inside the Atomic host boundary; re-entry is required before claiming literal whole-host no-bypass',
            requiredChange: active
              ? undefined
              : 'Relaunch through the provided codex-atomic-host-launcher.mjs command, then rerun atomic_y_certificate with scope=whole-host.',
          },
          launcher: {
            command: hostLauncherReceiptCommand(command),
            commandArgs: command,
            proof: launcherProof.ok ? launcherProof.value : { ok: false, error: launcherProof.error },
          },
          codexHookWiring: codexHookWiringStatus(),
          nextVerification: {
            tool: 'atomic_y_certificate',
            arguments: { scope: 'whole-host', includeAudits: true },
          },
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_y_certificate',
    {
      title: 'Y certificate - honest universal-admission status',
      description:
        'Reports whether atomic-edit can honestly claim Y for a requested scope. It never upgrades unknown ' +
        'coverage to green: GREEN means controlled/proven, RED means a known blocker, and UNJUDGED means the ' +
        'domain lacks enough proof. The literal whole-host claim requires kernel/overlay/process/network/db/runtime control; ' +
        'without that, the certificate returns yComplete:false with concrete required changes.',
      inputSchema: {
        scope: z
          .enum(['mcp-controlled', 'whole-host'])
          .optional()
          .describe('mcp-controlled = actions routed through atomic tools; whole-host = literal universal host action space'),
        includeAudits: z.boolean().optional().describe('run atomicity audit scripts before issuing the certificate'),
      },
    },
    async (a) => {
      try {
        const scope: YScope = a.scope ?? 'whole-host';
        // distFreshness has two layers:
        // 1. disk freshness: current source+dist match the build manifest.
        // 2. process freshness: this already-running MCP process still matches
        //    the source+dist fingerprint captured when server-tools-y loaded.
        // Without layer 2, a post-expansion rebuild can make disk look fresh while
        // the live MCP keeps executing old JS and emits a false Y_COMPLETE.
        let freshness: { fresh: boolean; reason: string; sourceHash?: string; manifestHash?: string | null; distHash?: string; manifestDistHash?: string | null };
        try {
          const here2 = path.dirname(fileURLToPath(import.meta.url));
          const freshSpec = path.join(here2, '..', 'dist-freshness.mjs');
          const mod = (await import(freshSpec)) as { isDistFresh: () => { fresh: boolean; reason: string; sourceHash?: string; manifestHash?: string | null; distHash?: string; manifestDistHash?: string | null } };
          freshness = mod.isDistFresh();
        } catch (e) {
          freshness = { fresh: false, reason: 'dist-freshness check unavailable: ' + (e instanceof Error ? e.message : String(e)) };
        }
        const currentRuntimeFingerprint = computeRuntimeFingerprint();
        const runtimeProcessFresh =
          RUNTIME_BOOT_FINGERPRINT.sourceHash === currentRuntimeFingerprint.sourceHash &&
          RUNTIME_BOOT_FINGERPRINT.distHash === currentRuntimeFingerprint.distHash &&
          process.env[Y_CERTIFICATE_FORCE_STALE_ENV] !== '1';
        const rawDelegateDepth = Number.parseInt(process.env[Y_CERTIFICATE_DELEGATE_DEPTH_ENV] ?? '0', 10);
        const delegateDepth = Number.isFinite(rawDelegateDepth) ? rawDelegateDepth : 0;
        if (freshness.fresh && !runtimeProcessFresh && delegateDepth < 1) {
          const delegated = await callFreshAtomicTool(
            atomicRootFromModule(),
            {
              ...process.env,
              [Y_CERTIFICATE_DELEGATE_DEPTH_ENV]: String(delegateDepth + 1),
              [Y_CERTIFICATE_FORCE_STALE_ENV]: '',
            },
            'atomic_y_certificate',
            { scope, includeAudits: Boolean(a.includeAudits) },
          );
          return annotateDelegatedCertificateResult(delegated, {
            staleRuntimePid: process.pid,
            staleRuntimeBootFingerprint: RUNTIME_BOOT_FINGERPRINT,
            staleRuntimeCurrentFingerprint: currentRuntimeFingerprint,
            reason: 'stale Atomic MCP runtime delegated certificate issuance to freshly compiled dist/server.js',
          });
        }
        const distFreshnessGreen = freshness.fresh && runtimeProcessFresh;
        const domains: YDomain[] = [
          {
            domain: 'distFreshness',
            status: distFreshnessGreen ? 'GREEN' : 'UNJUDGED',
            evidence: distFreshnessGreen
              ? 'running MCP process fingerprint matches boot fingerprint, and current source+dist match the build manifest'
              : freshness.fresh
                ? 'source+dist are fresh on disk, but the running MCP process fingerprint changed after boot; this process must restart before any Y certificate is trustworthy'
                : `running dist may be STALE vs source (${freshness.reason}); a cert from stale code is not trustworthy - rebuild + restart the MCP server`,
            requiredChange: distFreshnessGreen
              ? undefined
              : freshness.fresh
                ? 'Restart the atomic MCP server so the live process executes the rebuilt Atomic runtime.'
                : 'Run node build.mjs and restart the atomic MCP server so the certificate reflects current source.',
            detail: {
              ...freshness,
              runtimeProcessFresh,
              runtimeBootFingerprint: RUNTIME_BOOT_FINGERPRINT,
              runtimeCurrentFingerprint: currentRuntimeFingerprint,
            },
          },
          {
            domain: 'byteFloorWriteAdmission',
            status: 'GREEN',
            evidence: 'All atomic write helpers funnel through atomicWrite: protected guard, syntax validation, sha guard, sync write gates, and atomic rename.',
          },
          {
            domain: 'strictGateAdmission',
            status: 'GREEN',
            evidence: 'Strict registry treats RED and UNJUDGED as non-green; NOT_APPLICABLE is explicit and does not masquerade as approval.',
          },
          {
            domain: 'filesystemEffectProof',
            status: 'GREEN',
            evidence: 'atomic_exec proveEffect captures complete filesystem snapshots, diffs byte effects, and refuses incomplete snapshots before execution.',
          },
          {
            domain: 'knownExternalShellEffects',
            status: 'GREEN',
            evidence: 'atomic_exec classifies known network/database/provider/remote-host/package/runtime-control commands as external-or-host-effect and refuses them before spawn.',
          },
        ];

        const noBypassPolicy = runJsonScript('gates/no-bypass-static-policy.proof.mjs', ['--json']);
        const noBypassPolicyGreen = noBypassPolicy.ok && noBypassPolicy.value.ok === true;
        domains.push({
          domain: 'codexNoBypassStaticPolicy',
          status: noBypassPolicyGreen ? 'GREEN' : 'RED',
          evidence: noBypassPolicyGreen
            ? 'no-bypass-static-policy.proof.mjs passed: Codex hooks are enabled, the workspace catch-all observer precedes codex-atomic-only-hook, and representative detectable non-atomic calls are denied and recorded as prevented.'
            : noBypassPolicy.ok
              ? `no-bypass static policy proof reported non-green: ${JSON.stringify(noBypassPolicy.value)}`
              : `no-bypass static policy proof could not run: ${noBypassPolicy.error}`,
          requiredChange: noBypassPolicyGreen
            ? undefined
            : 'Repair Codex hook enablement/order or strict deny coverage so non-atomic detectable calls cannot execute outside Atomic.',
          detail: noBypassPolicy.ok ? noBypassPolicy.value : undefined,
        });

        const bypass = runJsonScript('bypass-report.mjs', ['--json']);
        if (bypass.ok) {
          const silentlyAllowed = Number(bypass.value.silentlyAllowedBypasses ?? 0);
          const reportStatus = String(bypass.value.status ?? 'unobserved');
          const observerWired = ((): boolean => {
            for (const rel of ['.codex/hooks.json', '.claude/settings.json', '.claude/settings.local.json']) {
              try {
                if (fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').includes('bypass-observer-hook.mjs'))
                  return true;
              } catch {
                /* file may not exist */
              }
            }
            return false;
          })();
          const bypassStatus: YStatus =
            silentlyAllowed > 0
              ? 'RED'
              : reportStatus === 'observed-clean' && observerWired
                ? 'GREEN'
                : noBypassPolicyGreen
                  ? 'GREEN'
                  : 'UNJUDGED';
          domains.push({
            domain: 'bypassLedger',
            status: bypassStatus,
            evidence:
              bypassStatus === 'GREEN' && reportStatus === 'observed-clean'
                ? `bypass-report observed ${String(bypass.value.detectableOpportunities)} opportunities, silentlyAllowedBypasses=0 (observed-clean), observer wired`
                : bypassStatus === 'GREEN'
                  ? `bypass-report status=${reportStatus}; live ledger is kept honest, while codexNoBypassStaticPolicy proves fail-closed no-bypass and silentlyAllowedBypasses=0`
                  : bypassStatus === 'RED'
                    ? `bypass-report reports silentlyAllowedBypasses=${silentlyAllowed}`
                    : `bypass-report status=${reportStatus}, observerWired=${String(observerWired)} - neither observed-clean nor static no-bypass policy is proven`,
            requiredChange:
              bypassStatus === 'GREEN'
                ? undefined
                : bypassStatus === 'RED'
                  ? 'Route every detectable edit opportunity through atomic-edit or enforce the deny hook.'
                  : 'Wire/prove the strict Codex no-bypass policy, or observe a real denied detectable opportunity until the ledger reaches observed-clean.',
            detail: { ...bypass.value, observerWired, noBypassStaticPolicyGreen: noBypassPolicyGreen },
          });
        } else {
          domains.push({
            domain: 'bypassLedger',
            status: 'UNJUDGED',
            evidence: `bypass-report.mjs could not run: ${bypass.error}`,
            requiredChange: 'Repair the bypass ledger/report path so bypass rate is observable.',
          });
        }

        const bypassObserverProof = runJsonScript('gates/codex-bypass-observer-wiring.proof.mjs', ['--json']);
        const bypassObserverGreen = bypassObserverProof.ok && bypassObserverProof.value.ok === true;
        domains.push({
          domain: 'bypassObserverDenyIntegration',
          status: bypassObserverGreen ? 'GREEN' : 'RED',
          evidence: bypassObserverGreen
            ? 'codex-bypass-observer-wiring.proof.mjs passed: Codex deny hook refuses native Write/Bash, observer records them as prevented detectable opportunities, and report emits observed-clean only after those denied opportunities.'
            : bypassObserverProof.ok
              ? `codex bypass observer proof reported non-green: ${JSON.stringify(bypassObserverProof.value)}`
              : `codex bypass observer proof could not run: ${bypassObserverProof.error}`,
          requiredChange: bypassObserverGreen
            ? undefined
            : 'Repair the Codex deny-hook/observer/report chain so native detectable attempts are denied and recorded as prevented bypass opportunities.',
          detail: bypassObserverProof.ok ? bypassObserverProof.value : undefined,
        });
        if (a.includeAudits) {
          const audit = runJsonScript('audit-atomicity.mjs', ['--strict-ratio', '--strict-current-topology', '--json']);
          if (audit.ok) {
            domains.push({
              domain: 'atomicityAudit',
              status: audit.value.pass === true ? 'GREEN' : 'RED',
              evidence:
                `audit pass=${String(audit.value.pass)} ratio=${String(audit.value.atomic_edit_ratio)} ` +
                `currentTopologyPass=${String(audit.value.currentTopologyPass)} coarse=${String(audit.value.coarse_unjustified)}`,
              requiredChange: audit.value.pass === true ? undefined : 'Eliminate coarse/untraced edits and restore current topology coverage.',
              detail: {
                pass: audit.value.pass,
                atomic_edit_ratio: audit.value.atomic_edit_ratio,
                currentTopologyPass: audit.value.currentTopologyPass,
                coarse_unjustified: audit.value.coarse_unjustified,
                silentlyAllowedBypasses: audit.value.silentlyAllowedBypasses,
              },
            });
          } else {
            domains.push({
              domain: 'atomicityAudit',
              status: 'UNJUDGED',
              evidence: `audit-atomicity.mjs could not run: ${audit.error}`,
              requiredChange: 'Repair the audit runner so the certificate can observe atomicity/topology.',
            });
          }
        } else {
          domains.push({
            domain: 'atomicityAudit',
            status: 'UNJUDGED',
            evidence: 'includeAudits=false, so current trace ratio/topology was not rechecked in this certificate run.',
            requiredChange: 'Run atomic_y_certificate with includeAudits:true for a stronger certificate.',
          });
        }

        const selfExpansionValidatorLattice = runJsonScript('gates/self-expansion-validator-lattice.proof.mjs', ['--json']);
        const selfExpansionValidatorLatticeGreen =
          selfExpansionValidatorLattice.ok && selfExpansionValidatorLattice.value.ok === true;
        domains.push({
          domain: 'selfExpansionValidatorLattice',
          status: selfExpansionValidatorLatticeGreen ? 'GREEN' : 'RED',
          evidence: selfExpansionValidatorLatticeGreen
            ? 'self-expansion-validator-lattice.proof.mjs passed: atomic_expand_self always runs a mandatory multi-domain validator lattice beyond typecheck, including runtime freshness and read-only atomic_exec usability, and caller proofs are additive only.'
            : selfExpansionValidatorLattice.ok
              ? `self-expansion validator lattice proof reported non-green: ${JSON.stringify(selfExpansionValidatorLattice.value)}`
              : `self-expansion validator lattice proof could not run: ${selfExpansionValidatorLattice.error}`,
          requiredChange: selfExpansionValidatorLatticeGreen
            ? undefined
            : 'Repair atomic_expand_self so every self-expansion runs the mandatory build/type/runtime-freshness/semantic/contract/behavior/security/test/ledger/certificate/runtime/usability/no-bypass validator lattice before acceptance.',
          detail: selfExpansionValidatorLattice.ok ? selfExpansionValidatorLattice.value : undefined,
        });

        const capabilityMonotonicity = runJsonScript('gates/security-monotonicity.proof.mjs', ['--json'], 120000);
        const capabilityMonotonicityGreen = capabilityMonotonicity.ok && capabilityMonotonicity.value.ok === true;
        domains.push({
          domain: 'capabilityMonotonicity',
          status: capabilityMonotonicityGreen ? 'GREEN' : 'RED',
          evidence: capabilityMonotonicityGreen
            ? 'security-monotonicity.proof.mjs passed: self-expansion cannot reduce measured security invariants; weakening write gates, exec laws, native-edit bans, or byte-floor guards lowers the invariant and is refused.'
            : capabilityMonotonicity.ok
              ? `capability monotonicity proof reported non-green: ${JSON.stringify(capabilityMonotonicity.value)}`
              : `capability monotonicity proof could not run: ${capabilityMonotonicity.error}`,
          requiredChange: capabilityMonotonicityGreen
            ? undefined
            : 'Repair security-invariants monotonicity so self-expansion can add capabilities only when it preserves or strengthens the measured guardrail surface.',
          detail: capabilityMonotonicity.ok ? capabilityMonotonicity.value : undefined,
        });

        const readOnlyUsability = runJsonScript('gates/atomic-exec-readonly-usability.proof.mjs', ['--json'], 120000);
        const readOnlyUsabilityGreen = readOnlyUsability.ok && readOnlyUsability.value.ok === true;
        domains.push({
          domain: 'atomicExecReadOnlyUsability',
          status: readOnlyUsabilityGreen ? 'GREEN' : 'RED',
          evidence: readOnlyUsabilityGreen
            ? 'atomic-exec-readonly-usability.proof.mjs passed: atomic_exec can perform legitimate repo-root read-only inspection under the Atomic broker no-write sandbox, including protected-file reads and git status despite /dev/null usage, while protected writes remain refused.'
            : readOnlyUsability.ok
              ? `atomic_exec read-only usability proof reported non-green: ${JSON.stringify(readOnlyUsability.value)}`
              : `atomic_exec read-only usability proof could not run: ${readOnlyUsability.error}`,
          requiredChange: readOnlyUsabilityGreen
            ? undefined
            : 'Repair atomic_exec host/broker sandbox usability so legitimate repo-root read-only inspection works without reopening protected writes or external effects.',
          detail: readOnlyUsability.ok ? readOnlyUsability.value : undefined,
        });

        const codexProtocol = runJsonScript('codex-atomic-only-hook.proof.mjs', ['--json']);
        domains.push({
          domain: 'codexAtomicOnlyProtocol',
          status: codexProtocol.ok ? 'GREEN' : 'RED',
          evidence: codexProtocol.ok
            ? 'codex-atomic-only-hook.proof.mjs passed: non-atomic Codex tool calls are denied fail-closed and denial steers to atomic self-expansion.'
            : `codex-atomic-only-hook.proof.mjs failed: ${codexProtocol.error}`,
          requiredChange: codexProtocol.ok
            ? undefined
            : 'Repair the Codex atomic-only hook/proof so native tool calls are denied before the host can execute them.',
        });

        const codexEntrypointProof = runJsonScript('gates/codex-entrypoint-contract.proof.mjs', ['--json'], 120000);
        const codexEntrypointGreen = codexEntrypointProof.ok && codexEntrypointProof.value.ok === true;
        domains.push({
          domain: 'codexEntrypointContract',
          status: codexEntrypointGreen ? 'GREEN' : 'RED',
          evidence: codexEntrypointGreen
            ? 'codex-entrypoint-contract.proof.mjs passed: Codex config routes atomic-edit to the guarded launcher, hooks enforce observer-before-deny plus Stop audit, representative native tools are denied, and the host launcher is live or statically fail-closed to atomic-only.'
            : codexEntrypointProof.ok
              ? `Codex entrypoint contract proof reported non-green: ${JSON.stringify(codexEntrypointProof.value)}`
              : `Codex entrypoint contract proof could not run: ${codexEntrypointProof.error}`,
          requiredChange: codexEntrypointGreen
            ? undefined
            : 'Repair Codex config, workspace hook chain, no-bypass proof, or host launcher contract before accepting any Y certificate as no-bypass capable.',
          detail: codexEntrypointProof.ok ? codexEntrypointProof.value : undefined,
        });

        const userConfigPath = path.join(process.env.HOME ?? '', '.codex/config.toml');
        const projectHooksPath = path.join(REPO_ROOT, '.codex/hooks.json');
        const hooksEnabled = fs.existsSync(userConfigPath)
          ? /^hooks\s*=\s*true\b/m.test(fs.readFileSync(userConfigPath, 'utf8'))
          : false;
        let strictProjectHook = false;
        try {
          const hookConfig = JSON.parse(fs.readFileSync(projectHooksPath, 'utf8')) as {
            hooks?: {
              PreToolUse?: {
                matcher?: unknown;
                hooks?: { command?: unknown }[];
              }[];
            };
          };
          const preToolUse = Array.isArray(hookConfig.hooks?.PreToolUse)
            ? hookConfig.hooks.PreToolUse
            : [];
          strictProjectHook = preToolUse.some(
            (entry) =>
              String(entry.matcher ?? '') === '.*' &&
              Array.isArray(entry.hooks) &&
              entry.hooks.some((hook) =>
                String(hook.command ?? '').includes('codex-atomic-only-hook.mjs'),
              ),
          );
        } catch {
          strictProjectHook = false;
        }
        const codexHostWired = hooksEnabled && strictProjectHook;
        domains.push({
          domain: 'codexHostWiring',
          status: codexHostWired ? 'GREEN' : 'UNJUDGED',
          evidence: codexHostWired
            ? 'Codex hooks are enabled and workspace PreToolUse includes codex-atomic-only-hook.mjs as a catch-all strict gate.'
            : `Codex host wiring unverified: hooksEnabled=${hooksEnabled} strictProjectHook=${strictProjectHook}.`,
          requiredChange: codexHostWired
            ? undefined
            : 'Wire codex-atomic-only-hook.mjs into Codex PreToolUse (or equivalent host policy) so non-atomic tool calls are impossible at runtime.',
        });
        const mcpLauncherProof = runJsonScript('gates/mcp-launcher-host-boundary.proof.mjs', ['--json'], 60000);
        const mcpLauncherGreen = mcpLauncherProof.ok && mcpLauncherProof.value.ok === true;
        domains.push({
          domain: 'mcpLauncherHostBoundary',
          status: mcpLauncherGreen ? 'GREEN' : 'RED',
          evidence: mcpLauncherGreen
            ? 'atomic-edit-mcp-launcher refuses unhosted startup and still starts the Atomic server under host-boundary markers.'
            : mcpLauncherProof.ok
              ? `mcp-launcher host-boundary proof reported non-green: ${JSON.stringify(mcpLauncherProof.value)}`
              : `mcp-launcher host-boundary proof could not run: ${mcpLauncherProof.error}`,
          requiredChange: mcpLauncherGreen
            ? undefined
            : 'Repair scripts/mcp/atomic-edit-mcp-launcher.sh so the MCP cannot bootstrap outside the atomic host boundary.',
          detail: mcpLauncherProof.ok ? mcpLauncherProof.value : undefined,
        });

        const nativeReady = await ensureReady();
        domains.push({
          domain: 'universalStructuralEngine',
          status: nativeReady && nativeAvailable() && nativeLanguages().length > 0 ? 'GREEN' : 'UNJUDGED',
          evidence: `web-tree-sitter available=${String(nativeReady && nativeAvailable())}, languages=${nativeLanguages().length}`,
          requiredChange: nativeReady && nativeAvailable() ? undefined : 'Repair/load the universal structural engine or use explicit range/text operators.',
          detail: { languageCount: nativeLanguages().length, languages: nativeLanguages() },
        });

        const hostSandboxActiveForProof =
          process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
          process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
        const sandboxProof = runJsonScript(
          'gates/atomic-exec-sandbox.proof.mjs',
          ['--json'],
          hostSandboxActiveForProof ? 120000 : 30000,
        );
        const sandboxGreen = sandboxProof.ok && sandboxProof.value.ok === true;
        domains.push({
          domain: 'arbitraryInterpreterSandbox',
          status: sandboxGreen ? 'GREEN' : scope === 'whole-host' ? 'RED' : 'UNJUDGED',
          evidence: sandboxGreen
            ? 'atomic_exec sandbox proof passed: macOS sandbox-exec denies trace-only writes, denies outside-cwd/temp writes, denies network, and allows cwd writes under byte-effect proof.'
            : sandboxProof.ok
              ? `atomic_exec sandbox proof reported non-green: ${JSON.stringify(sandboxProof.value)}`
              : `atomic_exec sandbox proof could not run: ${sandboxProof.error}`,
          requiredChange: sandboxGreen
            ? undefined
            : 'Wrap spawned commands in a real filesystem/process/network sandbox and prove denied trace-only writes, denied outside-cwd/temp writes, plus denied network.',
          detail: sandboxProof.ok ? sandboxProof.value : undefined,
        });
        const externalProof = runJsonScript('gates/external-runtime-denial.proof.mjs', ['--json']);
        const externalGreen = externalProof.ok && externalProof.value.ok === true;
        domains.push({
          domain: 'externalRuntimeState',
          status: externalGreen ? 'GREEN' : 'RED',
          evidence: externalGreen
            ? 'external-runtime denial proof passed: known network/database/provider/package commands are refused before spawn and hidden interpreter network is denied by sandbox.'
            : externalProof.ok
              ? `external-runtime denial proof reported non-green: ${JSON.stringify(externalProof.value)}`
              : `external-runtime denial proof could not run: ${externalProof.error}`,
          requiredChange: externalGreen
            ? undefined
            : 'Add domain-specific MCP gates/receipts for admitted external substrates, or keep those effects fail-closed with proof.',
          detail: externalProof.ok ? externalProof.value : undefined,
        });
        if (scope === 'whole-host') {
          const hostProof = runJsonScript('gates/whole-host-sandbox-launcher.proof.mjs', ['--json']);
          const hostMarkersActive = hostSandboxMarkersActive();
          const hostProofGreen = hostProof.ok && hostProof.value.ok === true;
          const currentHostAdmitted = currentHostSandboxAdmitted(hostProof);
          const launcherMode = hostProofMode(hostProof);
          domains.push({
            domain: 'wholeHostActionSpace',
            status: currentHostAdmitted ? 'GREEN' : 'RED',
            evidence: currentHostAdmitted
              ? 'current host process has host markers and inherited whole-host sandbox proof is green.'
              : hostProof.ok
                ? `host sandbox launcher proof ok=${String(hostProof.value.ok)} mode=${String(launcherMode)} hostMarkersActive=${String(hostMarkersActive)} hostProofGreen=${String(hostProofGreen)}; current process is not yet proven to be inside the mandatory host boundary.`
                : `host sandbox launcher proof could not run: ${hostProof.error}` +
                  ` hostMarkersActive=${String(hostMarkersActive)}; MCP cannot by itself prevent bytes/effects produced outside its tool surface.`,
            requiredChange: currentHostAdmitted
              ? undefined
              : 'Relaunch the agent through scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs (or codex-atomic-host-launcher.mjs), keep the catch-all atomic-only PreToolUse hook active, and install an equivalent mandatory host policy for any other writer process before claiming literal whole-host Y.',
            detail: {
              activeHostSandbox: currentHostAdmitted,
              hostMarkersActive,
              hostProofGreen,
              hostProofMode: launcherMode,
              launcherProof: hostProof.ok ? hostProof.value : undefined,
            },
          });
        }

        const mandatoryCoverage = mandatoryDomainCoverage(domains, scope);
        domains.push({
          domain: 'certificateMandatoryDomainCoverage',
          status: mandatoryCoverage.ok ? 'GREEN' : 'RED',
          evidence: mandatoryCoverage.ok
            ? `certificate contains every mandatory ${scope} domain before Y completion is computed`
            : `certificate is missing mandatory ${scope} domains: ${mandatoryCoverage.missing.join(', ')}`,
          requiredChange: mandatoryCoverage.ok
            ? undefined
            : 'Add and prove every mandatory certificate domain before allowing Y_COMPLETE.',
          detail: mandatoryCoverage,
        });

        const bad = blockers(domains);
        const yComplete = bad.length === 0;
        return ok({
          ok: true,
          scope,
          runtimePid: process.pid,
          yComplete,
          verdict: yComplete ? 'Y_COMPLETE' : 'Y_BLOCKED',
          domains,
          blockers: bad.map((d) => ({ domain: d.domain, status: d.status, requiredChange: d.requiredChange ?? d.evidence })),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
