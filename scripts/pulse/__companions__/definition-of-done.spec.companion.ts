// ---------------------------------------------------------------------------
// evaluateBatch
// ---------------------------------------------------------------------------

describe('evaluateBatch', () => {
  it('returns an array with the same length as inputs', () => {
    const inputs = [makeInput({ id: 'cap-1' }), makeInput({ id: 'cap-2' })];
    const results = evaluateBatch(inputs);

    expect(results).toHaveLength(2);
  });

  it('preserves order of inputs in results', () => {
    const inputs = [
      makeInput({ id: 'cap-1' }),
      makeInput({ id: 'cap-2', hasPhantom: true }),
      makeInput({ id: 'cap-3' }),
    ];
    const results = evaluateBatch(inputs);

    expect(results[0].id).toBe('cap-1');
    expect(results[1].id).toBe('cap-2');
    expect(results[2].id).toBe('cap-3');
  });

  it('correctly evaluates each input independently', () => {
    const inputs = [
      makeInput({ id: 'good', codacyHighCount: 0 }),
      makeInput({ id: 'bad', codacyHighCount: 5 }),
    ];
    const results = evaluateBatch(inputs);

    expect(results[0].done).toBe(true);
    expect(results[1].done).toBe(false);
  });

  it('returns empty array for empty input', () => {
    expect(evaluateBatch([])).toEqual([]);
  });
});

