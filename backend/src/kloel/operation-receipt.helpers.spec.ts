import { buildResultMeta } from './operation-receipt.helpers';

describe('operation receipt helpers', () => {
  it('preserves canonical PIX proof metadata from nested outputs', () => {
    const meta = buildResultMeta('sales.create_pix', {
      success: true,
      outputs: {
        paymentId: 'pay_1',
        saleId: 'sale_1',
        customerName: 'Joao',
        pixCopiaECola: '000201pix',
        pixQrCode: 'qr-base64',
        paymentUrl: 'https://pay.example/pix/pay_1',
      },
    });

    expect(meta).toMatchObject({
      paymentId: 'pay_1',
      saleId: 'sale_1',
      customerName: 'Joao',
      hasPix: true,
      pixCopiaECola: '000201pix',
      pixQrCode: 'qr-base64',
      paymentUrl: 'https://pay.example/pix/pay_1',
    });
  });

  it('keeps legacy PIX proof metadata from top-level results', () => {
    const meta = buildResultMeta('generate_pix', {
      success: true,
      paymentId: 'pay_legacy',
      pixCopyPaste: 'legacy-pix-code',
    });

    expect(meta).toMatchObject({
      paymentId: 'pay_legacy',
      hasPix: true,
      pixCopyPaste: 'legacy-pix-code',
    });
  });

  it('preserves boleto proof metadata from canonical and legacy fields', () => {
    const canonical = buildResultMeta('sales.create_boleto', {
      success: true,
      outputs: {
        paymentId: 'bol_1',
        saleId: 'sale_2',
        boletoCode: '23790.00000',
        boletoBarcode: '2379000000',
        boletoPdfUrl: 'https://pay.example/boleto.pdf',
      },
    });
    const legacy = buildResultMeta('generate_boleto', {
      success: true,
      boletoCode: 'legacy-boleto-code',
    });

    expect(canonical).toMatchObject({
      paymentId: 'bol_1',
      saleId: 'sale_2',
      hasBoleto: true,
      boletoCode: '23790.00000',
      boletoBarcode: '2379000000',
      boletoPdfUrl: 'https://pay.example/boleto.pdf',
    });
    expect(legacy).toMatchObject({
      hasBoleto: true,
      boletoCode: 'legacy-boleto-code',
    });
  });
});
