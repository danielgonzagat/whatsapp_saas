import * as fs from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { atomicWrite } from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { chooseIntegration, riskLevelFor, validationPlan, verifiedEvidenceWeight, classifyTruth, artifactExists, isRealKind, productEvidenceVerified, hasVerifiedProductProof, readJsonOptional, readTextOptional, lockRoot, safeLockId, lockDir, lockFile, readLockRecord, listLocks, PRODUCT_INTEGRATION_IDS, EvidenceKindSchema, EvidenceStatusSchema } from './server-helpers-product-locks.js';
import { runProveDirective, isGateBackedRealProbe } from './gate-receipt-mapper.js';
import { createAtomicSeal, verifyAtomicSealEnvelope } from './server-helpers-seal.js';

export function registerToolsH(server: McpServer): void {
server.registerTool(
  'product_intent_contract',
  {
    title: 'Turn a human product goal into an atomic product contract',
    description:
      'Classifies a plain-language goal into a named product integration, acceptance criteria, risk, proof plan, non-goals, and the next smallest atomic action. This prevents agents from coding before they know the behavior to prove.',
    inputSchema: {
      goal: z.string().min(1),
      targetIntegration: z.enum(PRODUCT_INTEGRATION_IDS).optional(),
      actor: z
        .string()
        .optional()
        .describe('non-technical actor or user role affected by the behavior'),
    },
  },
  async (a) => {
    try {
      const profile = chooseIntegration(a.goal, a.targetIntegration);
      const risk = riskLevelFor(a.goal, profile);
      const summaryForHuman =
        `Contrato de produto: ${profile.label}\n` +
        `Resultado pedido: ${a.goal}\n` +
        `Como validar sem codigo: ${profile.acceptanceCriteria.join(' -> ')}\n` +
        `Proxima menor acao: provar ou implementar exatamente o primeiro criterio ainda vermelho.`;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        goal: a.goal,
        actor: a.actor ?? 'founder/operator',
        targetIntegration: profile.id,
        integrationLabel: profile.label,
        riskLevel: risk,
        surfaces: profile.surfaces,
        acceptanceCriteria: profile.acceptanceCriteria,
        behaviorProofRequired: profile.behaviorProof,
        nonGoals: [
          'nao reconstruir tooling sem regressao objetiva',
          'nao declarar comportamento real sem evidencia runtime/API/DB/browser',
          'nao pedir decisao tecnica ao fundador quando a decisao e implementacional',
        ],
        externalBlockers: profile.externalBlockers,
        validationPlan: validationPlan(profile, risk),
        zeroCodeTrustTarget: 100,
        nextAtomicAction:
          'usar code_outline/code_read_symbol na superficie minima e anexar a primeira prova comportamental que falha ou passa',
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'zero_code_trust_score',
  {
    title: 'Score whether a non-technical founder can trust this delivery without reading code',
    description:
      'Computes the Zero-Code Trust score from attached evidence. 100 means product-behavior validation, 75 means explanation-only, 50 means code/diff review still needed, lower means technical interpretation or manual repair remains.',
    inputSchema: {
      evidence: z
        .array(
          z.object({
            kind: EvidenceKindSchema,
            status: EvidenceStatusSchema,
            summary: z.string().optional(),
            artifactPaths: z.array(z.string()).optional(),
          }),
        )
        .min(1),
      founderCanValidateByProduct: z.boolean().optional(),
      requiresCodeReview: z.boolean().optional(),
      requiresTechnicalDecision: z.boolean().optional(),
      requiresManualFix: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const rawScore = Math.max(
        ...a.evidence.map((entry) =>
          verifiedEvidenceWeight(entry.kind, entry.status, entry.artifactPaths),
        ),
      );
      const failed = a.evidence.filter((entry) => entry.status === 'failed');
      const productProven = hasVerifiedProductProof(a.evidence);
      let score = rawScore;
      // founderCanValidateByProduct can only REALISE 100 when a verified product-proof
      // artifact backs it — the agent cannot self-assert PRODUCT_VALIDATABLE. Without a
      // verified artifact the flag is ignored (unproven ≡ negative).
      if (a.founderCanValidateByProduct && productProven) score = Math.max(score, 100);
      if (a.requiresCodeReview) score = Math.min(score, 50);
      if (a.requiresTechnicalDecision) score = Math.min(score, 25);
      if (a.requiresManualFix) score = 0;
      if (failed.length > 0) score = Math.min(score, 40);
      const verdict =
        score >= 100
          ? 'PRODUCT_VALIDATABLE'
          : score >= 75
            ? 'EXPLANATION_VALIDATABLE'
            : score >= 50
              ? 'CODE_REVIEW_STILL_NEEDED'
              : score > 0
                ? 'TECHNICAL_HELP_STILL_NEEDED'
                : 'MANUAL_FIX_REQUIRED';
      const flagNote =
        a.founderCanValidateByProduct && !productProven
          ? ' founderCanValidateByProduct ignorado: nenhuma evidencia de produto verificada por artefato.'
          : '';
      const summaryForHuman = `Zero-Code Trust ${score}/100: ${verdict}. ${failed.length > 0 ? `${failed.length} evidencia(s) falharam.` : 'Sem falha explicita nas evidencias anexadas.'}${flagNote}`;
      return ok({ ok: true, summaryForHuman, summary: summaryForHuman, score, verdict, failed, productProven });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'behavior_receipt',
  {
    title: 'Generate a founder-facing behavior receipt',
    description:
      'Turns validation artifacts into a no-code receipt: what changed in the product, where to click/call, what was proven, and what remains unproven. This is the product-facing closeout for an atomic delivery.',
    inputSchema: {
      productBehavior: z.string().min(1),
      changedFiles: z.array(z.string()).optional(),
      validation: z
        .array(
          z.object({
            kind: EvidenceKindSchema,
            status: EvidenceStatusSchema,
            command: z.string().optional(),
            summary: z.string().optional(),
            artifactPaths: z.array(z.string()).optional(),
          }),
        )
        .min(1),
      clickPath: z.array(z.string()).optional(),
      notProven: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
    },
  },
  async (a) => {
    try {
      const trust = Math.max(
        ...a.validation.map((entry) =>
          verifiedEvidenceWeight(entry.kind, entry.status, entry.artifactPaths),
        ),
      );
      const failing = a.validation.filter((entry) => entry.status === 'failed');
      // productProof requires VERIFIED product evidence (an artifact on disk), not a
      // self-reported passed status — so a receipt cannot claim 100 from a bare
      // "api passed". unproven ≡ negative.
      const productProof = a.validation.some((entry) =>
        productEvidenceVerified(entry.kind, entry.status, entry.artifactPaths),
      );
      const score =
        failing.length > 0
          ? Math.min(trust, 40)
          : productProof && a.clickPath?.length
            ? 100
            : trust;
      const summaryForHuman =
        `O que mudou: ${a.productBehavior}\n` +
        `Como validar: ${a.clickPath && a.clickPath.length > 0 ? a.clickPath.join(' -> ') : 'usar os artefatos de validacao anexados'}\n` +
        `Prova: ${a.validation.map((entry) => `${entry.kind}:${entry.status}`).join(', ')}\n` +
        `Nao provado: ${a.notProven && a.notProven.length > 0 ? a.notProven.join('; ') : 'nenhum item declarado'}\n` +
        `Zero-Code Trust: ${score}/100`;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        productBehavior: a.productBehavior,
        changedFiles: a.changedFiles ?? [],
        validation: a.validation,
        clickPath: a.clickPath ?? [],
        notProven: a.notProven ?? [],
        risks: a.risks ?? [],
        zeroCodeTrust: score,
        productProof,
        failing,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'truth_receipt',
  {
    title: 'Classify delivery claims as real, partial, stub, fake, blocked, or unproven',
    description:
      'Anti-facade receipt. Each claim must carry evidence. Runtime/API/DB/browser/provider evidence can become REAL; tests/builds are PARTIAL; mocks/stubs cannot be sold as product behavior.',
    inputSchema: {
      claims: z
        .array(
          z.object({
            claim: z.string().min(1),
            evidenceKind: EvidenceKindSchema,
            status: EvidenceStatusSchema,
            artifactPaths: z.array(z.string()).optional(),
            externalBlocker: z.string().optional(),
            // The unforgeable REAL token. A runtime_probe claim is only honoured as
            // REAL when this id was MINTED by a real green gate run via atomic_prove
            // (verified against the in-process gate-run registry). A fabricated or
            // hand-typed runtime_probe carries no valid id and is REFUSED below.
            gateRunId: z.string().optional(),
          }),
        )
        .min(1),
    },
  },
  async (a) => {
    try {
      const classified = a.claims.map((claim) => {
        // unproven ≡ negative. A REAL verdict over a product-behavior kind demands
        // VERIFIABLE evidence: a runtime_probe needs a gate-minted gateRunId (the
        // unforgeable token from a real green atomic_prove run); every other real kind
        // needs an artifactPath that exists on disk. A self-reported status is never
        // proof, so an unverified real-kind claim is downgraded to UNPROVEN and
        // REFUSED-as-REAL with a reason — the receipt can no longer be tricked into
        // selling REAL on a fabrication (probe id OR existing artifact, nothing less).
        const isProbe = claim.evidenceKind === 'runtime_probe';
        const verified = isProbe
          ? isGateBackedRealProbe(claim.gateRunId)
          : artifactExists(claim.artifactPaths);
        const truth = classifyTruth(
          claim.evidenceKind,
          claim.status,
          Boolean(claim.externalBlocker),
          verified,
        );
        const downgraded =
          isRealKind(claim.evidenceKind) &&
          claim.status === 'passed' &&
          !claim.externalBlocker &&
          truth !== 'REAL';
        if (downgraded) {
          return {
            ...claim,
            truth,
            refused: true,
            refusalReason: isProbe
              ? 'runtime_probe REFUSED as REAL: no valid gateRunId from a real green gate run ' +
                '(use atomic_prove to mint one). A hand-supplied runtime_probe cannot be sold as REAL.'
              : `${claim.evidenceKind} REFUSED as REAL: no existing artifactPath to verify the claim. ` +
                'Attach a real, non-empty artifact (response/log/screenshot) or downgrade the claim. ' +
                'A self-reported status is not proof.',
          };
        }
        return { ...claim, truth, refused: false as const };
      });
      const blocking = classified.filter((claim) => claim.truth !== 'REAL');
      const refused = classified.filter((claim) => claim.refused === true);
      const refusalNote =
        refused.length > 0
          ? ` ${refused.length} runtime_probe(s) RECUSADA(s) por falta de gateRunId de gate real (use atomic_prove).`
          : '';
      const summaryForHuman =
        (blocking.length === 0
          ? `Todas as ${classified.length} alegacoes tem prova de comportamento real.`
          : `${blocking.length}/${classified.length} alegacao(oes) ainda nao sao REAL: ${blocking.map((claim) => `${claim.claim}=${claim.truth}`).join('; ')}`) +
        refusalNote;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        claims: classified,
        blocking,
        refused,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_prove',
  {
    title: 'Run a real gate against a directive and mint a gate-sourced runtime_probe',
    description:
      'GATE-SOURCED TRUTH. Writes `directive` (e.g. a // @model … or // @probe-convergence … or a // @liveness call-site) into a THROWAWAY probe file through the atomicWrite byte-floor, runs the DYNAMIC gate set against it (apply→run→revert byte-exact), and maps the verdict into a receipt evidence item. On GREEN it MINTS an unforgeable gateRunId — the ONLY token truth_receipt will accept as a REAL runtime_probe. A failed/unjudged run mints nothing. This is what makes the REAL tier of a receipt impossible to fabricate by hand.',
    inputSchema: {
      claim: z.string().min(1),
      directive: z
        .string()
        .min(1)
        .describe(
          'a self-driving gate directive, e.g. "// @model id=ctr init=\'[0]\' next=\'(s)=>s<3?[s+1]:[]\' invariant=\'(s)=>s<=3\' cap=16"',
        ),
    },
  },
  async (a) => {
    try {
      const result = await runProveDirective({ claim: a.claim, directive: a.directive });
      return ok({
        ok: true,
        summaryForHuman: result.summaryForHuman,
        summary: result.summaryForHuman,
        evidence: result.evidence,
        gateRunId: result.evidence.gateRunId ?? null,
        run: result.run,
        minted: result.record !== null,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_seal',
  {
    title: 'Export or verify a proof-carrying Atomic receipt seal',
    description:
      'Creates a canonical tamper-evident envelope for a truth/behavior/proof receipt. If gateRunId is supplied it must be minted by this live process via atomic_prove. The seal can be verified independently by hash; if ATOMIC_SEAL_KEY is configured it also carries an HMAC issuer signature.',
    inputSchema: {
      mode: z.enum(['create', 'verify']).optional(),
      subject: z.string().optional(),
      receipt: z.record(z.string(), z.unknown()).optional(),
      gateRunId: z.string().optional(),
      artifactPaths: z.array(z.string()).optional(),
      exportPath: z.string().optional(),
      seal: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async (a) => {
    try {
      const mode = a.mode ?? 'create';
      if (mode === 'verify') {
        if (!a.seal) return fail('atomic_seal verify requires a seal envelope.');
        const verification = verifyAtomicSealEnvelope(a.seal);
        const summaryForHuman = verification.sealValid
          ? 'Atomic seal verified: canonical hash matches and signature policy is satisfied.'
          : 'Atomic seal verification failed: hash/signature does not match the envelope.';
        return ok({ ok: true, summaryForHuman, summary: summaryForHuman, ...verification });
      }
      const created = createAtomicSeal({ subject: a.subject, receipt: a.receipt, gateRunId: a.gateRunId, artifactPaths: a.artifactPaths, exportPath: a.exportPath });
      return ok({ ok: true, summary: created.summaryForHuman, ...created });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'continuity_status',
  {
    title: 'Read the current product/atomic continuity state',
    description:
      'Summarizes progress docs, workboard, locks, PULSE certificate, runtime evidence, and the next honest action. Use at the start of a session so continuation comes from verified repo state, not chat memory.',
    inputSchema: {},
  },
  async () => {
    try {
      const progress = readTextOptional('docs/ai/ATOMIC_EDIT_PROGRESS.md');
      const workboard = readTextOptional('docs/ai/ATOMIC_EDIT_WORKBOARD.md');
      const cert =
        readJsonOptional<Record<string, unknown>>('PULSE_CERTIFICATE.json') ??
        readJsonOptional<Record<string, unknown>>('.pulse/current/PULSE_CERTIFICATE.json');
      const runtime = readJsonOptional<Record<string, unknown>>(
        '.pulse/current/PULSE_RUNTIME_EVIDENCE.json',
      );
      const gates =
        cert && typeof cert.gates === 'object' && cert.gates !== null
          ? (cert.gates as Record<string, unknown>)
          : {};
      const runtimePass = gates.runtimePass as Record<string, unknown> | undefined;
      const pulseStatus = typeof cert?.status === 'string' ? cert.status : 'unknown';
      const score = typeof cert?.score === 'number' ? cert.score : null;
      const runtimeSummary =
        typeof runtime?.summary === 'string' ? runtime.summary : 'runtime evidence missing';
      const nextAction =
        pulseStatus === 'CERTIFIED'
          ? 'usar o principio em trabalho de produto; nao reconstruir tooling sem regressao objetiva'
          : runtimePass?.status === 'fail'
            ? 'corrigir ou anexar evidencia runtime observada antes de declarar producao'
            : 'atacar o proximo gate PULSE vermelho com evidencia de produto';
      const summaryForHuman =
        `Continuidade: PULSE=${pulseStatus}${score === null ? '' : ` score=${score}`}. ` +
        `Runtime: ${runtimeSummary}. Locks ativos: ${listLocks().length}. Proxima acao: ${nextAction}.`;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        progressPresent: Boolean(progress),
        workboardPresent: Boolean(workboard),
        pulseStatus,
        pulseScore: score,
        runtimeSummary,
        runtimePass: runtimePass ?? null,
        locks: listLocks(),
        nextAction,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_lock_acquire',
  {
    title: 'Acquire a POSIX mkdir front lock',
    description:
      'Claims a product/agent front by atomically creating .atomic-edit-locks/<frontId>/ via mkdir. If it already exists, acquisition fails. This is the real anti-TOCTOU primitive for multi-agent work.',
    inputSchema: {
      frontId: z.string().min(1),
      owner: z.string().min(1),
      objective: z.string().min(1),
      allowedFiles: z.array(z.string()).optional(),
      blockedFiles: z.array(z.string()).optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
    },
  },
  async (a) => {
    try {
      fs.mkdirSync(lockRoot(), { recursive: true });
      const dir = lockDir(a.frontId);
      fs.mkdirSync(dir);
      const now = new Date().toISOString();
      const record = {
        frontId: safeLockId(a.frontId),
        owner: a.owner,
        objective: a.objective,
        startedAt: now,
        heartbeatAt: now,
        allowedFiles: a.allowedFiles ?? [],
        blockedFiles: a.blockedFiles ?? [],
        acceptanceCriteria: a.acceptanceCriteria ?? [],
        status: 'claimed',
      };
      atomicWrite(lockFile(a.frontId), JSON.stringify(record, null, 2));
      const summaryForHuman = `Lock adquirido: ${a.frontId} por ${a.owner}. Frente valida para trabalho atomico.`;
      return ok({ ok: true, summaryForHuman, summary: summaryForHuman, lock: record });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_lock_status',
  {
    title: 'List active atomic front locks',
    description: 'Lists .atomic-edit-locks fronts and their owner/objective/heartbeat metadata.',
    inputSchema: {},
  },
  async () => {
    try {
      const locks = listLocks();
      const summaryForHuman = `Locks ativos: ${locks.length}`;
      return ok({ ok: true, summaryForHuman, summary: summaryForHuman, locks });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_lock_release',
  {
    title: 'Release an atomic front lock',
    description:
      'Releases a lock only when the owner matches, unless force=true is supplied for coordinator orphan recovery. Only paths under .atomic-edit-locks/<frontId>/ are removable.',
    inputSchema: {
      frontId: z.string().min(1),
      owner: z.string().min(1),
      force: z.boolean().optional(),
      reason: z.string().optional(),
    },
  },
  async (a) => {
    try {
      const dir = lockDir(a.frontId);
      const current = readLockRecord(safeLockId(a.frontId));
      if (!fs.existsSync(dir)) return ok({ ok: true, changed: false, note: 'lock already absent' });
      if (!a.force && current?.owner !== a.owner) {
        return fail(
          `lock owned by ${String(current?.owner ?? 'unknown')}; release refused for ${a.owner}`,
        );
      }
      fs.rmSync(dir, { recursive: true, force: false });
      const summaryForHuman = `Lock liberado: ${a.frontId}${a.reason ? ` (${a.reason})` : ''}.`;
      return ok({ ok: true, changed: true, summaryForHuman, summary: summaryForHuman });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
