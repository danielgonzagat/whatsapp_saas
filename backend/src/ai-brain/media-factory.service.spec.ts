jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    usage: { total_tokens: 80 },
    choices: [
      {
        message: {
          content:
            'Hook: Attention grabber\nBody: Key points\nCTA: Call to action\nVisual: Show product',
        },
      },
    ],
  }),
}));

const mockImagesGenerate = jest.fn().mockResolvedValue({
  data: [{ url: 'https://example.com/image.png' }],
});

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      images: {
        generate: mockImagesGenerate,
      },
    })),
  };
});

import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { MediaFactoryService } from './media-factory.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { CANONICAL_MODEL_IDS } from '../lib/openai-models';

describe('MediaFactoryService', () => {
  let service: MediaFactoryService;
  let configGet: jest.Mock;

  function buildService(openaiKey: string | undefined) {
    configGet = jest.fn().mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return openaiKey;
      }
      return undefined;
    });
    const configStub = { get: configGet } as ConfigService;
    service = new MediaFactoryService(configStub);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateImage', () => {
    it('returns image URL when API key is configured', async () => {
      buildService('sk-test');

      const result = await service.generateImage('a beautiful sunset');

      expect(mockImagesGenerate).toHaveBeenCalledWith({
        model: CANONICAL_MODEL_IDS.imageGeneration,
        prompt: 'a beautiful sunset',
        n: 1,
        size: '1024x1024',
      });
      expect(result).toEqual({ url: 'https://example.com/image.png' });
    });

    it('throws ServiceUnavailableException when API key is not configured', async () => {
      buildService(undefined);

      await expect(service.generateImage('prompt')).rejects.toThrow(ServiceUnavailableException);
      await expect(service.generateImage('prompt')).rejects.toThrow(
        'Image generation requires OPENAI_API_KEY',
      );
    });

    it('throws ServiceUnavailableException when response has no data entries', async () => {
      buildService('sk-test');
      mockImagesGenerate.mockResolvedValueOnce({ data: [] });

      await expect(service.generateImage('prompt')).rejects.toThrow(ServiceUnavailableException);
      await expect(service.generateImage('prompt')).rejects.toThrow(
        'Image generation returned no URL',
      );
    });

    it('throws ServiceUnavailableException when first data entry has no url', async () => {
      buildService('sk-test');
      mockImagesGenerate.mockResolvedValueOnce({
        data: [{ revised_prompt: 'revised prompt' }],
      });

      await expect(service.generateImage('prompt')).rejects.toThrow(ServiceUnavailableException);
      await expect(service.generateImage('prompt')).rejects.toThrow(
        'Image generation returned no URL',
      );
    });
  });

  describe('generateVoice', () => {
    it('always throws ServiceUnavailableException', () => {
      buildService('sk-test');

      expect(() => service.generateVoice('hello')).toThrow(ServiceUnavailableException);
      expect(() => service.generateVoice('hello')).toThrow('Voice synthesis is not configured');
    });

    it('throws with the same message even when API key is not configured', () => {
      buildService(undefined);

      expect(() => service.generateVoice('hello')).toThrow('Voice synthesis is not configured');
    });
  });

  describe('generateSocialContent', () => {
    it('returns script when API key is configured', async () => {
      buildService('sk-test');

      const result = await service.generateSocialContent('marketing tips', 'INSTAGRAM');

      expect(chatCompletionWithRetry).toHaveBeenCalled();
      expect(result).toEqual({
        script:
          'Hook: Attention grabber\nBody: Key points\nCTA: Call to action\nVisual: Show product',
      });
    });

    it('returns fallback message when API key is not configured', async () => {
      buildService(undefined);

      const result = await service.generateSocialContent('topic', 'INSTAGRAM');

      expect(result).toEqual({ content: 'AI not configured' });
      expect(chatCompletionWithRetry).not.toHaveBeenCalled();
    });

    it('includes INSTAGRAM in the prompt when platform is INSTAGRAM', async () => {
      buildService('sk-test');

      await service.generateSocialContent('test topic', 'INSTAGRAM');

      const callArgs = (chatCompletionWithRetry as jest.Mock).mock.calls[0] as [
        unknown,
        { messages: Array<{ content: string }> },
      ];
      const promptContent = callArgs[1].messages[0]?.content ?? '';
      expect(promptContent).toContain('INSTAGRAM');
    });

    it('includes TIKTOK in the prompt when platform is TIKTOK', async () => {
      buildService('sk-test');

      await service.generateSocialContent('test topic', 'TIKTOK');

      const callArgs = (chatCompletionWithRetry as jest.Mock).mock.calls[0] as [
        unknown,
        { messages: Array<{ content: string }> },
      ];
      const promptContent = callArgs[1].messages[0]?.content ?? '';
      expect(promptContent).toContain('TIKTOK');
    });
  });
});
