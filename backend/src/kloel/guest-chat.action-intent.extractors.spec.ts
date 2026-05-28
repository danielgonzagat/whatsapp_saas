import {
  extractCouponArgs,
  extractPaymentArgs,
  extractPlanArgs,
  extractProductArgs,
  extractUrlArgs,
} from './guest-chat.action-intent.extractors';

describe('guest-chat action intent extractors', () => {
  it('extracts product fields used by action intent routing', () => {
    const args = extractProductArgs(
      'criar produto nome: Curso Alpha, preço R$147 digital categoria: Cursos, garantia 7 dias',
    );

    expect(args.productName).toBe('Curso Alpha');
    expect(args.name).toBe('Curso Alpha');
    expect(args.price).toBe(147);
    expect(args.format).toBe('DIGITAL');
    expect(args.category).toBe('Cursos');
    expect(args.warrantyDays).toBe(7);
  });

  it('extracts plan, coupon, url, and payment arguments without helper-local state', () => {
    const plan = extractPlanArgs(
      'criar plano nome: Premium, para o produto Curso Alpha, preço R$47, 3 parcelas, frete grátis',
    );
    const coupon = extractCouponArgs(
      'criar cupom SAVE10 para o produto Curso Alpha com 10% limite 50 usos expira em 2 meses',
    );
    const url = extractUrlArgs(
      'adicionar url descrição: Aula 1, https://example.com/aula privado para o produto Curso Alpha',
    );
    const payment = extractPaymentArgs('gerar boleto de R$97 para Maria Silva comprar');

    expect(plan.productName).toBe('Curso Alpha');
    expect(plan.planName).toBe('Premium');
    expect(plan.price).toBe(47);
    expect(plan.maxInstallments).toBe(3);
    expect(plan.shippingType).toBe('FREE');

    expect(coupon.productName).toBe('Curso Alpha');
    expect(coupon.code).toBe('SAVE10');
    expect(coupon.discountType).toBe('PERCENT');
    expect(coupon.discountValue).toBe(10);
    expect(coupon.usageLimit).toBe(50);
    expect(coupon.expiresInDays).toBe(60);

    expect(url.productName).toBe('Curso Alpha');
    expect(url.label).toBe('Aula 1');
    expect(url.url).toBe('https://example.com/aula');
    expect(url.isPrivate).toBe(true);

    expect(payment.amount).toBe(97);
    expect(payment.customerName).toBe('Maria Silva');
  });
});
