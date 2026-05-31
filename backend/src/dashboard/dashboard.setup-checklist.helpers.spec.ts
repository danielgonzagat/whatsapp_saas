import {
  buildSetupCheckpoints,
  readSetupChecklist,
  SETUP_CHECKPOINT_COPY,
} from './dashboard.setup-checklist.helpers';

describe('readSetupChecklist', () => {
  it('returns [] for non-array input', () => {
    expect(readSetupChecklist(null)).toEqual([]);
    expect(readSetupChecklist(undefined)).toEqual([]);
    expect(readSetupChecklist({ key: 'x', completed: true })).toEqual([]);
    expect(readSetupChecklist('abc')).toEqual([]);
  });

  it('drops malformed entries silently', () => {
    const input = [
      null,
      undefined,
      'string',
      { key: 'profile', completed: 'true' }, // completed not boolean
      { key: 42, completed: true }, // key not string
      [],
      { key: 'product', completed: false }, // valid
    ];
    expect(readSetupChecklist(input)).toEqual([{ key: 'product', completed: false }]);
  });

  it('preserves order and boolean state for well-formed entries', () => {
    const input = [
      { key: 'profile', completed: true },
      { key: 'channel', completed: false },
    ];
    expect(readSetupChecklist(input)).toEqual([
      { key: 'profile', completed: true },
      { key: 'channel', completed: false },
    ]);
  });
});

describe('buildSetupCheckpoints', () => {
  it('returns [] for empty checklist', () => {
    expect(buildSetupCheckpoints([])).toEqual([]);
  });

  it('uses known copy when key is registered', () => {
    const result = buildSetupCheckpoints([{ key: 'profile', completed: true }]);
    expect(result).toEqual([
      {
        id: 'setup-profile',
        label: SETUP_CHECKPOINT_COPY.profile.label,
        description: SETUP_CHECKPOINT_COPY.profile.description,
        active: true,
      },
    ]);
  });

  it('falls back to generic copy for unknown keys', () => {
    const result = buildSetupCheckpoints([{ key: 'unknown', completed: false }]);
    expect(result).toEqual([
      {
        id: 'setup-unknown',
        label: 'Setup: unknown',
        description: 'Item de setup persistido pelo onboarding inicial.',
        active: false,
      },
    ]);
  });

  it('reflects active flag from completed property', () => {
    const result = buildSetupCheckpoints([
      { key: 'profile', completed: true },
      { key: 'product', completed: false },
    ]);
    expect(result.map((c) => c.active)).toEqual([true, false]);
  });
});
