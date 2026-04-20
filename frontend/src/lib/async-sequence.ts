/** For each sequential. */
export async function forEachSequential<T>(
  items: Iterable<T>,
  callback: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const list = (Array.isArray(items) ? [...items] : Array.from(items as Iterable<T>)) as T[];

  const run = async (index: number): Promise<void> => {
    if (index >= list.length) {
      return;
    }
    await callback(list[index], index);
    await run(index + 1);
  };

  await run(0);
}

/** Find first sequential. */
export async function findFirstSequential<T, R>(
  items: Iterable<T>,
  callback: (item: T, index: number) => Promise<R | null | undefined | false>,
): Promise<R | undefined> {
  const list = (Array.isArray(items) ? [...items] : Array.from(items as Iterable<T>)) as T[];

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

/** Read stream sequential. */
export async function readStreamSequential<T extends { done: boolean }>(
  read: () => Promise<T>,
  callback: (result: T) => Promise<boolean | void> | boolean | void,
): Promise<void> {
  const run = async (): Promise<void> => {
    const result = await read();
    if (result.done) {
      return;
    }
    const shouldStop = await callback(result);
    if (shouldStop) {
      return;
    }
    await run();
  };

  await run();
}
