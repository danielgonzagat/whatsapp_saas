import { Test, TestingModule } from '@nestjs/testing';
import { GrowthController } from './growth.controller';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQRCode'),
}));

describe('GrowthController', () => {
  let controller: GrowthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GrowthController],
    }).compile();

    controller = module.get<GrowthController>(GrowthController);
  });

  describe('generateQr', () => {
    it('generates QR data URL with default message when no message provided', async () => {
      const result = await controller.generateQr({ phone: '5511999999999' });

      expect(result.dataUrl).toContain('data:image');
      expect(result.waUrl).toContain('wa.me/5511999999999');
      expect(result.waUrl).toContain('Ol%C3%A1');
    });

    it('generates QR with custom message', async () => {
      const result = await controller.generateQr({
        phone: '5511988888888',
        message: 'Tenho interesse!',
      });

      expect(result.waUrl).toContain('wa.me/5511988888888');
      expect(result.waUrl).toContain('Tenho%20interesse');
    });

    it('strips non-digit characters from phone number', async () => {
      const result = await controller.generateQr({
        phone: '+55 (11) 99999-9999',
      });

      expect(result.waUrl).toContain('wa.me/5511999999999');
    });

    it('returns both dataUrl and waUrl in response', async () => {
      const result = await controller.generateQr({ phone: '5511999999999' });

      expect(result).toHaveProperty('dataUrl');
      expect(result).toHaveProperty('waUrl');
      expect(typeof result.dataUrl).toBe('string');
      expect(typeof result.waUrl).toBe('string');
    });
  });
});
