import {
  makeInternalKnowledgeLeakGuardGate,
  type InternalKnowledgeLeakInput,
  type SiblingClientDescriptor,
} from './internal-knowledge-leak-guard.gate';

/**
 * UTP-AGENCY-007 contract spec — internal-knowledge-leak-guard gate.
 *
 * 20 scenarios: 10 positive (PASS) + 10 negative (FAIL).
 *
 * Coverage:
 *   - Empty / no sibling clients
 *   - Completely unrelated payloads
 *   - Agency workspace isolation
 *   - Non-string payload leaves (numbers, booleans, null)
 *   - Name fragment false positive prevention (word boundary)
 *   - Short name word filtering (< 2 chars)
 *   - Sibling client name leak (flat and nested)
 *   - Sibling client ID leak (full UUID and token parts)
 *   - Sibling client identifier leak (email, phone, document)
 *   - Case-insensitive name matching
 *   - Multiple siblings leaking into same payload
 *   - Deeply nested arrays and objects
 *   - Normalized identifier matching across separators
 */

// ─── helpers ────────────────────────────────────────────────────────────

function gate() {
  return makeInternalKnowledgeLeakGuardGate('hard_fail');
}

function sibling(
  clientId: string,
  name: string,
  identifiers: string[] = [],
): SiblingClientDescriptor {
  return { clientId, name, identifiers };
}

function input(
  targetClientId: string,
  agencyWorkspaceId: string,
  contextPayload: unknown,
  siblings: SiblingClientDescriptor[],
): InternalKnowledgeLeakInput {
  return {
    targetClientId,
    agencyWorkspaceId,
    contextPayload,
    siblingClients: siblings,
  };
}

// ─── positive scenarios (10) ─────────────────────────────────────────────

