export async function forEachSequential<T>(
  items: Iterable<T>,
  callback: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const list = Array.isArray(items) ? [...items] : Array.from(items);

  const run = async (index: number): Promise<void> => {
    if (index >= list.length) {
      return;
    }
    await callback(list[index], index);
    await run(index + 1);
  };

  await run(0);
}

export async function findFirstSequential<T, R>(
  items: Iterable<T>,
  callback: (item: T, index: number) => Promise<R | null | undefined | false>,
): Promise<R | undefined> {
  const list = Array.isArray(items) ? [...items] : Array.from(items);

  const run = async (index: number): Promise<R | undefined> => {
    if (index >= list.length) {
      return undefined;
    }
    const result = await callback(list[index], index);
    if (result) {
      return result;
    }
    return run(index + 1);
  };

  return run(0);
}

export async function pollUntil<T>(options: {
  timeoutMs: number;
  intervalMs: number;
  read: () => Promise<T>;
  stop: (value: T) => boolean;
  sleep: (ms: number) => Promise<unknown>;
}): Promise<T> {
  const { timeoutMs, intervalMs, read, stop, sleep } = options;
  const startedAt = Date.now();

  const run = async (): Promise<T> => {
    const value = await read();
    if (stop(value)) {
      return value;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return value;
    }
    await sleep(intervalMs);
    return run();
  };

  return run();
}
