import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: undefined,
    error: new Error('Cannot GET /landing/sales-flow'),
    isLoading: false,
  })),
}));

import { useSalesFlow } from './useSalesFlow';

describe('useSalesFlow', () => {
  it('uses the static public landing flow without requesting a missing backend endpoint', () => {
    const { result } = renderHook(() => useSalesFlow());

    expect(useSWR).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ch: 'wa', f: 'l', t: 'Oi, vi o anúncio!' }),
        expect.objectContaining({ ch: 'tt', f: '$', t: 'R$397 Pix' }),
      ]),
    );
  });
});