describe('internal-knowledge-leak-guard gate — POSITIVE (PASS)', () => {
  it('PASS: empty sibling clients array', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'some payload text', []),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: completely unrelated context payload (flat string)', () => {
    const v = gate().check(
      input(
        'client-a',
        'ws-1',
        'This is a generic marketing message about shoes.',
        [sibling('client-b', 'Acme Corp', ['acme@example.com'])],
      ),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: completely unrelated nested payload', () => {
    const payload = {
      message: 'Welcome to the platform',
      metadata: { plan: 'pro', region: 'us-east' },
      tags: ['onboarding', 'trial'],
    };
    const v = gate().check(
      input('client-a', 'ws-1', payload, [
        sibling('client-b', 'Acme Corp', ['acme@example.com']),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: agency workspace isolation — payload unrelated to sibling data passes even though siblings exist', () => {
    const v = gate().check(
      input('client-a', 'ws-separate', 'Generic payload with no sibling references', [
        sibling('client-b', 'Acme Corp', ['acme@example.com']),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: non-string payload leaves (numbers, booleans, null) are ignored', () => {
    const payload = {
      count: 42,
      active: true,
      notes: null as unknown,
    };
    const v = gate().check(
      input('client-a', 'ws-1', payload, [
        sibling('client-b', 'Acme Corp', ['acme@example.com']),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: name fragment substring without word boundary does not leak', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'The word Pacific is in the text', [
        sibling('client-b', 'Acme Corp', []),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: short name word (< 2 chars) is filtered — single-letter name', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'The letter A appears here', [
        sibling('client-b', 'A', []),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: name with all words < 2 chars produces non-matching pattern', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'A B C', [
        sibling('client-b', 'A B', []),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: ID token part shorter than 6 chars is not indexed', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'The code e89b appears', [
        sibling('client-b', '123e4567-e89b-12d3-a456-426614174000', []),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: empty context payload (empty string)', () => {
    const v = gate().check(
      input('client-a', 'ws-1', '', [
        sibling('client-b', 'Acme Corp', ['acme@example.com']),
      ]),
    );
    expect(v.status).toBe('PASS');
  });
});

// ─── negative scenarios (10) ─────────────────────────────────────────────

describe('internal-knowledge-leak-guard gate — NEGATIVE (FAIL)', () => {
  it('FAIL: sibling client name leaked in flat string context', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'Acme Corp is our partner', [
        sibling('client-b', 'Acme Corp', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.reason).toContain('internal knowledge leak');
    expect(v.evidence).toHaveLength(1);
    expect(v.evidence![0].detail).toContain('sibling client name leaked');
    expect(v.evidence![0].path).toBe('$');
  });

  it('FAIL: sibling client ID leaked (full UUID in payload)', () => {
    const leakedId = '550e8400-e29b-41d4-a716-446655440000';
    const v = gate().check(
      input('client-a', 'ws-1', `Reference ID: ${leakedId}`, [
        sibling(leakedId, 'Some Client', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].detail).toContain('sibling client ID token leaked');
  });

  it('FAIL: sibling client identifier (email) leaked', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'Contact: acme@example.com for more info', [
        sibling('client-b', 'Acme Corp', ['acme@example.com']),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].detail).toContain('sibling client identifier leaked');
  });

  it('FAIL: sibling client identifier (phone) leaked', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'Call +55 11 99999-0000', [
        sibling('client-b', 'Acme Corp', ['+55 11 99999-0000']),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].detail).toContain('sibling client identifier leaked');
  });

  it('FAIL: sibling client document number leaked', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'CNPJ: 12.345.678/0001-90', [
        sibling('client-b', 'Acme Corp', ['12.345.678/0001-90']),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].detail).toContain('sibling client identifier leaked');
  });

  it('FAIL: name leak in nested object field', () => {
    const payload = {
      summary: 'Order confirmed',
      details: { vendor: 'Acme Corp', status: 'shipped' },
    };
    const v = gate().check(
      input('client-a', 'ws-1', payload, [
        sibling('client-b', 'Acme Corp', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].path).toBe('$.details.vendor');
  });

  it('FAIL: name leak inside array element', () => {
    const payload = {
      messages: ['Hello', 'Acme Corp says hi', 'Goodbye'],
    };
    const v = gate().check(
      input('client-a', 'ws-1', payload, [
        sibling('client-b', 'Acme Corp', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].path).toBe('$.messages[1]');
  });

  it('FAIL: case-insensitive name match', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'ACME CORP is mentioned here', [
        sibling('client-b', 'Acme Corp', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
  });

  it('FAIL: multiple siblings leaking into same payload (multiple evidence entries)', () => {
    const payload = {
      text: 'Acme Corp and Globex Corp are partners',
    };
    const v = gate().check(
      input('client-a', 'ws-1', payload, [
        sibling('client-b', 'Acme Corp', []),
        sibling('client-c', 'Globex Corp', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBeGreaterThanOrEqual(2);
  });

  it('FAIL: deeply nested sibling data in cross-referenced arrays', () => {
    const payload = {
      transactions: [
        {
          id: 'tx-1',
          parties: [{ name: 'Third Party' }, { name: 'Acme Corp' }],
        },
      ],
    };
    const v = gate().check(
      input('client-a', 'ws-1', payload, [
        sibling('client-b', 'Acme Corp', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].path).toBe('$.transactions[0].parties[1].name');
  });
});

// ─── edge-case scenarios ─────────────────────────────────────────────────

describe('internal-knowledge-leak-guard gate — EDGE CASES', () => {
  it('normalizes identifiers by removing separators (dots, hyphens, spaces) before comparison', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'acmelatamengenharia', [
        sibling('client-b', 'Acme Corp', ['acme.latam.engenharia']),
      ]),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].detail).toContain('sibling client identifier leaked');
  });

  it('FAIL: ID token part >= 6 chars from dashed UUID leaks', () => {
    const g = makeInternalKnowledgeLeakGuardGate('hard_fail');
    const inputObj: InternalKnowledgeLeakInput = {
      targetClientId: 'client-a',
      agencyWorkspaceId: 'ws-1',
      contextPayload: 'The key 123e4567 is present',
      siblingClients: [
        { clientId: '123e4567-e89b-12d3-a456-426614174000', name: 'Sibling B', identifiers: [] },
      ],
    };
    const v = g.check(inputObj);
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0].detail).toContain('sibling client ID token leaked');
  });

  it('FAIL: sibling name with special regex chars is escaped properly and matches', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'Company (Test) Inc', [
        sibling('client-b', 'Company (Test) Inc', []),
      ]),
    );
    expect(v.status).toBe('FAIL');
  });

  it('PASS: sibling name with special regex chars in different context does not false-positive', () => {
    const v = gate().check(
      input('client-a', 'ws-1', 'Just a (parenthetical) remark', [
        sibling('client-b', 'Company (Test) Inc', []),
      ]),
    );
    expect(v.status).toBe('PASS');
  });

  it('PASS: large sibling list with clean payload still passes', () => {
    const manySiblings = Array.from({ length: 20 }, (_, i) =>
      sibling(`client-${i}`, `Client Name ${i}`, [`email${i}@test.com`]),
    );
    const v = gate().check(
      input('main-client', 'ws-1', 'Generic content with no references', manySiblings),
    );
    expect(v.status).toBe('PASS');
  });
});
