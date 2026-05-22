import { describe, expect, it } from 'vitest';

import { getErrorMessage } from '../utils/error-message';

describe('getErrorMessage', () => {
  it('returns the message from Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(getErrorMessage('plain')).toBe('plain');
    expect(getErrorMessage(42)).toBe('42');
  });
});
