import * as path from 'path';

import { synthesizeDiagnosticFromBreaks } from '../legacy-break-adapter';
import { synthesizeProofPlan } from '../proof-synthesizer';
import { buildFindingEventSurface } from '../finding-event-surface';
import { normalizeCanonicalArtifactValue } from '../artifacts.queue';

function resolveInsideCanonicalDir(registry: PulseArtifactRegistry, fileName: string): string {
  const root = path.resolve(registry.canonicalDir);
  const resolved = path.resolve(root, fileName);
  const boundary = root + path.sep;
  if (resolved !== root && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside ${root}`);
  }
  return resolved;
}

function buildFindingValidationState(snapshot: PulseArtifactSnapshot): unknown {
  const eventSurface = buildFindingEventSurface(snapshot.health.breaks, 20);
  const generatedDiagnostic =
    snapshot.health.breaks.length > 0
      ? synthesizeDiagnosticFromBreaks(snapshot.health.breaks)
      : null;
  const proofPlan = generatedDiagnostic ? synthesizeProofPlan(generatedDiagnostic) : null;
  return normalizeCanonicalArtifactValue({
    artifact: 'PULSE_FINDING_VALIDATION_STATE',
    version: 1,
    generatedAt: snapshot.certification.timestamp,
    operationalIdentity: 'dynamic_finding_event',
    compatibility: {
      internalBreakTypeRetained: true,
      internalBreakTypeIsOperationalIdentity: false,
      parserSignalMustPassValidationBeforeBlocking: true,
      weakSignalCanBlock: false,
    },
    eventSurface,
    generatedDiagnostic,
    proofPlan,
    blockerPolicy: {
      weak_signal: 'needs_probe_only',
      inferred: 'needs_context_or_probe',
      confirmed_static: 'can_block_when_actionable',
      observed: 'can_block_when_actionable',
    },
  });
}

function buildHealth(snapshot: PulseArtifactSnapshot): string {
  return JSON.stringify(snapshot.health, null, 2);
}
