/**
 * server-tools-converge.ts — atomic_converge: the unified, correct-by-construction
 * action. Construction and validation are ONE: a candidate mutation is committed
 * ONLY if it converges GREEN across every applicable gate (syntax + connection,
 * then optionally the dynamic byte-effect gate). A red mutation never persists —
 * it is not "a change that failed validation", it is not a change at all.
 *
 * Static gates run on an in-memory overlay (refused before any disk write). The
 * effect gate runs apply -> run -> revert-byte-exact-on-red, reusing the
 * filesystem-effect substrate. This is the keystone the rest of the atom derives
 * from: the agent can only commit what converges green.
 */
import * as childProcess from 'node:child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT, resolveSafeTarget } from './guard.js';
import { atomicWrite, readUtf8 } from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { convergeStatic, type Mutation } from './server-helpers-converge.js';
import { captureEffectSnapshot, diffEffect, rollbackEffect } from './server-helpers-effect.js';
import { registerPendingWrites, clearPendingWrites } from './connection-gate.js';
import { runGates, DYNAMIC_GATES } from './gates/registry.js';

export function registerToolsConverge(server: McpServer): void {
  server.registerTool(
    'atomic_converge',
    {
      title: 'Correct-by-construction action — commit a mutation ONLY if it converges green across every gate',
      description:
        'The unified atomic action: give one or more candidate file mutations (full new content). It runs ALL ' +
        'applicable gates and commits ONLY if they ALL go green — otherwise NOTHING is written and it reports ' +
        'exactly which gate reddened. Static gates (no disk write, refused before touching the tree): syntax ' +
        '(web-tree-sitter, any language) + connection (every new relative import resolves to a real file — a ' +
        'dangling wire is a fact, no heuristic). Optional dynamic gate: pass effectCommand to additionally require ' +
        'that running it stays green AFTER applying — on a non-zero exit the whole mutation is reverted BYTE-EXACT ' +
        '(untracked-inclusive). This makes construction and validation one act: the agent can only commit what ' +
        'converges green. Default is preview (commit:true to persist).',
      inputSchema: {
        mutations: z
          .array(z.object({ file: z.string(), newText: z.string() }))
          .min(1)
          .describe('candidate: full new content per repo-relative file'),
        commit: z.boolean().optional().describe('persist if it converges green (default false = preview only)'),
        effectCommand: z
          .string()
          .optional()
          .describe('dynamic gate: a shell command that must exit 0 after applying, else the mutation is reverted'),
        effectTimeoutMs: z.number().int().min(1000).max(600000).optional(),
      },
    },
    async (a) => {
      try {
        const mutations: Mutation[] = a.mutations.map((m) => ({ file: m.file, newText: m.newText }));
        // Guard every target first (path-escape + protected-file refusal) before any work.
        let repoRoot = REPO_ROOT;
        for (const m of mutations) {
          const t = resolveSafeTarget(m.file);
          repoRoot = t.repoRoot;
        }

        // ── static convergence (no disk write) ──
        const conv = await convergeStatic(repoRoot, mutations);
        if (!conv.converged) {
          const r = conv.firstRed!;
          return ok({
            converged: false,
            committed: false,
            refusedGate: r.gate,
            gates: conv.gates,
            summaryForHuman:
              `⛔ refused — ${r.gate} gate is RED: ${r.reds.slice(0, 6).join('; ')}` +
              `${r.reds.length > 6 ? ` (+${r.reds.length - 6} more)` : ''}. ` +
              `Nothing written — only a green-convergent mutation commits.`,
          });
        }
        if (!a.commit) {
          return ok({
            converged: true,
            committed: false,
            gates: conv.gates,
            summaryForHuman: `✅ converges green (${conv.gates.map((g) => g.gate).join(' + ')}). preview — not written (commit:true to persist).`,
          });
        }

        // ── apply through the firewall (snapshot first for the effect + probe gates) ──
        const hasProbes = mutations.some((m) => /@probe-convergence/.test(m.newText));
        const effectSnap = a.effectCommand || hasProbes ? captureEffectSnapshot(repoRoot) : null;
        const written: string[] = [];
        const targets = mutations.map((m) => ({ ...resolveSafeTarget(m.file), newText: m.newText }));
        // Register the whole set as pending so the byte-floor connection gate sees
        // the files this atomic set is about to create (A may legitimately import a
        // brand-new B written later in the same loop). Cleared unconditionally.
        registerPendingWrites(targets.map((t) => t.absPath));
        try {
          for (const t of targets) {
            atomicWrite(t.absPath, t.newText);
            written.push(t.relPath);
          }
        } finally {
          clearPendingWrites();
        }

        // ── dynamic effect gate: run it; revert byte-exact on red ──
        if (a.effectCommand && effectSnap) {
          const res = childProcess.spawnSync('/bin/bash', ['-c', a.effectCommand], {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: a.effectTimeoutMs ?? 180000,
            maxBuffer: 16 * 1024 * 1024,
            env: process.env,
          });
          if ((res.status ?? 1) !== 0) {
            const reverted = rollbackEffect(effectSnap, diffEffect(effectSnap));
            const tail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-10).join('\n');
            return ok({
              converged: false,
              committed: false,
              refusedGate: 'effect',
              gates: [...conv.gates, { gate: 'effect', green: false, reds: [a.effectCommand] }],
              reverted,
              summaryForHuman:
                `⛔ refused — effect gate RED (exit ${res.status}); reverted ${reverted} file(s) byte-exact. ` +
                `Construction = validation: a mutation that breaks at runtime never persists.\n${tail.slice(-500)}`,
            });
          }
        }

        // ── dynamic gates (probe-convergence): the candidate is on disk; each probe
        // self-instruments → runs deterministically → reverts its instrumentation
        // byte-exact. A RED means the mutation does not satisfy its own asserted
        // runtime fact → revert the whole candidate write byte-exact, refuse.
        if (hasProbes && effectSnap) {
          const dyn = await runGates(DYNAMIC_GATES, repoRoot, new Map<string, string>(), written);
          if (!dyn.green) {
            const reverted = rollbackEffect(effectSnap, diffEffect(effectSnap));
            return ok({
              converged: false,
              committed: false,
              refusedGate: 'probe-convergence',
              gates: [
                ...conv.gates,
                {
                  gate: 'probe-convergence',
                  green: false,
                  reds: dyn.reds.map((r) => `${r.file}${r.locus ? `:${r.locus}` : ''} — ${r.fact}`),
                },
              ],
              reverted,
              summaryForHuman:
                `⛔ refused — probe-convergence RED; reverted ${reverted} file(s) byte-exact. ` +
                `A mutation that fails its own asserted runtime fact never persists.\n` +
                `${dyn.reds.slice(0, 3).map((r) => r.fact).join('; ')}`,
            });
          }
        }

        return ok({
          converged: true,
          committed: true,
          files: written,
          gates: a.effectCommand ? [...conv.gates, { gate: 'effect', green: true, reds: [] }] : conv.gates,
          summaryForHuman:
            `✅ committed ${written.length} file(s) — converged GREEN across ` +
            `${conv.gates.map((g) => g.gate).join(' + ')}${a.effectCommand ? ' + effect' : ''}. ` +
            `Only the green-convergent mutation persisted.`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
