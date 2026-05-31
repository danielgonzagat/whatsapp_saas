import { buildPixOrderResult } from './sales.helpers';

describe('sales.helpers (pix)', () => {
  describe('buildPixOrderResult', () => {
    it('prefers the copia-e-cola string for both pixQrCode and pixCopyPaste', () => {
      const expiresAt = new Date('2026-01-01T12:30:00.000Z');
      const result = buildPixOrderResult({
        saleId: 'sale-1',
        expiresAt,
        pixResult: {
          qrCode: 'COPIA-E-COLA-STRING',
          qrCodeBase64: 'iVBORw0...',
          ticketUrl: 'https://mp.example/ticket',
          externalId: 'mp-123',
        },
      });
      expect(result).toEqual({
        saleId: 'sale-1',
        pixQrCode: 'COPIA-E-COLA-STRING',
        pixQrCodeBase64: 'iVBORw0...',
        pixCopyPaste: 'COPIA-E-COLA-STRING',
        pixExpiresAt: expiresAt,
        externalPaymentId: 'mp-123',
        ticketUrl: 'https://mp.example/ticket',
      });
    });

    it('falls back to base64 for pixQrCode when copia-e-cola is empty', () => {
      const result = buildPixOrderResult({
        saleId: 'sale-2',
        expiresAt: new Date(),
        pixResult: {
          qrCode: '',
          qrCodeBase64: 'BASE64',
          ticketUrl: 'https://t/x',
          externalId: 'mp-456',
        },
      });
      expect(result.pixQrCode).toBe('BASE64');
      expect(result.pixCopyPaste).toBe('');
    });
  });
});
