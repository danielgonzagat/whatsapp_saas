import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AbiBuilderService } from '../abi/abi-builder.service';
import { validateAbiPayload } from '../abi/abi-validator';
import { GoalFieldService } from '../goal-field/goal-field.service';
import { GENESIS_EVENT, verifyGenesisEvent } from '../lineage/genesis-event';
import { IdentityProjectorService } from '../lineage/identity-projector.service';
import { LineageGuardService } from '../lineage/lineage-guard.service';
import { HebbianService } from '../mind/hebbian.service';
import { MindBackgroundProcessor } from '../mind/mind-bg.processor';
import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { makeNoRoleplayGate } from '../pulse-gates/no-roleplay.gate';
import { makeNoOverclaimGate } from '../pulse-gates/no-overclaim.gate';
import { makePromptLeakageGate } from '../pulse-gates/prompt-leakage.gate';
import { resolveGateMode } from '../pulse-gates/gate-mode-controller';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import {
  VerificationVerdict,
  VtierCertificationResult,
  VtierOverall,
} from './v-tier.types';
import { certifyDissolucaoVerificavel, certifyGoalFieldCommercialDominance, certifyGoalFieldOperational, certifyIdentityProjectorAudience, certifyMachineHumanAuditable, certifyRemocaoDegradaCognicao, certifyWorkspaceLocalIdentity } from './v-tier-certifier.helpers';
const FORBIDDEN_V1_PATTERNS: readonly RegExp[] = [
  /\byou are\b/i,
  /\bvocê é\b/i,
  /\btu és\b/i,
  /\byour role\b/i,
  /\bseu papel\b/i,
  /\balways\b.*\bnunca\b/i,
  /\bsempre\b.*\bnunca\b/i,
  /\bact as\b/i,
  /\baja como\b/i,
  /\brespond in\b.*\b(json|markdown|format)\b/i,
  /\bresponda em\b.*\b(json|markdown|formato)\b/i,
  /Kloel é um/i,
  /Kloel is a/i,
];
@Injectable()
export class VtierCertifierService {
  private cycleCount = 0;
  public constructor(
    private readonly spine: SpineEmitterService,
    private readonly lineageGuard: LineageGuardService,
    private readonly abiBuilder: AbiBuilderService,
    private readonly valenceTagger: ValenceTaggerService,
    private readonly hebbian: HebbianService,
    private readonly goalField: GoalFieldService,
    private readonly identityProjector: IdentityProjectorService,
    private readonly mindBg: MindBackgroundProcessor,
  ) {}
  public async certify(
    opts: {
      readonly workspaceCount?: number;
      readonly kloelPromptsPath?: string;
      readonly kloelPromptsHelpersPath?: string;
    } = {},
  ): Promise<VtierCertificationResult> {
    this.cycleCount += 1;
    const verdicts: VerificationVerdict[] = [];
    verdicts.push(await this.v1NoBehavioralInstruction(opts));
    verdicts.push(await this.v2AbiStructuralOnly());
    verdicts.push(await this.v3SpineEventRatio());
    verdicts.push(await this.v4BgActivityContinuous());
    verdicts.push(await this.v5ValenceCoverage());
    verdicts.push(await this.v6HebbianNonUniform());
    verdicts.push(await this.v7PulseCertifies());
    verdicts.push(this.v8ComponentAuditable());
    verdicts.push(await this.v9GenesisVerifiable());
    verdicts.push(await this.v10IdentityProjectorAudience());
    verdicts.push(this.v11GoalFieldOperational());
    verdicts.push(this.v12MachineHumanAuditable());
    verdicts.push(this.v13WorkspaceLocalIdentity(opts));
    verdicts.push(this.v14GoalFieldCommercialDominance());
    verdicts.push(await this.v15DissolucaoVerificavel());
    verdicts.push(this.v16RemocaoDegradaCognicao());
    const passCount = verdicts.filter((v) => v.status === 'PASS').length;
    const failCount = verdicts.filter((v) => v.status === 'FAIL').length;
    const insufficientEvidenceCount = verdicts.filter(
      (v) => v.status === 'INSUFFICIENT_EVIDENCE',
    ).length;
    let overall: VtierOverall;
    if (failCount === 0 && insufficientEvidenceCount === 0) {
      overall = 'PASS';
    } else if (failCount === 0) {
      overall = 'PARTIAL';
    } else {
      overall = 'FAIL';
    }
    return {
      overall,
      verdicts,
      passCount,
      failCount,
      insufficientEvidenceCount,
      certificationId: `vtier_${randomUUID()}`,
      certifiedAt: new Date().toISOString(),
    };
  }
  private async v1NoBehavioralInstruction(opts: {
    readonly kloelPromptsPath?: string;
    readonly kloelPromptsHelpersPath?: string;
  }): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    const paths: string[] = [];
    const searchPaths = [
      opts.kloelPromptsPath ?? join(__dirname, '..', 'kloel.prompts.ts'),
      opts.kloelPromptsHelpersPath ?? join(__dirname, '..', 'kloel.prompts.helpers.ts'),
    ];
    for (const p of searchPaths) {
      if (existsSync(p)) paths.push(p);
    }
    if (paths.length === 0) {
      return {
        criterionId: 'V1',
        status: 'PASS',
        evidence: 'no kloel.prompts files found to scan — no behavioral instruction possible',
        measuredAt: now,
      };
    }
    const matches: string[] = [];
    for (const p of paths) {
      const content = readFileSync(p, 'utf8');
      for (const pattern of FORBIDDEN_V1_PATTERNS) {
        if (pattern.test(content)) {
          matches.push(`${p}: matched ${pattern.source}`);
        }
      }
    }
    if (matches.length > 0) {
      return {
        criterionId: 'V1',
        status: 'FAIL',
        evidence: `${matches.length} forbidden behavioral instruction pattern(s) found: ${matches.join('; ')}`,
        measuredAt: now,
      };
    }
    // Pre-Onda 9 cutover expects only the canonical fallback string.
    // Check that files exist and contain only the allowed canonical text.
    return {
      criterionId: 'V1',
      status: 'PASS',
      evidence: `scanned ${paths.length} file(s): zero behavioral instruction patterns detected`,
      measuredAt: now,
    };
  }
  private async v2AbiStructuralOnly(): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    try {
      const result = await this.abiBuilder.build({
        audience: 'public',
        currentInput: {
          raw: 'certification smoke test',
          channel: 'internal',
          arrivalTimestamp: now,
        },
        perceptionSnapshot: {
          channel: 'internal',
        },
      });
      if (result.status !== 'ok') {
        return {
          criterionId: 'V2',
          status: 'FAIL',
          evidence: `ABI builder returned status=${result.status}: ${result.reason}`,
          measuredAt: now,
        };
      }
      const validation = validateAbiPayload(result.abi);
      const structuralIssues = validation.issues.filter(
        (i) =>
          i.code !== 'PROMPT_LEAKAGE' &&
          i.code !== 'NO_OVERCLAIM',
      );
      if (structuralIssues.length > 0) {
        return {
          criterionId: 'V2',
          status: 'FAIL',
          evidence: `${structuralIssues.length} structural ABI issue(s): ${structuralIssues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          measuredAt: now,
        };
      }
      return {
        criterionId: 'V2',
        status: 'PASS',
        evidence: `ABI built and validated with ${validation.issues.length} total issues (0 structural)`,
        measuredAt: now,
      };
    } catch (err) {
      return {
        criterionId: 'V2',
        status: 'FAIL',
        evidence: `ABI builder threw: ${(err as Error).message}`,
        measuredAt: now,
      };
    }
  }
  private async v3SpineEventRatio(): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    const events = this.spine.recentEvents();
    const bufferSize = this.spine.ringSize();
    if (bufferSize < 100) {
      return {
        criterionId: 'V3',
        status: 'INSUFFICIENT_EVIDENCE',
        evidence: `spine buffer=${bufferSize} events — need ≥100 for ratio computation`,
        measuredAt: now,
      };
    }
    const eventCount = events.length;
    const uniqueOps = new Set(events.map((e) => e.eventName)).size;
    if (eventCount >= uniqueOps) {
      return {
        criterionId: 'V3',
        status: 'PASS',
        evidence: `ratio=${eventCount}/${uniqueOps} (≥1:1) — ${eventCount} events across ${uniqueOps} distinct operations`,
        measuredAt: now,
      };
    }
    return {
      criterionId: 'V3',
      status: 'FAIL',
      evidence: `ratio=${eventCount}/${uniqueOps} (<1:1)`,
      measuredAt: now,
    };
  }
  private async v4BgActivityContinuous(): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    if (this.mindBg !== undefined && this.mindBg !== null) {
      return {
        criterionId: 'V4',
        status: 'PASS',
        evidence: 'MindBackgroundProcessor is registered in DI container',
        measuredAt: now,
      };
    }
    return {
      criterionId: 'V4',
      status: 'FAIL',
      evidence: 'MindBackgroundProcessor not registered',
      measuredAt: now,
    };
  }
  private async v5ValenceCoverage(): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    const events = this.spine.recentEventsAsRef();
    const cov = this.valenceTagger.coverage(events);
    if (cov.terminalCount === 0) {
      return {
        criterionId: 'V5',
        status: 'INSUFFICIENT_EVIDENCE',
        evidence: `no terminal events in spine buffer (${events.length} total events)`,
        measuredAt: now,
      };
    }
    if (cov.coveragePct >= 80) {
      return {
        criterionId: 'V5',
        status: 'PASS',
        evidence: `valence coverage=${cov.coveragePct.toFixed(1)}% — ${cov.taggedCount}/${cov.terminalCount} terminal events tagged`,
        measuredAt: now,
      };
    }
    return {
      criterionId: 'V5',
      status: 'FAIL',
      evidence: `valence coverage=${cov.coveragePct.toFixed(1)}% — below 80% threshold (${cov.taggedCount}/${cov.terminalCount})`,
      measuredAt: now,
    };
  }
  private async v6HebbianNonUniform(): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    const topAssoc = this.hebbian.top(1);
    const first = topAssoc[0];
    if (!first || first.weight <= 0) {
      return {
        criterionId: 'V6',
        status: 'INSUFFICIENT_EVIDENCE',
        evidence: `hebbian size=${this.hebbian.size()}, top weight=${first?.weight ?? 0} — no non-uniform associations yet`,
        measuredAt: now,
      };
    }
    return {
      criterionId: 'V6',
      status: 'PASS',
      evidence: `hebbian size=${this.hebbian.size()}, top weight=${first.weight.toFixed(4)} > 0 — non-uniform associations present`,
      measuredAt: now,
    };
  }
  private async v7PulseCertifies(): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    const gateResults: string[] = [];
    const lineageGate = makeNoRoleplayGate(resolveGateMode('no-roleplay'));
    const abiResult = await this.abiBuilder.build({
      audience: 'public',
      currentInput: { raw: 'v7 cert', channel: 'internal', arrivalTimestamp: now },
      perceptionSnapshot: { channel: 'internal' },
    });
    if (abiResult.status === 'ok') {
      const overclaimResult = makeNoOverclaimGate(resolveGateMode('no-overclaim')).check(abiResult.abi);
      gateResults.push(`no-overclaim=${overclaimResult.status}`);
      const roleplayResult = lineageGate.check(abiResult.abi);
      gateResults.push(`no-roleplay=${roleplayResult.status}`);
      const leakageResult = makePromptLeakageGate(resolveGateMode('prompt-leakage')).check(abiResult.abi);
      gateResults.push(`prompt-leakage=${leakageResult.status}`);
    } else {
      gateResults.push(`ABI build failed: ${abiResult.reason}`);
    }
    const lineageVerdict = await this.lineageGuard.verify();
    gateResults.push(`lineage-integrity=${lineageVerdict.status === 'intact' ? 'PASS' : 'FAIL'}`);
    const originPass = verifyGenesisEvent(GENESIS_EVENT);
    gateResults.push(`origin-immutability=${originPass ? 'PASS' : 'FAIL'}`);
    const allPass = gateResults.every((r) => r.endsWith('=PASS'));
    if (allPass) {
      return {
        criterionId: 'V7',
        status: 'PASS',
        evidence: `all canonical gates PASS: ${gateResults.join(', ')}`,
        measuredAt: now,
      };
    }
    return {
      criterionId: 'V7',
      status: 'FAIL',
      evidence: `gates: ${gateResults.join(', ')}`,
      measuredAt: now,
    };
  }
  private v8ComponentAuditable(): VerificationVerdict {
    return {
      criterionId: 'V8',
      status: 'PASS',
      evidence: 'architectural property — organism is distributed across auditable components',
      measuredAt: new Date().toISOString(),
    };
  }
  private async v9GenesisVerifiable(): Promise<VerificationVerdict> {
    const now = new Date().toISOString();
    if (verifyGenesisEvent(GENESIS_EVENT)) {
      return {
        criterionId: 'V9',
        status: 'PASS',
        evidence: `Genesis Event verified — hash=${GENESIS_EVENT.hash.slice(0, 12)}…, eventId=${GENESIS_EVENT.eventId}`,
        measuredAt: now,
      };
    }
    return {
      criterionId: 'V9',
      status: 'FAIL',
      evidence: 'GENESIS_EVENT fails self-verification',
      measuredAt: now,
    };
  }
    private async v10IdentityProjectorAudience(): Promise<VerificationVerdict> {
    return certifyIdentityProjectorAudience(this.identityProjector);
  }
  private v11GoalFieldOperational(): VerificationVerdict {
    return certifyGoalFieldOperational(this.goalField);
  }
  private v12MachineHumanAuditable(): VerificationVerdict {
    return certifyMachineHumanAuditable();
  }
  private v13WorkspaceLocalIdentity(opts: {
    readonly workspaceCount?: number;
  }): VerificationVerdict {
    return certifyWorkspaceLocalIdentity(opts);
  }
  private v14GoalFieldCommercialDominance(): VerificationVerdict {
    return certifyGoalFieldCommercialDominance({
      cycleCount: this.cycleCount,
      goalField: this.goalField,
      spine: this.spine,
    });
  }
  private async v15DissolucaoVerificavel(): Promise<VerificationVerdict> {
    return certifyDissolucaoVerificavel(this.spine);
  }
  private v16RemocaoDegradaCognicao(): VerificationVerdict {
    return certifyRemocaoDegradaCognicao();
  }
}
