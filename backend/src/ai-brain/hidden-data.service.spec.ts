jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    usage: { total_tokens: 100 },
    choices: [
      {
        message: {
          content: JSON.stringify({
            budget: 5000,
            urgency: 'HIGH',
            role: 'Decision Maker',
            pain_points: ['cost', 'time'],
            preferred_time: 'morning',
          }),
        },
      },
    ],
  }),
}));

import { ConfigService } from '@nestjs/config';
import { HiddenDataExtractorService } from './hidden-data.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';

describe('HiddenDataExtractorService', () => {
  let service: HiddenDataExtractorService;
  let configGet: jest.Mock;

  function buildService(openaiKey: string | undefined) {
    configGet = jest.fn().mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return openaiKey;
      }
      return undefined;
    });
    const configStub = { get: configGet } as unknown as ConfigService;
    service = new HiddenDataExtractorService(configStub);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extract', () => {
    it('returns parsed JSON when API key is configured', async () => {
      buildService('sk-test');

      const result = await service.extract('I need a solution for $5000, urgent');

      const [, completionOptions] = (chatCompletionWithRetry as jest.Mock).mock.calls[0] as [
        unknown,
        {
          model: string;
          messages: Array<{ role: string }>;
          response_format: { type: string };
        },
      ];
      expect(typeof completionOptions.model).toBe('string');
      expect(completionOptions.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      );
      expect(completionOptions.response_format).toEqual({ type: 'json_object' });
      expect(result).toEqual({
        budget: 5000,
        urgency: 'HIGH',
        role: 'Decision Maker',
        pain_points: ['cost', 'time'],
        preferred_time: 'morning',
      });
    });

    it('returns empty object when API key is not configured', async () => {
      buildService(undefined);

      const result = await service.extract('sample text');

      expect(result).toEqual({});
      expect(chatCompletionWithRetry).not.toHaveBeenCalled();
    });

    it('returns empty object when OpenAI returns malformed JSON', async () => {
      (chatCompletionWithRetry as jest.Mock).mockResolvedValueOnce({
        usage: { total_tokens: 10 },
        choices: [{ message: { content: 'not valid json {{{' } }],
      });
      buildService('sk-test');

      const result = await service.extract('sample text');

      expect(result).toEqual({});
    });

    it('returns empty object when OpenAI returns null content', async () => {
      (chatCompletionWithRetry as jest.Mock).mockResolvedValueOnce({
        usage: { total_tokens: 10 },
        choices: [{ message: { content: null } }],
      });
      buildService('sk-test');

      const result = await service.extract('sample text');

      expect(result).toEqual({});
    });

    it('preserves all expected fields from the extraction response', async () => {
      buildService('sk-test');

      const result = await service.extract('text');

      expect(result).toHaveProperty('budget');
      expect(result).toHaveProperty('urgency');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('pain_points');
      expect(result).toHaveProperty('preferred_time');
    });

    it('calls OpenAI with the user-provided text embedded in the prompt', async () => {
      const inputText = 'We need this by Friday, budget is tight around R$2000';
      buildService('sk-test');

      await service.extract(inputText);

      const callArgs = (chatCompletionWithRetry as jest.Mock).mock.calls[0] as [
        unknown,
        { messages: Array<{ content: string }> },
      ];
      const messageContent = callArgs[1].messages[0]?.content ?? '';
      expect(messageContent).toContain(inputText);
    });
  });
});
