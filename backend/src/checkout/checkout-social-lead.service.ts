import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CheckoutSocialLeadStatus, CheckoutSocialProvider, Prisma } from '@prisma/client';
import { GoogleAuthService } from '../auth/google-auth.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { crmQueue } from '../queue/queue';
import { PrismaService } from '../prisma/prisma.service';
import { CaptureSocialLeadDto } from './dto/capture-social-lead.dto';
import { UpdateSocialLeadDto } from './dto/update-social-lead.dto';

type CheckoutPlanContext = {
  id: string;
  slug: string;
  productId: string;
  workspaceId: string;
};

type ConversionInput = {
  workspaceId: string;
  orderId: string;
  capturedLeadId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  deviceFingerprint?: string | null;
};

@Injectable()
export class CheckoutSocialLeadService {
  private readonly logger = new Logger(CheckoutSocialLeadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  async captureLead(dto: CaptureSocialLeadDto) {
    const plan = await this.resolvePlanBySlug(dto.slug);
    const provider = this.parseProvider(dto.provider);

    if (provider !== CheckoutSocialProvider.GOOGLE) {
      throw new ServiceUnavailableException(
        'Google está disponível agora. Facebook e Apple entram nas próximas iterações.',
      );
    }

    const verified = await this.googleAuthService.verifyCredential(dto.credential || '');
    const lead = await this.prisma.checkoutSocialLead.create({
      data: {
        workspaceId: plan.workspaceId,
        planId: plan.id,
        productId: plan.productId,
        checkoutSlug: plan.slug,
        checkoutCode: this.normalizeOptional(dto.checkoutCode),
        provider,
        providerId: verified.providerId,
        providerEmailVerified: verified.emailVerified,
        name: this.normalizeOptional(verified.name),
        email: this.normalizeEmail(verified.email),
        avatarUrl: this.normalizeOptional(verified.image),
        sourceUrl: this.normalizeOptional(dto.sourceUrl),
        refererUrl: this.normalizeOptional(dto.refererUrl),
        utmSource: this.normalizeOptional(dto.utmSource),
        utmMedium: this.normalizeOptional(dto.utmMedium),
        utmCampaign: this.normalizeOptional(dto.utmCampaign),
        utmContent: this.normalizeOptional(dto.utmContent),
        utmTerm: this.normalizeOptional(dto.utmTerm),
        fbclid: this.normalizeOptional(dto.fbclid),
        gclid: this.normalizeOptional(dto.gclid),
        deviceFingerprint: this.normalizeOptional(dto.deviceFingerprint),
        providerPayload: this.toJsonValue({
          provider: verified.provider,
          providerId: verified.providerId,
          emailVerified: verified.emailVerified,
        }),
      },
      select: {
        id: true,
        provider: true,
        name: true,
        email: true,
        avatarUrl: true,
        deviceFingerprint: true,
        workspaceId: true,
        checkoutSlug: true,
      },
    });

    await this.enqueueEnrichment(lead.id);

    return {
      leadId: lead.id,
      provider: dto.provider,
      name: lead.name,
      email: lead.email,
      avatarUrl: lead.avatarUrl,
      deviceFingerprint: lead.deviceFingerprint,
      workspaceId: lead.workspaceId,
      checkoutSlug: lead.checkoutSlug,
    };
  }

  async updateLead(leadId: string, dto: UpdateSocialLeadDto) {
    const existing = await this.prisma.checkoutSocialLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        email: true,
        phone: true,
        cpf: true,
        stepReached: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Lead social do checkout não encontrado.');
    }

    const normalizedPhone = this.normalizePhone(dto.phone) || existing.phone || null;
    const nextStep = Math.max(existing.stepReached, dto.stepReached || existing.stepReached);
    const contactId = normalizedPhone
      ? await this.upsertContact({
          workspaceId: existing.workspaceId,
          name: existing.name,
          email: existing.email,
          phone: normalizedPhone,
        })
      : null;

    return this.prisma.checkoutSocialLead.update({
      where: { id: leadId },
      data: {
        phone: normalizedPhone,
        cpf: this.normalizeOptional(dto.cpf) || existing.cpf || null,
        stepReached: nextStep,
        contactId: contactId || undefined,
      },
      select: {
        id: true,
        phone: true,
        cpf: true,
        stepReached: true,
        contactId: true,
      },
    });
  }

