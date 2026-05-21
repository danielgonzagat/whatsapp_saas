import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductReviewController } from './product-review.controller';

describe('ProductReviewController', () => {
  const productFindFirst = jest.fn();
  const reviewFindMany = jest.fn();
  const reviewCreate = jest.fn();
  const reviewFindFirst = jest.fn();
  const reviewDelete = jest.fn();
  const auditLog = jest.fn();

  let controller: ProductReviewController;

  const mockReq = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    productFindFirst.mockResolvedValue({ id: 'prod-1', workspaceId: 'ws-1' });

    controller = new ProductReviewController(
      {
        product: { findFirst: productFindFirst },
        productReview: {
          findMany: reviewFindMany,
          create: reviewCreate,
          findFirst: reviewFindFirst,
          delete: reviewDelete,
        },
      } as never,
      { log: auditLog } as never,
    );
  });

  describe('list', () => {
    it('returns serialized reviews for the product', async () => {
      reviewFindMany.mockResolvedValue([
        { id: 'rv-1', productId: 'prod-1', rating: 5, authorName: 'A', comment: 'Great' },
        { id: 'rv-2', productId: 'prod-1', rating: 4, authorName: 'B', comment: null },
      ]);

      const result = await controller.list('prod-1', mockReq);

      expect(productFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-1', workspaceId: 'ws-1' } }),
      );
      expect(reviewFindMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'rv-1', name: 'A', text: 'Great' });
      expect(result[1]).toMatchObject({ id: 'rv-2', name: 'B', text: '' });
    });
  });

  describe('create', () => {
    it('creates a review and returns it serialized', async () => {
      const body = { rating: 5, authorName: 'John', comment: 'Awesome', verified: true };
      reviewCreate.mockResolvedValue({
        id: 'rv-3',
        productId: 'prod-1',
        rating: 5,
        authorName: 'John',
        comment: 'Awesome',
        verified: true,
      });

      const result = await controller.create('prod-1', body, mockReq);

      expect(productFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-1', workspaceId: 'ws-1' } }),
      );
      expect(reviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'prod-1',
            rating: 5,
            authorName: 'John',
            comment: 'Awesome',
            verified: true,
          }),
        }),
      );
      expect(result).toMatchObject({ id: 'rv-3', name: 'John', text: 'Awesome' });
    });
  });

  describe('delete', () => {
    it('deletes a review and logs audit', async () => {
      reviewFindFirst.mockResolvedValue({ id: 'rv-1', productId: 'prod-1' });
      reviewDelete.mockResolvedValue({ id: 'rv-1' });

      const result = await controller.delete('prod-1', 'rv-1', mockReq);

      expect(productFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-1', workspaceId: 'ws-1' } }),
      );
      expect(reviewFindFirst).toHaveBeenCalledWith({
        where: { id: 'rv-1', productId: 'prod-1' },
      });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          action: 'DELETE_RECORD',
          resource: 'ProductReview',
          resourceId: 'rv-1',
        }),
      );
      expect(reviewDelete).toHaveBeenCalledWith({ where: { id: 'rv-1' } });
      expect(result).toMatchObject({ id: 'rv-1' });
    });
  });

  describe('error paths', () => {
    it('propagates NotFoundException when product access fails for list', async () => {
      productFindFirst.mockResolvedValue(null);

      await expect(controller.list('prod-1', mockReq)).rejects.toThrow(NotFoundException);
    });

    it('propagates NotFoundException when review not found on delete', async () => {
      reviewFindFirst.mockResolvedValue(null);

      await expect(controller.delete('prod-1', 'rv-1', mockReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('identity', () => {
    it('propagates workspaceId from request into product access check', async () => {
      reviewFindMany.mockResolvedValue([]);

      await controller.list('prod-1', mockReq);

      expect(productFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-1', workspaceId: 'ws-1' } }),
      );
    });
  });
});
