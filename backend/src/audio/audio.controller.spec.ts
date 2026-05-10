import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AudioController } from './audio.controller';

describe('AudioController', () => {
  let controller: AudioController;

  const SAVED_OPENAI_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    controller = new AudioController();
  });

  afterEach(() => {
    if (SAVED_OPENAI_KEY) {
      process.env.OPENAI_API_KEY = SAVED_OPENAI_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe('synthesize', () => {
    it('throws BadRequestException when text is empty', async () => {
      await expect(controller.synthesize({ text: '' })).rejects.toThrow(BadRequestException);
      await expect(controller.synthesize({ text: '' })).rejects.toThrow('text é obrigatório');
    });

    it('throws BadRequestException when text is only whitespace', async () => {
      await expect(controller.synthesize({ text: '   ' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when body has no text field', async () => {
      await expect(controller.synthesize({})).rejects.toThrow(BadRequestException);
    });

    it('throws ServiceUnavailableException when OPENAI_API_KEY is not configured', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(controller.synthesize({ text: 'Hello world' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(controller.synthesize({ text: 'Hello world' })).rejects.toThrow(
        'TTS não configurado neste ambiente',
      );
    });

    it('throws an error when text is not provided at all', async () => {
      // null body should trigger BadRequestException since !body?.text is true
      await expect(controller.synthesize(null)).rejects.toThrow(BadRequestException);
    });

    it('handles undefined text field gracefully', async () => {
      await expect(controller.synthesize({ text: undefined })).rejects.toThrow(BadRequestException);
    });
  });
});
