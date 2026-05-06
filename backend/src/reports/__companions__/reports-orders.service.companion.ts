import { BadRequestException } from '@nestjs/common';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { assertValidOrderStatusFilter } from '../../common/checkout-order-state-machine';
import type { ReportFiltersDto } from '../dto/report-filters.dto';

const ORDER_STATUSES = new Set<string>(Object.values(OrderStatus));
const PAYMENT_METHODS = new Set<string>(Object.values(PaymentMethod));

export function assertValidReportDate(parsed: Date, field: string): void {
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
}

export function toOrderStatus(value: string | undefined): OrderStatus | undefined {
  return value && ORDER_STATUSES.has(value) ? (value as OrderStatus) : undefined;
}

export function toPaymentMethod(value: string | undefined): PaymentMethod | undefined {
  return value && PAYMENT_METHODS.has(value) ? (value as PaymentMethod) : undefined;
}

export function dateRange(f: ReportFiltersDto) {
  const start = f.startDate ? new Date(f.startDate) : new Date(Date.now() - 30 * 86400000);
  const end = f.endDate ? new Date(`${f.endDate}T23:59:59Z`) : new Date();
  assertValidReportDate(start, 'startDate');
  assertValidReportDate(end, 'endDate');
  return { start, end };
}

export function validatedPaidOrderStatus(caller: string): OrderStatus {
  assertValidOrderStatusFilter(OrderStatus.PAID, caller);
  return OrderStatus.PAID;
}

export function paginate(f: ReportFiltersDto) {
  const page = f.page || 1;
  const perPage = Math.min(f.perPage || 10, 100);
  return { skip: (page - 1) * perPage, take: perPage };
}

export function applyCommonOrderFilters(
  where: Prisma.CheckoutOrderWhereInput,
  f: ReportFiltersDto,
): void {
  if (f.orderCode) {
    where.orderNumber = { contains: f.orderCode, mode: 'insensitive' };
  }
  if (f.buyerName) {
    where.customerName = { contains: f.buyerName, mode: 'insensitive' };
  }
  if (f.buyerEmail) {
    where.customerEmail = { contains: f.buyerEmail, mode: 'insensitive' };
  }
  if (f.cpfCnpj) {
    where.customerCPF = { contains: f.cpfCnpj };
  }
  if (f.utmSource) {
    where.utmSource = { contains: f.utmSource, mode: 'insensitive' };
  }
  if (f.utmMedium) {
    where.utmMedium = { contains: f.utmMedium, mode: 'insensitive' };
  }
  if (f.planName) {
    where.plan = { name: { contains: f.planName, mode: 'insensitive' } };
  }
  if (f.isUpsell === 'true') {
    where.upsellOrders = { some: {} };
  }
  if (f.isRecovery === 'true') {
    where.couponCode = { contains: 'RECOVERY', mode: 'insensitive' };
  }
}
