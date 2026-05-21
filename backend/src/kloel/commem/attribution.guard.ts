import { Injectable } from '@nestjs/common';
import type {
  AttributionGuardResult,
  AttributionViolation,
  MemoryProjection,
  ExportedCapsule,
  AggregatedLedgerEntry,
  Narrative,
  ValueQuantification,
} from './commem.types';

@Injectable()
export class AttributionGuard {
  public validateProjections(
    projections: readonly MemoryProjection[],
    expectedWorkspaceId: string,
  ): AttributionGuardResult {
    const violations: AttributionViolation[] = [];
    let crossRefs = 0;

    for (const proj of projections) {
      if (proj.workspaceId !== expectedWorkspaceId) {
        violations.push({
          field: 'projection.workspaceId',
          reason: `Projection has workspaceId "${proj.workspaceId}" but expected "${expectedWorkspaceId}"`,
          leakedWorkspaceId: proj.workspaceId,
        });
        crossRefs++;
      }

      for (const item of proj.items) {
        if (item.sourceEventId.startsWith('evt_') && item.id.includes('mem_')) {
          continue;
        }
        if (!item.sourceEventId || !item.id) {
          violations.push({
            field: 'projection.items',
            reason: `Item missing required identifiers in projection for workspace "${expectedWorkspaceId}"`,
          });
        }
      }
    }

    return {
      workspaceId: expectedWorkspaceId,
      passed: violations.length === 0,
      violations,
      crossWorkspaceReferences: crossRefs,
    };
  }

  public validateCapsule(
    capsule: ExportedCapsule,
    expectedWorkspaceId: string,
  ): AttributionGuardResult {
    const violations: AttributionViolation[] = [];

    if (capsule.workspaceId !== expectedWorkspaceId) {
      violations.push({
        field: 'capsule.workspaceId',
        reason: `Capsule workspaceId "${capsule.workspaceId}" does not match expected "${expectedWorkspaceId}"`,
        leakedWorkspaceId: capsule.workspaceId,
      });
    }

    const projResult = this.validateProjections(
      capsule.projections,
      expectedWorkspaceId,
    );

    return {
      workspaceId: expectedWorkspaceId,
      passed: violations.length === 0 && projResult.passed,
      violations: [...violations, ...projResult.violations],
      crossWorkspaceReferences: violations.length + projResult.crossWorkspaceReferences,
    };
  }

  public validateLedger(
    entries: readonly AggregatedLedgerEntry[],
    expectedWorkspaceId: string,
  ): AttributionGuardResult {
    const violations: AttributionViolation[] = [];
    let crossRefs = 0;

    for (const entry of entries) {
      if (entry.workspaceId !== expectedWorkspaceId) {
        violations.push({
          field: 'ledger.workspaceId',
          reason: `Ledger entry has workspaceId "${entry.workspaceId}" but expected "${expectedWorkspaceId}"`,
          leakedWorkspaceId: entry.workspaceId,
        });
        crossRefs++;
      }
    }

    return {
      workspaceId: expectedWorkspaceId,
      passed: violations.length === 0,
      violations,
      crossWorkspaceReferences: crossRefs,
    };
  }

  public validateNarrative(
    narrative: Narrative,
    expectedWorkspaceId: string,
  ): AttributionGuardResult {
    const violations: AttributionViolation[] = [];

    if (narrative.workspaceId !== expectedWorkspaceId) {
      violations.push({
        field: 'narrative.workspaceId',
        reason: `Narrative workspaceId "${narrative.workspaceId}" does not match expected "${expectedWorkspaceId}"`,
        leakedWorkspaceId: narrative.workspaceId,
      });
    }

    return {
      workspaceId: expectedWorkspaceId,
      passed: violations.length === 0,
      violations,
      crossWorkspaceReferences: violations.length,
    };
  }

  public validateQuantification(
    quant: ValueQuantification,
    expectedWorkspaceId: string,
  ): AttributionGuardResult {
    const violations: AttributionViolation[] = [];

    if (quant.workspaceId !== expectedWorkspaceId) {
      violations.push({
        field: 'quantification.workspaceId',
        reason: `Quantification workspaceId "${quant.workspaceId}" does not match expected "${expectedWorkspaceId}"`,
        leakedWorkspaceId: quant.workspaceId,
      });
    }

    return {
      workspaceId: expectedWorkspaceId,
      passed: violations.length === 0,
      violations,
      crossWorkspaceReferences: violations.length,
    };
  }
}
