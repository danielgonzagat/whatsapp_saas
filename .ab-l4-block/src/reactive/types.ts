export type StateUpdater<S> = S | ((prev: S) => S);

export type Selector<S, U> = (state: S) => U;

export type Subscription = {
  unsubscribe: () => void;
};

export type Listener<S> = (state: S, prev: S) => void;

export type Middleware<S, A extends string = string> = (
  state: S,
  action: Action<A>,
  next: (action: Action<A>) => S,
) => S;

export type Action<A extends string = string> = {
  type: A;
  payload?: unknown;
};

export type StoreConfig<S> = {
  initial: S;
};
