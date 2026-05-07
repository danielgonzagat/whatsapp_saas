import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail, normalizeOptional, normalizePhone } from '../checkout-social-lead.util';

interface ConversionInput {
  workspaceId: string;
  orderId: string;
  capturedLeadId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  deviceFingerprint?: string | null;
}

export async function findLatestCandidate(prisma: PrismaService, input: ConversionInput) {
  const filters: Prisma.CheckoutSocialLeadWhereInput[] = [];
  const email = normalizeEmail(input.customerEmail);
  if (email) {
    filters.push({
      email: {
        equals: email,
        mode: 'insensitive',
      },
    });
  }

  const phone = normalizePhone(input.customerPhone);
  if (phone) {
    filters.push({ phone });
  }

  const fingerprint = normalizeOptional(input.deviceFingerprint);
  if (fingerprint) {
    filters.push({ deviceFingerprint: fingerprint });
  }

  if (filters.length === 0) {
    return null;
  }

  return prisma.checkoutSocialLead.findFirst({
    where: {
      workspaceId: input.workspaceId,
      convertedAt: null,
      OR: filters,
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
}
