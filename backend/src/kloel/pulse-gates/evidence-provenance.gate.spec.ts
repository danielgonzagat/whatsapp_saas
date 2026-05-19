import {
  makeEvidenceProvenanceGate,
  EvidenceProvenanceInput,
  ProvenanceLike,
} from './evidence-provenance.gate';

function completeProv(): ProvenanceLike {
  return {
    origin: 'whatsapp-webhook-handler',
    source: 'production',
    processor: 'whatsapp-handler',
    processorVersion: '1.4.2',
    schemaVersion: '1.0.0',
    environment: 'prod',
  };
}

function validInput(overrides?: Partial<EvidenceProvenanceInput>): EvidenceProvenanceInput {
  return {
    eventId: 'evt_001',
    eventName: 'commerce.lead.replied',
    provenance: completeProv(),
    ...overrides,
  };
}

describe('evidence-provenance gate — complete detection surface (>= 15 scenarios)', () => {
  const gate = makeEvidenceProvenanceGate('hard_fail');

  it('1. PASS — complete provenance with origin, processor, semver, environment', () => {
    expect(gate.check(validInput()).status).toBe('PASS');
  });

  it('2. FAIL — provenance object missing entirely', () => {
    const v = gate.check({ eventId: 'e1', eventName: 'x' });
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.provenance', detail: 'provenance object missing' }),
      ]),
    );
  });

  it('3. FAIL — provenance is null (not an object)', () => {
    const v = gate.check({ eventId: 'e1', eventName: 'x', provenance: null as ProvenanceLike });
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance' }),
    );
  });

  it('4. FAIL — provenance.origin missing (empty string)', () => {
    const v = gate.check(
      validInput({ provenance: { ...completeProv(), origin: '' } }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.origin' }),
    );
  });

  it('5. FAIL — provenance.origin missing (undefined)', () => {
    const prov = { ...completeProv() };
    delete (prov as Record<string, unknown>).origin;
    const v = gate.check(validInput({ provenance: prov }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.origin' }),
    );
  });

  it('6. FAIL — provenance.source is invalid (not synthetic|production)', () => {
    const v = gate.check(
      validInput({ provenance: { ...completeProv(), source: 'magic' } }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.source' }),
    );
  });

  it('7. FAIL — provenance.source is missing (undefined)', () => {
    const prov = { ...completeProv() };
    delete (prov as Record<string, unknown>).source;
    const v = gate.check(validInput({ provenance: prov }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.source' }),
    );
  });

  it('8. FAIL — synthetic evidence in production pipeline without syntheticOverride flag', () => {
    const v = gate.check(
      validInput({
        provenance: { ...completeProv(), source: 'synthetic' },
        pipelineMode: 'production',
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({
        path: '$.provenance.source',
        detail: expect.stringMatching(/syntheticOverride/),
      }),
    );
  });

  it('9. PASS — synthetic evidence in production pipeline with explicit syntheticOverride flag', () => {
    const v = gate.check(
      validInput({
        provenance: { ...completeProv(), source: 'synthetic', syntheticOverride: true },
        pipelineMode: 'production',
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('10. PASS — synthetic evidence in synthetic pipeline (no flag needed)', () => {
    const v = gate.check(
      validInput({
        provenance: { ...completeProv(), source: 'synthetic' },
        pipelineMode: 'synthetic',
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('11. FAIL — no processor and no workerId (both missing)', () => {
    const prov = { ...completeProv() };
    delete (prov as Record<string, unknown>).processor;
    const v = gate.check(validInput({ provenance: { ...prov, workerId: undefined } }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({
        path: '$.provenance.processor',
        detail: expect.stringMatching(/processor or workerId/),
      }),
    );
  });

  it('12. PASS — workerId present without processor (at least one required)', () => {
    const prov = { ...completeProv() };
    delete (prov as Record<string, unknown>).processor;
    const v = gate.check(
      validInput({ provenance: { ...prov, workerId: 'worker-007' } }),
    );
    expect(v.status).toBe('PASS');
  });

  it('13. FAIL — processorVersion is not semver (free-form string)', () => {
    const v = gate.check(
      validInput({ provenance: { ...completeProv(), processorVersion: 'latest' } }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.processorVersion' }),
    );
  });

  it('14. FAIL — schemaVersion is not semver ("v1")', () => {
    const v = gate.check(
      validInput({ provenance: { ...completeProv(), schemaVersion: 'v1' } }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.schemaVersion' }),
    );
  });

  it('15. FAIL — environment is invalid (not dev|staging|prod)', () => {
    const v = gate.check(
      validInput({ provenance: { ...completeProv(), environment: 'space' } }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.environment' }),
    );
  });

  it('16. FAIL — environment is missing (undefined)', () => {
    const prov = { ...completeProv() };
    delete (prov as Record<string, unknown>).environment;
    const v = gate.check(validInput({ provenance: prov }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.provenance.environment' }),
    );
  });

  it('17. FAIL — inferred event without causedBy or upstreamRef (no proof anchor)', () => {
    const v = gate.check(
      validInput({
        truthMode: 'inferred',
        causedBy: undefined,
        provenance: { ...completeProv(), upstreamRef: undefined },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({
        path: '$.causedBy',
        detail: expect.stringMatching(/proof anchor/),
      }),
    );
  });

  it('18. PASS — inferred event with causedBy proof anchor', () => {
    const v = gate.check(
      validInput({
        truthMode: 'inferred',
        causedBy: ['evt_001'],
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('19. PASS — inferred event with upstreamRef as proof anchor', () => {
    const v = gate.check(
      validInput({
        truthMode: 'inferred',
        provenance: { ...completeProv(), upstreamRef: 'ext_abc123' },
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('20. FAIL — projected event without causedBy or upstreamRef (no proof anchor)', () => {
    const v = gate.check(
      validInput({
        truthMode: 'projected',
        causedBy: undefined,
        provenance: { ...completeProv(), upstreamRef: undefined },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toContainEqual(
      expect.objectContaining({ path: '$.causedBy' }),
    );
  });

  it('21. PASS — projected event with causedBy proof anchor', () => {
    const v = gate.check(
      validInput({
        truthMode: 'projected',
        causedBy: ['evt_001', 'evt_002'],
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('22. PASS — observed event without causedBy is valid (no proof anchor required)', () => {
    const v = gate.check(
      validInput({
        truthMode: 'observed',
        causedBy: undefined,
        provenance: { ...completeProv(), upstreamRef: undefined },
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('23. PASS — event without truthMode does not require proof anchor', () => {
    const input = validInput();
    delete (input as Record<string, unknown>).truthMode;
    delete (input as Record<string, unknown>).causedBy;
    const v = gate.check(input);
    expect(v.status).toBe('PASS');
  });

  it('24. FAIL — multiple violations reported together', () => {
    const prov = { ...completeProv() };
    delete (prov as Record<string, unknown>).origin;
    delete (prov as Record<string, unknown>).processor;
    const v = gate.check(
      validInput({
        provenance: { ...prov, schemaVersion: 'bad', workerId: undefined },
        truthMode: 'inferred',
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toHaveLength(4);
  });

  it('25. PASS — complete provenance in dev environment with workerId', () => {
    const v = gate.check(
      validInput({
        provenance: {
          origin: 'test-fixture-generator',
          source: 'synthetic',
          processor: 'fixture-builder',
          workerId: 'worker-001',
          processorVersion: '0.1.0',
          schemaVersion: '2.0.0',
          environment: 'dev',
        },
        pipelineMode: 'synthetic',
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('26. PASS — provenance with origin, processor, workerId, upstreamRef, all fields present', () => {
    const v = gate.check(
      validInput({
        provenance: {
          origin: 'stripe-webhook-handler',
          source: 'production',
          processor: 'payment-webhook',
          workerId: 'payment-worker-01',
          processorVersion: '2.1.3',
          schemaVersion: '1.0.0',
          environment: 'prod',
          upstreamRef: 'evt_1NbI2c2eZvKYlo2C',
        },
        truthMode: 'observed',
      }),
    );
    expect(v.status).toBe('PASS');
  });
});

describe('evidence-provenance gate — mode is hard_fail by default', () => {
  it('default mode is hard_fail', () => {
    const g = makeEvidenceProvenanceGate();
    expect(g.mode).toBe('hard_fail');
  });

  it('can be overridden to log_only for calibration', () => {
    const g = makeEvidenceProvenanceGate('log_only');
    expect(g.mode).toBe('log_only');
  });
});
