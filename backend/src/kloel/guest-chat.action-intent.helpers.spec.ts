import type { PrismaService } from '../prisma/prisma.service';
import { detectActionIntent } from './guest-chat.action-intent.helpers';
import { extractProductArgs, extractProductName } from './guest-chat.product-args.helpers';
import { runGetProductReviews } from './kloel-chat-tools.product.helpers';

describe('guest chat action intent helpers', () => {
  it('routes URL deletion with the URL payload preserved', () => {
    const action = detectActionIntent('remove a url https://example.com/oferta no produto Serum?');

    expect(action?.tool).toBe('delete_url');
    expect(action?.args).toMatchObject({
      urlLabel: 'serum',
      url: 'https://example.com/oferta',
    });
  });

  it('routes abandonment and anticipation intents to their dedicated tools', () => {
    expect(detectActionIntent('listar carrinhos abandonados')?.tool).toBe('get_abandonments');
    expect(detectActionIntent('quero antecipacao do saldo')?.tool).toBe('request_anticipation');
  });

  it('extracts product names from no-produto contexts and explicit names', () => {
    expect(extractProductName('listar urls no produto Serum?')).toBe('Serum');
    expect(extractProductArgs('criar produto nome: Serum Pro, preco R$ 147')).toEqual(
      expect.objectContaining({
        productName: 'Serum Pro',
        name: 'Serum Pro',
        price: 147,
      }),
    );
  });

  it('resolves reviews by productName with accent-tolerant fallback', async () => {
    const productReviewFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'rev-1', rating: 5, comment: 'Bom' }]);
    const prisma = {
      product: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'prod-1', name: 'Serum Facial' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'prod-1', name: 'Serum Facial' }]),
      },
      productReview: {
        findMany: productReviewFindMany,
      },
    } as unknown as PrismaService;

    const result = await runGetProductReviews(prisma, 'ws-1', { productName: 'Sérum' });

    expect(result.success).toBe(true);
    expect(productReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'prod-1' } }),
    );
  });
});
