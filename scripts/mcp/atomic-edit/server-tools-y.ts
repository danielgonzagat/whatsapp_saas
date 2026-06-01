import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
import { ok, fail } from './server-helpers-result.js';
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

function scriptPath(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const direct = path.resolve(here, name);
  return fs.existsSync(direct) ? direct : path.resolve(here, '..', name);
}

function runJsonScript(
  name: string,
  args: string[],
  timeoutMs = 15000,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const out = childProcess.execFileSync(process.execPath, [scriptPath(name), ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, value: JSON.parse(out) as Record<string, unknown> };
  } catch (e) {
    const err = e as Error & { stdout?: Buffer | string; stderr?: Buffer | string; status?: number | null; signal?: NodeJS.Signals | null };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : String(err.stdout ?? '');
    const stderr = Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : String(err.stderr ?? '');
    const details = [
      err.message,
      typeof err.status === 'number' ? `status=${err.status}` : '',
      err.signal ? `signal=${err.signal}` : '',
      stdout.trim() ? `stdout=${stdout.slice(0, 4000)}` : '',
      stderr.trim() ? `stderr=${stderr.slice(0, 4000)}` : '',
    ].filter(Boolean).join(' | ');
    return { ok: false, error: details || String(e) };
  }
}

function blockers(domains: YDomain[]): YDomain[] {
  return domains.filter((d) => d.status !== 'GREEN');
}

export function registerToolsY(server: McpServer): void {
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
        // distFreshness: detect when THIS running server executes STALE dist vs
        // current source. A certificate from stale code is not trustworthy — surface
        // it honestly (UNJUDGED) rather than report greens from code that no longer
        // matches. (Closes the false-green-from-stale-dist hole.)
        let freshness: { fresh: boolean; reason: string };
        try {
          const here2 = path.dirname(fileURLToPath(import.meta.url));
          const freshSpec = path.join(here2, '..', 'dist-freshness.mjs');
          const mod = (await import(freshSpec)) as { isDistFresh: () => { fresh: boolean; reason: string } };
          freshness = mod.isDistFresh();
        } catch (e) {
          freshness = { fresh: false, reason: 'dist-freshness check unavailable: ' + (e instanceof Error ? e.message : String(e)) };
        }
        const domains: YDomain[] = [
          {
            domain: 'distFreshness',
            status: freshness.fresh ? 'GREEN' : 'UNJUDGED',
            evidence: freshness.fresh
              ? 'running dist matches current engine source (build manifest hash equals live source hash)'
              : `running dist may be STALE vs source (${freshness.reason}); a cert from stale code is not trustworthy — rebuild + restart the MCP server`,
            requiredChange: freshness.fresh ? undefined : 'Run node build.mjs and restart the atomic MCP server so the certificate reflects current source.',
            detail: freshness,
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
                    : `bypass-report status=${reportStatus}, observerWired=${String(observerWired)} — neither observed-clean nor static no-bypass policy is proven`,
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
          const activeHostSandbox =
            process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
            process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
          const hostProofGreen = hostProof.ok && hostProof.value.ok === true;
          const wholeHostGreen = activeHostSandbox && hostProofGreen;
          domains.push({
            domain: 'wholeHostActionSpace',
            status: wholeHostGreen ? 'GREEN' : 'RED',
            evidence: wholeHostGreen
              ? 'current host process is marked as launched inside the atomic host sandbox and launcher proof is green.'
              : hostProof.ok
                ? `host sandbox launcher proof ok=${String(hostProof.value.ok)} activeHostSandbox=${String(activeHostSandbox)}; current process is not yet proven to be inside the mandatory host boundary.`
                : `host sandbox launcher proof could not run: ${hostProof.error}` +
                  ` activeHostSandbox=${String(activeHostSandbox)}; MCP cannot by itself prevent bytes/effects produced outside its tool surface.`,
            requiredChange: wholeHostGreen
              ? undefined
              : 'Relaunch the agent through scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs (or codex-atomic-host-launcher.mjs), keep the catch-all atomic-only PreToolUse hook active, and install an equivalent mandatory host policy for any other writer process before claiming literal whole-host Y.',
            detail: {
              activeHostSandbox,
              launcherProof: hostProof.ok ? hostProof.value : undefined,
            },
          });
        }

        const bad = blockers(domains);
        const yComplete = bad.length === 0;
        return ok({
          ok: true,
          scope,
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
