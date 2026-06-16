/**
 * Splits an array into chunks of the given size.
 *
 * The last chunk may be smaller than `size` if the array length is not
 * evenly divisible.
 *
 * @param arr  The array to split.
 * @param size The maximum size of each chunk. Must be >= 1.
 * @returns    An array of chunks.
 * @throws     If `size` is less than 1.
 *
 * @example
 * chunkArray([1, 2, 3, 4, 5], 2)    // => [[1, 2], [3, 4], [5]]
 * chunkArray(['a', 'b', 'c'], 3)     // => [['a', 'b', 'c']]
 * chunkArray([], 5)                   // => []
 */
export function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  if (size < 1) {
    throw new Error(`chunkArray: size must be >= 1, got ${size}`);
  }

  if (arr.length === 0) {
    return [];
  }

  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
