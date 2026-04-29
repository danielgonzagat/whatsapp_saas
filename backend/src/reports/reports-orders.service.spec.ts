import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { dateRange, validatedPaidOrderStatus } from './reports-orders.service';

describe('reports order filters', () => {
  it('rejects invalid report dates instead of querying with Invalid Date', () => {
    expect(() => dateRange({ startDate: 'not-a-date' })).toThrow(BadRequestException);
    expect(() => dateRange({ endDate: 'not-a-date' })).toThrow(BadRequestException);
  });

  it('uses a state-machine-validated paid status for report read filters', () => {
    expect(validatedPaidOrderStatus('reports-orders.service.spec')).toBe(OrderStatus.PAID);
  });
});
