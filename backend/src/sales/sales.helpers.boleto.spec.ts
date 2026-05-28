import { buildBoletoAddressMetadata, buildBoletoOrderResult } from './sales.helpers';

describe('sales.helpers (boleto)', () => {
  describe('buildBoletoAddressMetadata', () => {
    it('omits neighborhood when missing', () => {
      const meta = buildBoletoAddressMetadata({
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(meta).toEqual({
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(meta.neighborhood).toBeUndefined();
    });

    it('includes neighborhood when present', () => {
      const meta = buildBoletoAddressMetadata({
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(meta.neighborhood).toBe('Bela Vista');
    });
  });

  describe('buildBoletoOrderResult', () => {
    it('prefers the digitable line for boletoBarcode when present', () => {
      const expiresAt = new Date('2026-01-04T12:00:00.000Z');
      const result = buildBoletoOrderResult({
        saleId: 'sale-1',
        boletoResult: {
          digitableLine: '23793.38128 60082.011113 95000.063307 8 96580000020000',
          barcodeContent: '23798960000020000033812600820111910500006330',
          expiresAt,
          ticketUrl: 'https://mp.example/boleto',
          externalId: 'mp-bol-1',
        },
      });
      expect(result).toEqual({
        saleId: 'sale-1',
        boletoBarcode: '23793.38128 60082.011113 95000.063307 8 96580000020000',
        boletoExpiresAt: expiresAt,
        boletoUrl: 'https://mp.example/boleto',
        externalPaymentId: 'mp-bol-1',
      });
    });

    it('falls back to the raw barcode content when the digitable line is empty', () => {
      const result = buildBoletoOrderResult({
        saleId: 'sale-2',
        boletoResult: {
          digitableLine: '',
          barcodeContent: 'RAW-BARCODE',
          expiresAt: new Date(),
          ticketUrl: 'https://t/x',
          externalId: 'mp-bol-2',
        },
      });
      expect(result.boletoBarcode).toBe('RAW-BARCODE');
    });
  });
});
