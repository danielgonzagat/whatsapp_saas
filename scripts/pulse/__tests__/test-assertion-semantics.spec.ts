import { describe, expect, it } from 'vitest';
import { analyzeTestAssertionSemantics } from '../test-assertion-semantics';

describe('analyzeTestAssertionSemantics', () => {
  it('detects Vitest expect and Node assert semantics', () => {
    const result = analyzeTestAssertionSemantics(`
      import { expect, it } from 'vitest';
      import assert from 'node:assert/strict';

      it('checks both assertion styles', () => {
        expect({ ok: true }).toEqual({ ok: true });
        assert.strictEqual(1, 1);
      });
    `);

    expect(result.hasAssertions).toBe(true);
    expect(result.assertions.map((assertion) => assertion.kind)).toEqual(
      expect.arrayContaining(['direct_expect', 'node_assert']),
    );
  });

  it('detects Playwright expect and snapshot matchers', () => {
    const result = analyzeTestAssertionSemantics(`
      import { expect, test } from '@playwright/test';

      test('captures visual state', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
        await expect(page).toHaveScreenshot('save-button.png');
      });
    `);

    expect(result.hasAssertions).toBe(true);
    expect(result.assertions.map((assertion) => assertion.kind)).toEqual(
      expect.arrayContaining(['playwright_expect', 'snapshot']),
    );
  });

  it('detects should chains', () => {
    const result = analyzeTestAssertionSemantics(`
      import should from 'should';

      it('checks fluent should assertions', () => {
        response.status.should.equal(200);
      });
    `);

    expect(result.hasAssertions).toBe(true);
    expect(result.assertions.map((assertion) => assertion.kind)).toContain('should_chain');
  });

  it('treats declared custom assertion helpers as assertions', () => {
    const result = analyzeTestAssertionSemantics(`
      import { expect, it } from 'vitest';

      function provesWorkspaceIsolation(result: { visibleWorkspaceIds: string[] }) {
        expect(result.visibleWorkspaceIds).toEqual(['workspace-a']);
      }

      it('does not get classified as no-assertion when helper owns the assertion', () => {
        const result = { visibleWorkspaceIds: ['workspace-a'] };
        provesWorkspaceIsolation(result);
      });
    `);

    expect(result.hasAssertions).toBe(true);
    expect(result.customAssertionHelpers).toContain('provesWorkspaceIsolation');
    expect(result.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'custom_helper',
          callee: 'provesWorkspaceIsolation',
        }),
      ]),
    );
  });

  it('treats imported custom assertion helpers as assertions', () => {
    const result = analyzeTestAssertionSemantics(`
      import { it } from 'vitest';
      import { verifyLedgerInvariant } from './ledger-test-helpers';

      it('uses a shared assertion helper', () => {
        verifyLedgerInvariant({ debitCents: 100, creditCents: 100 });
      });
    `);

    expect(result.hasAssertions).toBe(true);
    expect(result.customAssertionHelpers).toContain('verifyLedgerInvariant');
    expect(result.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'custom_helper',
          callee: 'verifyLedgerInvariant',
        }),
      ]),
    );
  });

  it('detects database assertion helper calls', () => {
    const result = analyzeTestAssertionSemantics(`
      import { it } from 'vitest';
      import { assertDatabaseHas } from './db-assertions';

      it('checks persistence evidence', async () => {
        await assertDatabaseHas('Order', { status: 'PAID' });
      });
    `);

    expect(result.hasAssertions).toBe(true);
    expect(result.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'db_assertion_helper',
          callee: 'assertDatabaseHas',
        }),
      ]),
    );
  });

  it('keeps files without assertion semantics classified as no assertion', () => {
    const result = analyzeTestAssertionSemantics(`
      import { it } from 'vitest';

      it('only executes code', () => {
        const value = new Set(['workspace-a']);
        value.add('workspace-b');
      });
    `);

    expect(result.hasAssertions).toBe(false);
    expect(result.assertions).toEqual([]);
  });
});