  async markConvertedFromOrder(input: ConversionInput) {
    const target = input.capturedLeadId
      ? await this.prisma.checkoutSocialLead.findFirst({
          where: { id: input.capturedLeadId, workspaceId: input.workspaceId },
          select: { id: true },
        })
      : await this.findLatestCandidate(input);

    if (!target) {
      return null;
    }

    return this.prisma.checkoutSocialLead.update({
      where: { id: target.id },
      data: {
        status: CheckoutSocialLeadStatus.CONVERTED,
        convertedAt: new Date(),
        convertedOrderId: input.orderId,
        stepReached: 3,
      },
      select: {
        id: true,
        status: true,
        convertedAt: true,
        convertedOrderId: true,
      },
    });
  }

  async syncLeadContact(leadId: string) {
    const lead = await this.prisma.checkoutSocialLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    if (!lead?.phone) {
      return null;
    }

    const contactId = await this.upsertContact({
      workspaceId: lead.workspaceId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    });

    if (!contactId) {
      return null;
    }

    await this.prisma.checkoutSocialLead.update({
      where: { id: lead.id },
      data: { contactId },
    });

    return contactId;
  }

  private async resolvePlanBySlug(slug: string): Promise<CheckoutPlanContext> {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        productId: true,
        product: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!plan?.product?.workspaceId) {
      throw new NotFoundException('Checkout não encontrado para captura social.');
    }

    return {
      id: plan.id,
      slug: plan.slug,
      productId: plan.productId,
      workspaceId: plan.product.workspaceId,
    };
  }

  private parseProvider(provider: string) {
    if (provider === 'google') return CheckoutSocialProvider.GOOGLE;
    if (provider === 'facebook') return CheckoutSocialProvider.FACEBOOK;
    return CheckoutSocialProvider.APPLE;
  }

  private async enqueueEnrichment(leadId: string) {
    await crmQueue.add(
      'checkout-social-lead-enrich',
      { leadId },
      {
        jobId: buildQueueJobId('checkout-social-lead-enrich', leadId),
        removeOnComplete: true,
      },
    );
  }

  private async findLatestCandidate(input: ConversionInput) {
    const filters: Prisma.CheckoutSocialLeadWhereInput[] = [];
    const email = this.normalizeEmail(input.customerEmail);
    if (email) {
      filters.push({
        email: {
          equals: email,
          mode: 'insensitive',
        },
      });
    }

    const phone = this.normalizePhone(input.customerPhone);
    if (phone) {
      filters.push({ phone });
    }

    const fingerprint = this.normalizeOptional(input.deviceFingerprint);
    if (fingerprint) {
      filters.push({ deviceFingerprint: fingerprint });
    }

    if (filters.length === 0) {
      return null;
    }

    return this.prisma.checkoutSocialLead.findFirst({
      where: {
        workspaceId: input.workspaceId,
        convertedAt: null,
        OR: filters,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async upsertContact(input: {
    workspaceId: string;
    name?: string | null;
    email?: string | null;
    phone: string;
  }) {
    const phone = this.normalizePhone(input.phone);
    if (!phone) {
      return null;
    }

    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: input.workspaceId,
          phone,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        phone,
        name: this.normalizeOptional(input.name),
        email: this.normalizeEmail(input.email),
        customFields: {
          checkoutSocialLead: true,
        },
      },
      update: {
        name: this.normalizeOptional(input.name) || undefined,
        email: this.normalizeEmail(input.email) || undefined,
      },
      select: { id: true },
    });

    return contact.id;
  }

  private normalizeOptional(value?: string | null) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeEmail(value?: string | null) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return normalized || null;
  }

  private normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits || null;
  }

  private toJsonValue(value: Record<string, string | boolean | null>): Prisma.InputJsonValue {
    return value;
  }
}
