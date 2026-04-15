import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
  it('keeps non-conflicting classes', () => {
    expect(cn('text-sm', 'font-semibold')).toContain('text-sm');
    expect(cn('text-sm', 'font-semibold')).toContain('font-semibold');
  });
  it('accepts conditional values', () => {
    expect(cn('base', false && 'skip', 'add')).toBe('base add');
  });
});
