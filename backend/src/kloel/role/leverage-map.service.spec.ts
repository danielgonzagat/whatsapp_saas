import { Test } from '@nestjs/testing';
import {
  LeverageMapService,
  getLeverageMap,
  getLeversForRole,
  isLeverInControlRadius,
} from './leverage-map.service';
import type { Role } from './types';

describe('LeverageMapService (NestJS class)', () => {
  let service: LeverageMapService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [LeverageMapService],
    }).compile();

    service = module.get(LeverageMapService);
  });

  it('getMap returns levers for produtor', () => {
    const map = service.getMap('produtor');
    expect(map.role).toBe('produtor');
    expect(map.levers.length).toBeGreaterThan(0);
    expect(map.directLevers.length).toBeGreaterThan(0);
  });

  it('getLevers returns only direct lever names', () => {
    const levers = service.getLevers('closer');
    expect(levers.length).toBeGreaterThan(0);
    expect(levers).toContain('call_lead');
    expect(levers).toContain('handle_objection');
  });

  it('isInRadius returns true for direct lever', () => {
    expect(service.isInRadius('produtor', 'adjust_price')).toBe(true);
  });

  it('isInRadius returns true for influenced lever', () => {
    expect(service.isInRadius('produtor', 'run_ads_campaign')).toBe(true);
  });

  it('isInRadius returns false for lever outside radius', () => {
    expect(service.isInRadius('produtor', 'call_lead')).toBe(false);
  });

  it('getAllMaps returns maps for all roles', () => {
    const maps = service.getAllMaps();
    expect(maps.size).toBeGreaterThanOrEqual(5);
    expect(maps.has('produtor')).toBe(true);
    expect(maps.has('closer')).toBe(true);
  });
});

describe('getLeverageMap (standalone function)', () => {
  it('returns map for a defined role', () => {
    const map = getLeverageMap('agencia');
    expect(map.role).toBe('agencia');
    expect(map.directLevers).toContain('add_client');
  });

  it('returns empty map for unknown role', () => {
    const map = getLeverageMap('unknown_role' as Role);
    expect(map.role).toBe('unknown_role');
    expect(map.levers).toEqual([]);
    expect(map.directLevers).toEqual([]);
    expect(map.influencedLevers).toEqual([]);
  });
});

describe('getLeversForRole (standalone function)', () => {
  it('returns direct levers for gestor', () => {
    const levers = getLeversForRole('gestor');
    expect(levers).toContain('hire_team');
    expect(levers).not.toContain('delegate_decision');
  });
});

describe('isLeverInControlRadius (standalone function)', () => {
  it('includes influenced levers in control radius', () => {
    expect(isLeverInControlRadius('creator', 'build_owned_audience')).toBe(true);
  });

  it('excludes levers from other roles', () => {
    expect(isLeverInControlRadius('creator', 'call_lead')).toBe(false);
  });
});
