import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReactiveStore } from '../reactive/index.js';
import type { StoreConfig, Middleware, Action } from '../reactive/types.js';

type CounterState = { count: number };
type CounterAction = 'INC' | 'DEC' | 'RESET';

function makeStore(initial = 0): ReactiveStore<CounterState, CounterAction> {
  return new ReactiveStore({ initial: { count: initial } });
}

describe('ReactiveStore', () => {
  it('getState returns initial state', () => {
    const store = makeStore(5);
    assert.deepStrictEqual(store.getState(), { count: 5 });
  });

  it('setState replaces state', () => {
    const store = makeStore();
    store.setState({ count: 10 });
    assert.deepStrictEqual(store.getState(), { count: 10 });
  });

  it('setState with updater function', () => {
    const store = makeStore(2);
    store.setState((prev) => ({ count: prev.count * 3 }));
    assert.deepStrictEqual(store.getState(), { count: 6 });
  });

  it('subscribe notifies on state change', () => {
    const store = makeStore();
    let called = false;
    store.subscribe(() => {
      called = true;
    });
    store.setState({ count: 1 });
    assert.strictEqual(called, true);
  });

  it('subscribe receives correct state and prev', () => {
    const store = makeStore(1);
    let captured: { state: CounterState; prev: CounterState } | null = null;
    store.subscribe((state, prev) => {
      captured = { state, prev };
    });
    store.setState({ count: 42 });
    assert.deepStrictEqual(captured, {
      state: { count: 42 },
      prev: { count: 1 },
    });
  });

  it('subscribe with selector only notifies when slice changes', () => {
    const store = new ReactiveStore({
      initial: { count: 0, name: 'a' },
    });
    let calls = 0;
    store.subscribe(
      (s) => s.count,
      () => {
        calls++;
      },
    );
    store.setState({ count: 0, name: 'b' });
    assert.strictEqual(calls, 0);
    store.setState({ count: 1, name: 'b' });
    assert.strictEqual(calls, 1);
  });

  it('selector receives correct slice values', () => {
    const store = new ReactiveStore({
      initial: { count: 10, name: 'x' },
    });
    let captured: { next: number; prev: number } | null = null;
    store.subscribe(
      (s) => s.count,
      (next, prev) => {
        captured = { next, prev };
      },
    );
    store.setState({ count: 20, name: 'x' });
    assert.deepStrictEqual(captured, { next: 20, prev: 10 });
  });

  it('unsubscribe stops notifications', () => {
    const store = makeStore();
    let count = 0;
    const { unsubscribe } = store.subscribe(() => {
      count++;
    });
    unsubscribe();
    store.setState({ count: 99 });
    assert.strictEqual(count, 0);
  });

  it('same-value setState does not notify', () => {
    const store = makeStore(7);
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.setState({ count: 7 });
    assert.strictEqual(calls, 0);
  });

  it('multiple subscribers all notified', () => {
    const store = makeStore();
    let a = 0;
    let b = 0;
    store.subscribe(() => {
      a++;
    });
    store.subscribe(() => {
      b++;
    });
    store.setState({ count: 1 });
    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });

  it('batch updates notify only once', () => {
    const store = makeStore();
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.batch(() => {
      store.setState({ count: 1 });
      store.setState({ count: 2 });
      store.setState({ count: 3 });
    });
    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(store.getState(), { count: 3 });
  });

  it('reset restores initial state', () => {
    const store = makeStore(10);
    store.setState({ count: 50 });
    store.reset();
    assert.deepStrictEqual(store.getState(), { count: 10 });
  });

  it('dispatch runs middleware chain', () => {
    const store = makeStore();
    let intercepted = false;
    const mw: Middleware<CounterState, CounterAction> = (state, action, next) => {
      intercepted = true;
      store.setState({ count: state.count + 1 });
      return store.getState();
    };
    store.use(mw);
    store.dispatch({ type: 'INC' });
    assert.strictEqual(intercepted, true);
    assert.deepStrictEqual(store.getState(), { count: 1 });
  });

  it('middleware receives action payload', () => {
    const store = makeStore();
    let capturedType = '';
    let capturedPayload: unknown;
    const mw: Middleware<CounterState, CounterAction> = (_, action, next) => {
      capturedType = action.type;
      capturedPayload = action.payload;
      return next(action);
    };
    store.use(mw);
    store.dispatch({ type: 'INC', payload: 5 });
    assert.strictEqual(capturedType, 'INC');
    assert.strictEqual(capturedPayload, 5);
  });

  it('middleware can modify state', () => {
    const store = makeStore(3);
    const logger: Middleware<CounterState, CounterAction> = (state, _, next) => {
      const result = next(_);
      store.setState({ count: result.count * 2 });
      return store.getState();
    };
    const increment: Middleware<CounterState, CounterAction> = (state, _, next) => {
      store.setState({ count: state.count + 1 });
      return store.getState();
    };
    store.use(increment);
    store.use(logger);
    store.dispatch({ type: 'INC' });
    assert.deepStrictEqual(store.getState(), { count: 8 });
  });

  it('unused middleware stops intercepting', () => {
    const store = makeStore();
    let calls = 0;
    const mw: Middleware<CounterState, CounterAction> = (_, __, next) => {
      calls++;
      return next(__);
    };
    const remove = store.use(mw);
    remove();
    store.dispatch({ type: 'INC' });
    assert.strictEqual(calls, 0);
  });

  it('independent stores do not interfere', () => {
    const storeA = makeStore(0);
    const storeB = makeStore(100);
    storeA.setState({ count: 42 });
    assert.deepStrictEqual(storeB.getState(), { count: 100 });
  });

  it('dispatch without middleware returns state', () => {
    const store = makeStore(7);
    const result = store.dispatch({ type: 'INC' } as any);
    assert.deepStrictEqual(result, { count: 7 });
  });
});
