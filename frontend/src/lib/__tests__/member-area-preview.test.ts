import { describe, expect, it } from 'vitest';
import { buildMemberAreaPreviewPath } from '../member-area-preview';

describe('buildMemberAreaPreviewPath', () => {
  it('builds an internal preview path for valid member area ids', () => {
    expect(buildMemberAreaPreviewPath('area_123-abc')).toBe(
      '/produtos/area-membros/preview/area_123-abc',
    );
  });

  it('trims supported ids before building the path', () => {
    expect(buildMemberAreaPreviewPath('  area123  ')).toBe(
      '/produtos/area-membros/preview/area123',
    );
  });

  it('rejects ids that could break out of the path segment', () => {
    expect(buildMemberAreaPreviewPath('../admin')).toBeNull();
    expect(buildMemberAreaPreviewPath('javascript:alert(1)')).toBeNull();
    expect(buildMemberAreaPreviewPath('<svg/onload=alert(1)>')).toBeNull();
  });
});
