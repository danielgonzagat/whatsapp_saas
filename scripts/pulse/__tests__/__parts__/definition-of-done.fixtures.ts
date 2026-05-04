import type { StructuralRole } from '../../types.structural-roles';
import type {
  CapabilityDoneInput,
  CapabilityRoleEvidence,
  DoDEvidenceTruthMode,
} from '../../definition-of-done';

export function makeEvidence(
  role: StructuralRole,
  present: boolean,
  truthMode: DoDEvidenceTruthMode,
  evidencePath?: string,
): CapabilityRoleEvidence {
  return { role, present, truthMode, evidencePath };
}

export function makeInput(overrides: Partial<CapabilityDoneInput> = {}): CapabilityDoneInput {
  return {
    id: 'test-capability',
    kind: 'capability',
    requiredRoles: ['interface', 'api_surface', 'persistence'],
    evidence: [
      makeEvidence('interface', true, 'observed', 'frontend/src/pages/test.tsx'),
      makeEvidence('api_surface', true, 'observed', 'backend/src/test.controller.ts'),
      makeEvidence('persistence', true, 'observed', 'backend/src/test.service.ts'),
    ],
    codacyHighCount: 0,
    hasPhantom: false,
    hasLatentCritical: false,
    truthModeTarget: 'observed',
    ...overrides,
  };
}
