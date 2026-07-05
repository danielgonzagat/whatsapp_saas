import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureFlagStore } from '../flags/index.js';
import type { FlagContext } from '../flags/types.js';

describe('FeatureFlagStore', () => {
  it('isEnabled returns false for unknown flag', () => {
    const store = new FeatureFlagStore();
    assert.strictEqual(store.isEnabled('nonexistent'), false);
  });

  it('setFlag and isEnabled with boolean default (no rules)', () => {
    const store = new FeatureFlagStore();
    store.setFlag('darkMode', true);
    assert.strictEqual(store.isEnabled('darkMode'), true);

    store.setFlag('darkMode', false);
    assert.strictEqual(store.isEnabled('darkMode'), false);
  });

  it('boolean rule type with true value matches', () => {
    const store = new FeatureFlagStore();
    store.setFlag('featureX', true, [
      { type: 'boolean', config: { value: true } },
    ]);
    assert.strictEqual(store.isEnabled('featureX'), true);
  });

  it('boolean rule type with false value does not match', () => {
    const store = new FeatureFlagStore();
    store.setFlag('featureX', true, [
      { type: 'boolean', config: { value: false } },
    ]);
    assert.strictEqual(store.isEnabled('featureX'), false);
  });

  it('percentage rollout: 0% excludes all users', () => {
    const store = new FeatureFlagStore();
    store.setFlag('p0', true, [
      { type: 'percentage', config: { percentage: 0 } },
    ]);
    assert.strictEqual(store.isEnabled('p0', { userId: 'user1' }), false);
    assert.strictEqual(store.isEnabled('p0', { userId: 'user2' }), false);
  });

  it('percentage rollout: 100% includes all users', () => {
    const store = new FeatureFlagStore();
    store.setFlag('p100', true, [
      { type: 'percentage', config: { percentage: 100 } },
    ]);
    assert.strictEqual(store.isEnabled('p100', { userId: 'anyone' }), true);
    assert.strictEqual(store.isEnabled('p100', { userId: 'else' }), true);
  });

  it('percentage rollout: 50% splits users', () => {
    const store = new FeatureFlagStore();
    store.setFlag('beta', true, [
      { type: 'percentage', config: { percentage: 50 } },
    ]);

    const results = new Set<boolean>();
    for (let i = 1; i <= 500; i++) {
      const ctx: FlagContext = { userId: `user${i}` };
      results.add(store.isEnabled('beta', ctx));
    }
    assert.strictEqual(results.has(true), true);
    assert.strictEqual(results.has(false), true);
  });

  it('percentage rollout: same user always gets same result', () => {
    const store = new FeatureFlagStore();
    store.setFlag('beta', true, [
      { type: 'percentage', config: { percentage: 50 } },
    ]);

    const ctx: FlagContext = { userId: 'consistent-user' };
    const first = store.isEnabled('beta', ctx);
    for (let i = 0; i < 20; i++) {
      assert.strictEqual(store.isEnabled('beta', ctx), first);
    }
  });

  it('user_target rule: matches by userId', () => {
    const store = new FeatureFlagStore();
    store.setFlag('vip', true, [
      { type: 'user_target', config: { userIds: ['alice', 'bob'] } },
    ]);

    assert.strictEqual(store.isEnabled('vip', { userId: 'alice' }), true);
    assert.strictEqual(store.isEnabled('vip', { userId: 'bob' }), true);
    assert.strictEqual(store.isEnabled('vip', { userId: 'charlie' }), false);
    assert.strictEqual(store.isEnabled('vip'), false);
  });

  it('user_target rule: matches by attributes', () => {
    const store = new FeatureFlagStore();
    store.setFlag('enterprise', true, [
      {
        type: 'user_target',
        config: { attributes: { plan: 'pro', region: 'us' } },
      },
    ]);

    assert.strictEqual(
      store.isEnabled('enterprise', { attributes: { plan: 'pro', region: 'us' } }),
      true,
    );
    assert.strictEqual(
      store.isEnabled('enterprise', { attributes: { plan: 'basic', region: 'us' } }),
      false,
    );
    assert.strictEqual(
      store.isEnabled('enterprise', { attributes: { plan: 'pro' } }),
      false,
    );
  });

  it('user_target rule: userId match takes priority over attributes', () => {
    const store = new FeatureFlagStore();
    store.setFlag('combo', true, [
      {
        type: 'user_target',
        config: { userIds: ['admin'], attributes: { role: 'admin' } },
      },
    ]);

    assert.strictEqual(store.isEnabled('combo', { userId: 'admin' }), true);
  });

  it('user_target rule: no context means no match', () => {
    const store = new FeatureFlagStore();
    store.setFlag('restricted', true, [
      { type: 'user_target', config: { userIds: ['alice'] } },
    ]);
    assert.strictEqual(store.isEnabled('restricted'), false);
  });

  it('enabled=false always returns false regardless of rules', () => {
    const store = new FeatureFlagStore();
    store.setFlag('off', false, [
      { type: 'boolean', config: { value: true } },
      { type: 'user_target', config: { userIds: ['alice'] } },
    ]);

    assert.strictEqual(store.isEnabled('off'), false);
    assert.strictEqual(store.isEnabled('off', { userId: 'alice' }), false);
  });

  it('getAllFlags returns all set flags', () => {
    const store = new FeatureFlagStore();
    store.setFlag('a', true);
    store.setFlag('b', false);
    store.setFlag('c', true);

    const all = store.getAllFlags();
    assert.strictEqual(all.length, 3);
    const names = all.map((f) => f.name).sort();
    assert.deepStrictEqual(names, ['a', 'b', 'c']);
  });

  it('getAllFlags returns empty array when no flags set', () => {
    const store = new FeatureFlagStore();
    assert.deepStrictEqual(store.getAllFlags(), []);
  });

  it('removeFlag deletes a flag', () => {
    const store = new FeatureFlagStore();
    store.setFlag('temp', true);
    assert.strictEqual(store.isEnabled('temp'), true);

    store.removeFlag('temp');
    assert.strictEqual(store.isEnabled('temp'), false);
    assert.strictEqual(store.getAllFlags().length, 0);
  });

  it('removeFlag on nonexistent flag is safe', () => {
    const store = new FeatureFlagStore();
    store.removeFlag('nonexistent');
    assert.strictEqual(store.getAllFlags().length, 0);
  });

  it('setFlag overrides existing flag', () => {
    const store = new FeatureFlagStore();
    store.setFlag('x', true);
    store.setFlag('x', false);
    assert.strictEqual(store.isEnabled('x'), false);
    assert.strictEqual(store.getAllFlags().length, 1);
  });

  it('setFlag with rules updates existing flag rules', () => {
    const store = new FeatureFlagStore();
    store.setFlag('x', true, [{ type: 'boolean', config: { value: true } }]);
    store.setFlag('x', true, [{ type: 'boolean', config: { value: false } }]);
    assert.strictEqual(store.isEnabled('x'), false);
  });

  it('getState reflects flag state', () => {
    const store = new FeatureFlagStore();
    store.setFlag('bg', true);

    const state = store.getState();
    assert.ok(state.flags['bg']);
    assert.strictEqual(state.flags['bg'].name, 'bg');
    assert.strictEqual(state.flags['bg'].enabled, true);
  });

  it('subscribe notifies on flag change', () => {
    const store = new FeatureFlagStore();
    let called = false;
    let capturedEnabled: boolean | undefined;

    store.subscribe((state) => {
      called = true;
      capturedEnabled = state.flags['homepageV2']?.enabled;
    });

    store.setFlag('homepageV2', true);
    assert.strictEqual(called, true);
    assert.strictEqual(capturedEnabled, true);
  });

  it('reset clears all flags', () => {
    const store = new FeatureFlagStore();
    store.setFlag('a', true);
    store.setFlag('b', true);
    assert.strictEqual(store.getAllFlags().length, 2);

    store.reset();
    assert.strictEqual(store.getAllFlags().length, 0);
  });

  it('batch updates notify only once', () => {
    const store = new FeatureFlagStore();
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.batch(() => {
      store.setFlag('a', true);
      store.setFlag('b', true);
      store.setFlag('c', true);
    });
    assert.strictEqual(calls, 1);
    assert.strictEqual(store.getAllFlags().length, 3);
  });

  it('unsubscribe stops notifications', () => {
    const store = new FeatureFlagStore();
    let count = 0;
    const { unsubscribe } = store.subscribe(() => {
      count++;
    });
    unsubscribe();
    store.setFlag('x', true);
    assert.strictEqual(count, 0);
  });
});
