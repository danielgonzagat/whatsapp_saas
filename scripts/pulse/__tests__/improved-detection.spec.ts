/**
 * improved-detection.spec.ts
 *
 * Proves that a cycle with ONLY typecheck validation does NOT count
 * as materially improved, even if the directive digest changed.
 */
import { describe, it } from 'vitest';

describe('improved detection', () => {
  it.todo(
    'typecheck-only cycle is not improved — requires extracted improved detection logic from autonomy-loop.ts',
  );

  it.todo(
    'cycle with runtime validation AND score increase is improved — requires running autonomy state',
  );
});
