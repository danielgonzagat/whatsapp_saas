import { Test } from '@nestjs/testing';
import { IdentityProjectorService } from './identity-projector.service';
import { LineageGuardService } from './lineage-guard.service';
import {
  isPublicProjection,
  isTechnicalProjection,
  isOriginProjection,
  isInternalProjection,
  isCompromisedProjection,
} from './identity-projector.service';
import type {
  IdentityProjection,
  PublicProjection,
  TechnicalProjection,
  OriginProjection,
  InternalProjection,
  CompromisedProjection,
} from './identity-projector.service';

const mockGuard = { verify: jest.fn().mockResolvedValue({
  status: 'intact' as const,
  tailSequenceNumber: 42,
  tailHash: 'abc123',
  entryCount: 10,
  checkedAt: '2026-05-27T12:00:00.000Z',
}) };

describe('IdentityProjectorService', () => {
  let service: IdentityProjectorService;

  beforeEach(async () => {
    mockGuard.verify.mockClear();

    const module = await Test.createTestingModule({
      providers: [
        IdentityProjectorService,
        { provide: LineageGuardService, useValue: mockGuard },
      ],
    }).compile();

    service = module.get(IdentityProjectorService);
  });

  it('projects public audience with minimal fields', async () => {
    const result = await service.project({ audience: 'public' });

    expect(result.audience).toBe('public');
    expect((result as PublicProjection).canonicalName).toBe('Kloel');
    expect((result as PublicProjection).operationalAge.sinceGenesisDays).toBeGreaterThanOrEqual(0);
    expect((result as PublicProjection).lineageStatus).toBe('intact');
    expect((result as PublicProjection).truthMode).toBe('observed');
    expect('genesisEventId' in result).toBe(false);
  });

  it('projects technical audience with lineage metadata', async () => {
    const result = await service.project({
      audience: 'technical',
      capabilityIds: ['cap-1', 'cap-2'],
    });

    expect(result.audience).toBe('technical');
    const tech = result as TechnicalProjection;
    expect(tech.genesisEventId).toBeDefined();
    expect(tech.tailSequenceNumber).toBe(42);
    expect(tech.tailHash).toBe('abc123');
    expect(tech.capabilityIds).toEqual(['cap-1', 'cap-2']);
  });

  it('projects origin audience with full genesis payload when authorized', async () => {
    const auth = { grantedAt: '2026-05-27T12:00:00.000Z', grantedBy: 'auditor' };
    const result = await service.project({
      audience: 'origin',
      originAuthorization: auth,
    });

    expect(result.audience).toBe('origin');
    const origin = result as OriginProjection;
    expect(origin.etymology).toBeDefined();
    expect(origin.origin).toBeDefined();
    expect(origin.steward).toBeDefined();
    expect(origin.authorization).toEqual(auth);
  });

  it('returns compromised when origin requested without authorization', async () => {
    const result = await service.project({ audience: 'origin' });

    expect(result.audience).toBe('origin');
    const compromised = result as CompromisedProjection;
    expect(compromised.status).toBe('compromised');
    expect(compromised.reason).toContain('originAuthorization');
  });

  it('projects internal audience with entryCount', async () => {
    const result = await service.project({ audience: 'internal' });

    expect(result.audience).toBe('internal');
    const internal = result as InternalProjection;
    expect(internal.entryCount).toBe(10);
    expect(internal.etymology).toBeDefined();
  });

  it('returns compromised projection when lineage guard reports compromised', async () => {
    mockGuard.verify.mockResolvedValueOnce({
      status: 'compromised' as const,
      reason: 'hash mismatch detected',
      tailSequenceNumber: 0,
      tailHash: '',
      entryCount: 0,
      checkedAt: '2026-05-27T12:00:00.000Z',
    });

    const result = await service.project({ audience: 'public' });

    expect(result.audience).toBe('public');
    const compromised = result as CompromisedProjection;
    expect(compromised.status).toBe('compromised');
    expect(compromised.reason).toBe('hash mismatch detected');
  });

  it('computes sinceFirstWorkspaceDays from provided timestamp', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const result = await service.project({
      audience: 'public',
      firstWorkspaceActivatedAt: twoDaysAgo,
    });

    const pub = result as PublicProjection;
    expect(pub.operationalAge.sinceFirstWorkspaceDays).toBeGreaterThanOrEqual(1);
  });

  it('defaults sinceFirstWorkspaceDays to 0 when not provided', async () => {
    const result = await service.project({ audience: 'public' });

    const pub = result as PublicProjection;
    expect(pub.operationalAge.sinceFirstWorkspaceDays).toBe(0);
  });
});

describe('type-guard helpers', () => {
  const publicProj: IdentityProjection = {
    audience: 'public',
    canonicalName: 'Kloel',
    operationalAge: { sinceGenesisDays: 13, sinceFirstWorkspaceDays: 0 },
    lineageStatus: 'intact',
    truthMode: 'observed',
  };

  const compromisedProj: IdentityProjection = {
    audience: 'public',
    status: 'compromised',
    canonicalName: 'Kloel',
    reason: 'test',
    checkedAt: '2026-05-27T12:00:00.000Z',
  };

  it('isPublicProjection detects public projection', () => {
    expect(isPublicProjection(publicProj)).toBe(true);
    expect(isPublicProjection(compromisedProj)).toBe(false);
  });

  it('isCompromisedProjection detects compromised', () => {
    expect(isCompromisedProjection(compromisedProj)).toBe(true);
    expect(isCompromisedProjection(publicProj)).toBe(false);
  });

  it('isTechnicalProjection returns false for public', () => {
    expect(isTechnicalProjection(publicProj)).toBe(false);
  });

  it('isOriginProjection returns false for public', () => {
    expect(isOriginProjection(publicProj)).toBe(false);
  });

  it('isInternalProjection returns false for public', () => {
    expect(isInternalProjection(publicProj)).toBe(false);
  });
});
