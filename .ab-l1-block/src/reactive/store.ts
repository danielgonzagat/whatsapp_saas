import type {
  Action,
  Listener,
  Middleware,
  Selector,
  StateUpdater,
  StoreConfig,
  Subscription,
} from './types.js';

export class ReactiveStore<
  S extends Record<string, unknown>,
  A extends string = string,
> {
  #state: S;
  #initial: S;
  #listeners: Set<Listener<S>> = new Set();
  #batching = false;
  #pending: (() => void)[] = [];
  #middlewares: Middleware<S, A>[] = [];

  constructor(config: StoreConfig<S>) {
    this.#initial = config.initial;
    this.#state = config.initial;
  }

  getState(): S {
    return this.#state;
  }

  setState(updater: StateUpdater<S>): void {
    const prev = this.#state;
    const next =
      typeof updater === 'function'
        ? (updater as (prev: S) => S)(prev)
        : updater;

    if (JSON.stringify(next) === JSON.stringify(prev)) return;

    this.#state = next;
    this.#notify(next, prev);
  }

  subscribe(listener: Listener<S>): Subscription;
  subscribe<U>(selector: Selector<S, U>, listener: Listener<U>): Subscription;
  subscribe<U>(
    selOrListener: Selector<S, U> | Listener<S>,
    listener?: Listener<U>,
  ): Subscription {
    if (typeof selOrListener === 'function' && listener === undefined) {
      const fn = selOrListener as Listener<S>;
      this.#listeners.add(fn);
      return {
        unsubscribe: () => {
          this.#listeners.delete(fn);
        },
      };
    }

    const selector = selOrListener as Selector<S, U>;
    const fn = listener as Listener<U>;
    let prevSlice = selector(this.#state);

    const wrapped: Listener<S> = (state) => {
      const nextSlice = selector(state);
      if (nextSlice === prevSlice) return;
      fn(nextSlice, prevSlice);
      prevSlice = nextSlice;
    };

    this.#listeners.add(wrapped);
    return {
      unsubscribe: () => {
        this.#listeners.delete(wrapped);
      },
    };
  }

  batch(fn: () => void): void {
    this.#batching = true;
    try {
      fn();
    } finally {
      this.#batching = false;
      for (const apply of this.#pending) {
        apply();
      }
      this.#pending = [];
    }
  }

  dispatch(action: Action<A>): S {
    const prev = this.#state;

    if (this.#middlewares.length === 0) {
      this.#notify(this.#state, prev);
      return this.#state;
    }

    let index = this.#middlewares.length;
    const run = (act: Action<A>): S => {
      if (index === 0) {
        this.#notify(this.#state, prev);
        return this.#state;
      }
      const mw = this.#middlewares[--index];
      return mw(this.#state, act, (nextAct) => run(nextAct));
    };

    return run(action);
  }

  use(middleware: Middleware<S, A>): () => void {
    this.#middlewares.push(middleware);
    return () => {
      const idx = this.#middlewares.indexOf(middleware);
      if (idx !== -1) this.#middlewares.splice(idx, 1);
    };
  }

  reset(): void {
    this.#state = this.#initial;
  }

  #notify(state: S, prev: S): void {
    if (this.#batching) {
      this.#pending = [() => this.#notifyNow(state, prev)];
      return;
    }
    this.#notifyNow(state, prev);
  }

  #notifyNow(state: S, prev: S): void {
    for (const listener of this.#listeners) {
      listener(state, prev);
    }
  }
}
