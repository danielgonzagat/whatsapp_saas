import { describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './product.service';

/**
 * The /products create path receives an interface (no class-validator runtime
 * validation), so a missing/invalid price used to reach prisma.product.create
 * and surface as a generic 500. The service-level guard converts that into an
 * explicit 400 before any database I/O.
 */
describe('ProductService.create price validation', () => {
  function buildService() {
    return new ProductService({} as never, {} as never, {} as never);
  }

  it('rejects a missing price with 400 BadRequest before touching the database', async () => {
    const service = buildService();
    await expect(
      service.create('ws-1', { name: 'No Price' } as never, { id: 'agent-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a negative price with 400 BadRequest', async () => {
    const service = buildService();
    await expect(
      service.create('ws-1', { name: 'Negative', price: -5 }, { id: 'agent-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-numeric price with 400 BadRequest', async () => {
    const service = buildService();
    await expect(
      service.create('ws-1', { name: 'NaN', price: Number.NaN }, { id: 'agent-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
