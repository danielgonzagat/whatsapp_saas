import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT, resolveSafeTarget } from './guard.js';
import { ok, fail } from './server-helpers-result.js';
import { atomicWrite } from './server-helpers-io.js';
import { registerPendingWrites, clearPendingWrites } from './connection-gate.js';
import { converge } from './gates/converge-operator.js';
import { convergeStatic, type Mutation } from './server-helpers-converge.js';
import { chooseIntegration, riskLevelFor, validationPlan, PRODUCT_INTEGRATION_IDS, type ProductIntegrationId } from './server-helpers-product-locks.js';
import { recordIntentFailureLearning, summarizeIntentFailureMemory } from './server-helpers-intent-learning.js';

const DraftFileSchema = z.object({ file: z.string().min(1), newText: z.string().min(1) });
const IntentContractSchema = z.object({
  goal: z.string().min(1),
  targetIntegration: z.enum(PRODUCT_INTEGRATION_IDS).optional(),
  actor: z.string().optional(),
  acceptanceCriteria: z.array(z.string().min(1)).optional(),
  validationPlan: z.array(z.string().min(1)).optional(),
});

function sha256Text(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function literal(value: unknown): string {
  return JSON.stringify(value);
}

function defaultOutputFile(targetIntegration: ProductIntegrationId): string {
  return `.atomic/generated-intent/${targetIntegration}.intent.test.ts`;
}

function normalizeRel(file: string): string {
  return file.replaceAll('\\', '/');
}

function generatedIntentConfigRel(file: string): string | null {
  const rel = normalizeRel(file);
  if (!rel.startsWith('.atomic/generated-intent/') || !/\.[cm]?tsx?$/.test(rel)) return null;
  return `${path.posix.dirname(rel)}/tsconfig.json`;
}

function generatedIntentTsconfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['*.ts', '*.tsx', '*.mts', '*.cts'],
  }, null, 2)}\n`;
}

function withGeneratedIntentProject(seed: readonly { file: string; newText: string }[]): Array<{ file: string; newText: string }> {
  const out = [...seed];
  const present = new Set(seed.map((entry) => normalizeRel(entry.file)));
  for (const entry of seed) {
    const configRel = generatedIntentConfigRel(entry.file);
    if (!configRel || present.has(configRel)) continue;
    if (fs.existsSync(resolveSafeTarget(configRel).absPath)) continue;
    out.push({ file: configRel, newText: generatedIntentTsconfig() });
    present.add(configRel);
  }
  return out;
}

function buildContractModule(args: {
  goal: string;
  actor: string;
  targetIntegration: ProductIntegrationId;
  integrationLabel: string;
  riskLevel: string;
  surfaces: readonly string[];
  acceptanceCriteria: readonly string[];
  validationPlan: readonly string[];
}): string {
  return [
    'export const atomicIntentContract = {',
    `  goal: ${literal(args.goal)},`,
    `  actor: ${literal(args.actor)},`,
    `  targetIntegration: ${literal(args.targetIntegration)},`,
    `  integrationLabel: ${literal(args.integrationLabel)},`,
    `  riskLevel: ${literal(args.riskLevel)},`,
    `  surfaces: ${literal(args.surfaces)},`,
    `  acceptanceCriteria: ${literal(args.acceptanceCriteria)},`,
    `  validationPlan: ${literal(args.validationPlan)},`,
    '} as const;',
    '',
    'export function describeAtomicIntentContract(): string {',
    '  return atomicIntentContract.goal;',
    '}',
    '',
  ].join('\n');
}

function normalizeMutations(seed: readonly { file: string; newText: string }[]): Mutation[] {
  const seen = new Set<string>();
  return seed.map((entry) => {
    const target = resolveSafeTarget(entry.file);
    if (seen.has(target.relPath)) throw new Error(`duplicate generated target: ${target.relPath}`);
    seen.add(target.relPath);
    return { file: target.relPath, newText: entry.newText };
  });
}

function summarizeFiles(mutations: readonly Mutation[]): Array<{ file: string; sha256: string; bytes: number; newText: string }> {
  return mutations.map((mutation) => ({
    file: mutation.file,
    sha256: sha256Text(mutation.newText),
    bytes: Buffer.byteLength(mutation.newText),
    newText: mutation.newText,
  }));
}

function residualGates(residuals: readonly unknown[], fallbackGate?: string | null): string[] {
  const gates = new Set<string>();
  if (fallbackGate) gates.add(fallbackGate);
  for (const residual of residuals) {
    if (typeof residual === 'object' && residual !== null && 'gate' in residual) {
      const gate = (residual as { gate?: unknown }).gate;
      if (typeof gate === 'string' && gate.trim()) gates.add(gate);
    } else if (typeof residual === 'string') {
      const match = /^([a-z0-9-]+)\b/i.exec(residual);
      if (match) gates.add(match[1]);
    }
  }
  return [...gates].sort();
}

function residualFacts(residuals: readonly unknown[]): string[] {
  return residuals.map((residual) =>
    typeof residual === 'string' ? residual : JSON.stringify(residual),
  ).filter((entry) => entry && entry !== 'undefined').slice(0, 20);
}

export function registerToolsIntentConverge(server: McpServer): void {
  server.registerTool(
    'atomic_intent_converge',
    {
      title: 'Compile a product intent contract into a green-convergent overlay',
      description:
        'Unifies product_intent_contract and the convergence operator. It builds a product contract, creates or accepts draft bytes, runs the backward convergence operator until the overlay is green or needsIntent, then validates the final bytes before optional commit. Default is preview; commit:true writes only after green convergence and write-gate admission.',
      inputSchema: {
        goal: z.string().min(1).optional(),
        contract: IntentContractSchema.optional(),
        targetIntegration: z.enum(PRODUCT_INTEGRATION_IDS).optional(),
        actor: z.string().optional(),
        outputFile: z.string().optional().describe('repo-relative target for generated contract bytes when draftFiles is omitted'),
        draftFiles: z.array(DraftFileSchema).optional().describe('optional full candidate bytes to repair/converge instead of generating the default contract module'),
        commit: z.boolean().optional().describe('persist after convergence; default false = preview only'),
      },
    },
    async (a) => {
      try {
        const goal = (a.contract?.goal ?? a.goal ?? '').trim();
        if (!goal) return fail('atomic_intent_converge requires goal or contract.goal.');
        const targetIntegration = (a.contract?.targetIntegration ?? a.targetIntegration) as ProductIntegrationId | undefined;
        const profile = chooseIntegration(goal, targetIntegration);
        const actor = (a.contract?.actor ?? a.actor ?? 'founder/operator').trim() || 'founder/operator';
        const riskLevel = riskLevelFor(goal, profile);
        const failureMemory = summarizeIntentFailureMemory(goal, profile.id);
        const acceptanceCriteria = a.contract?.acceptanceCriteria?.length ? a.contract.acceptanceCriteria : profile.acceptanceCriteria;
        const plan = a.contract?.validationPlan?.length ? a.contract.validationPlan : validationPlan(profile, riskLevel);
        const requestedFiles = a.draftFiles?.length
          ? a.draftFiles
          : [{
              file: a.outputFile ?? defaultOutputFile(profile.id),
              newText: buildContractModule({
                goal,
                actor,
                targetIntegration: profile.id,
                integrationLabel: profile.label,
                riskLevel,
                surfaces: profile.surfaces,
                acceptanceCriteria,
                validationPlan: plan,
              }),
            }];
        const seedMutations = normalizeMutations(withGeneratedIntentProject(requestedFiles));
        const report = await converge(REPO_ROOT, new Map(seedMutations.map((mutation) => [mutation.file, mutation.newText])));
        if (!report.converged) {
          const learningEvent = recordIntentFailureLearning({
            goal,
            targetIntegration: profile.id,
            kind: 'operator-residual-reds',
            gates: residualGates(report.residual),
            residualFacts: residualFacts(report.residual),
            acceptedSplices: report.accepted,
          });
          const summaryForHuman = `Intent converge needs more intent: ${report.finalReds} residual red(s), ${report.appliedEdits} splice(s) accepted, nothing written.`;
          return ok({
            ok: true,
            summaryForHuman,
            summary: summaryForHuman,
            goal,
            targetIntegration: profile.id,
            integrationLabel: profile.label,
            actor,
            riskLevel,
            failureMemory,
            learningEventRecorded: true,
            learningEvent,
            converged: false,
            needsIntent: true,
            committed: false,
            acceptedSplices: report.accepted,
            residualReds: report.residual,
            files: summarizeFiles(report.files),
          });
        }
        const finalMutations = report.files.map((file) => ({ file: file.file, newText: file.newText }));
        const staticGate = await convergeStatic(REPO_ROOT, finalMutations);
        if (!staticGate.converged) {
          const firstRed = staticGate.firstRed;
          const residual = firstRed?.reds ?? [];
          const learningEvent = recordIntentFailureLearning({
            goal,
            targetIntegration: profile.id,
            kind: 'write-gate-refusal',
            gates: residualGates(residual, firstRed?.gate ?? null),
            residualFacts: residualFacts(residual),
            acceptedSplices: report.accepted,
          });
          const summaryForHuman = `Intent converge reached operator green but write-gate admission refused ${firstRed?.gate ?? 'unknown'}; nothing written.`;
          return ok({
            ok: true,
            summaryForHuman,
            summary: summaryForHuman,
            goal,
            targetIntegration: profile.id,
            integrationLabel: profile.label,
            actor,
            riskLevel,
            failureMemory,
            learningEventRecorded: true,
            learningEvent,
            converged: false,
            needsIntent: true,
            committed: false,
            refusedGate: firstRed?.gate ?? null,
            gates: staticGate.gates,
            acceptedSplices: report.accepted,
            residualReds: residual,
            files: summarizeFiles(finalMutations),
          });
        }
        if (a.commit) {
          const targets = finalMutations.map((mutation) => ({ ...resolveSafeTarget(mutation.file), newText: mutation.newText }));
          registerPendingWrites(targets.map((target) => target.absPath));
          try {
            for (const target of targets) atomicWrite(target.absPath, target.newText);
          } finally {
            clearPendingWrites();
          }
        }
        const summaryForHuman = `Intent converge ${a.commit ? 'committed' : 'previewed'} ${finalMutations.length} file(s) for ${profile.label}; ${report.appliedEdits} splice(s), gates green.`;
        return ok({
          ok: true,
          summaryForHuman,
          summary: summaryForHuman,
          goal,
          targetIntegration: profile.id,
          integrationLabel: profile.label,
          actor,
          riskLevel,
          surfaces: profile.surfaces,
          acceptanceCriteria,
          validationPlan: plan,
          failureMemory,
          learningEventRecorded: false,
          converged: true,
          needsIntent: false,
          committed: Boolean(a.commit),
          gates: staticGate.gates,
          acceptedSplices: report.accepted,
          files: summarizeFiles(finalMutations),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
