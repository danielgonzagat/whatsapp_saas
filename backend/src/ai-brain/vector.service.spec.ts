const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
  data: [{ embedding: [0.1, 0.2, 0.3] }],
  usage: { total_tokens: 5 },
});

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: mockEmbeddingsCreate,
      },
    })),
  };
});

import { ConfigService } from '@nestjs/config';
import { VectorService } from './vector.service';

describe('VectorService', () => {
  let service: VectorService;
  let configGet: jest.Mock;

  function buildService(openaiKey: string | undefined) {
    configGet = jest.fn().mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return openaiKey;
      }
      return undefined;
    });
    const configStub = { get: configGet } as unknown as ConfigService;
    service = new VectorService(configStub);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEmbedding', () => {
    it('returns embedding array when API key is configured', async () => {
      buildService('sk-test');

      const result = await service.getEmbedding('hello world');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'hello world',
      });
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], tokensUsed: 5 });
    });

    it('returns empty embedding when API key is not configured', async () => {
      buildService(undefined);

      const result = await service.getEmbedding('sample text');

      expect(result).toEqual({ embedding: [], tokensUsed: 0 });
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    });

    it('replaces newlines with spaces in input text', async () => {
      buildService('sk-test');

      await service.getEmbedding('line1\nline2\nline3');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ input: 'line1 line2 line3' }),
      );
    });

    it('truncates text longer than 8000 characters', async () => {
      buildService('sk-test');
      const longText = 'x'.repeat(10000);

      await service.getEmbedding(longText);

      const callArgs = mockEmbeddingsCreate.mock.calls[0] as [{ input: string }];
      expect(callArgs[0].input.length).toBe(8000);
    });

    it('returns empty embedding when response has no data entries', async () => {
      buildService('sk-test');
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [],
        usage: { total_tokens: 0 },
      });

      const result = await service.getEmbedding('text');

      expect(result).toEqual({ embedding: [], tokensUsed: 0 });
    });

    it('falls back to zero tokensUsed when usage is missing from response', async () => {
      buildService('sk-test');
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: [0.1, 0.2] }],
      });

      const result = await service.getEmbedding('text');

      expect(result.tokensUsed).toBe(0);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
      buildService(undefined);

      const result = service.cosineSimilarity([1, 2, 3], [1, 2, 3]);

      expect(result).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for orthogonal vectors', () => {
      buildService(undefined);

      const result = service.cosineSimilarity([1, 0, 0], [0, 1, 0]);

      expect(result).toBeCloseTo(0.0, 5);
    });

    it('returns -1.0 for opposite vectors', () => {
      buildService(undefined);

      const result = service.cosineSimilarity([1, 2, 3], [-1, -2, -3]);

      expect(result).toBeCloseTo(-1.0, 5);
    });

    it('handles vectors of different lengths by skipping undefined values', () => {
      buildService(undefined);

      const result = service.cosineSimilarity([1, 0], [1, 1]);

      expect(result).toBeCloseTo(1 / Math.sqrt(2), 5);
    });

    it('returns NaN when both vectors have zero magnitude', () => {
      buildService(undefined);

      const result = service.cosineSimilarity([0, 0], [0, 0]);

      expect(result).toBeNaN();
    });

    it('handles empty arrays returning NaN', () => {
      buildService(undefined);

      const result = service.cosineSimilarity([], []);

      expect(result).toBeNaN();
    });
  });
});
