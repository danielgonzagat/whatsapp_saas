import type { Prisma } from '@prisma/client';
import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { CheckoutOrderSupport } from './checkout-order-support';

describe('CheckoutOrderSupport', () => {
  const support = new CheckoutOrderSupport(
    {} as unknown as PrismaService,
    new Logger('CheckoutOrderSupportTest'),
  );

  it('normalizes email, phone and accepted bump ids for safe checkout processing', () => {
    const acceptedBumpIds = [' bump-a ', '', null, 'bump-b'] as unknown as Prisma.InputJsonValue;

    expect(support.normalizeEmail('  DANIEL@Example.COM  ')).toBe('daniel@example.com');
    expect(support.normalizePhoneDigits('(64) 99999-1234')).toBe('64999991234');
    expect(support.parseAcceptedBumpIds(acceptedBumpIds)).toEqual(['bump-a', 'bump-b']);
  });

  it('builds checkout line items with normalized quantity and accepted bumps only', () => {
    const items = support.buildCheckoutLineItems(
      {
        id: 'plan_coreamy',
        name: '1 Frasco Coreamy PDRN',
        priceInCents: 42360,
        quantity: 1,
        product: {
          name: 'Coreamy PDRN',
          description: 'Tratamento premium',
          category: 'DIGITAL',
          format: 'DIGITAL',
          images: ['https://cdn.example/coreamy.jpg'],
        },
        orderBumps: [
          {
            id: 'bump_vip',
            title: 'Suporte VIP',
            description: 'Acesso prioritário',
            productName: 'Suporte VIP',
            image: 'https://cdn.example/vip.jpg',
            priceInCents: 9900,
          },
          {
            id: 'bump_bonus',
            title: 'Bônus extra',
            description: 'Conteúdo adicional',
            productName: 'Bônus extra',
            image: 'https://cdn.example/bonus.jpg',
            priceInCents: 4900,
          },
        ],
      },
      ['bump_vip'],
      999,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'plan_coreamy',
      title: '1 Frasco Coreamy PDRN',
      pictureUrl: 'https://cdn.example/coreamy.jpg',
      quantity: 99,
      unitPriceInCents: 42360,
      warranty: false,
    });
    expect(items[1]).toMatchObject({
      id: 'bump_vip',
      title: 'Suporte VIP',
      pictureUrl: 'https://cdn.example/vip.jpg',
      quantity: 1,
      unitPriceInCents: 9900,
      warranty: false,
    });
  });
});
