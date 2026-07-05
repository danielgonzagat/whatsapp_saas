import { chunkArray } from './chunk-array';

describe('chunkArray', () => {
  describe('basic splitting', () => {
    it('splits evenly divisible array', () => {
      const result = chunkArray([1, 2, 3, 4, 5, 6], 2);
      expect(result).toEqual([[1, 2], [3, 4], [5, 6]]);
    });

    it('splits with remainder in last chunk', () => {
      const result = chunkArray([1, 2, 3, 4, 5], 2);
      expect(result).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('handles chunk size equal to array length', () => {
      const result = chunkArray([1, 2, 3], 3);
      expect(result).toEqual([[1, 2, 3]]);
    });

    it('handles chunk size larger than array', () => {
      const result = chunkArray([1, 2], 10);
      expect(result).toEqual([[1, 2]]);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const result = chunkArray([], 3);
      expect(result).toEqual([]);
    });

    it('handles chunk size of 1', () => {
      const result = chunkArray([1, 2, 3], 1);
      expect(result).toEqual([[1], [2], [3]]);
    });

    it('throws for chunk size 0', () => {
      expect(() => chunkArray([1, 2], 0)).toThrow('size must be >= 1');
    });

    it('throws for negative chunk size', () => {
      expect(() => chunkArray([1, 2], -1)).toThrow('size must be >= 1');
    });
  });

  describe('type preservation', () => {
    it('preserves string type', () => {
      const result = chunkArray(['a', 'b', 'c', 'd'], 2);
      expect(result).toEqual([['a', 'b'], ['c', 'd']]);
      expect(result[0]).toEqual(['a', 'b']);
    });

    it('preserves object type', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = chunkArray(items, 2);
      expect(result).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
      expect(result[0]?.[0]?.id).toBe(1);
    });
  });

  describe('readonly input', () => {
    it('accepts readonly arrays', () => {
      const arr: readonly number[] = [1, 2, 3, 4];
      const result = chunkArray(arr, 2);
      expect(result).toEqual([[1, 2], [3, 4]]);
    });
  });
});
