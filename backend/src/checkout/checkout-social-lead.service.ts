import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CheckoutSocialLeadStatus, CheckoutSocialProvider, Prisma } from '@prisma/client';
import { AppleAuthService } from '../auth/apple-auth.service';
import { FacebookAuthService } from '../auth/facebook-auth.service';
import { GoogleAuthService } from '../auth/google-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { crmQueue } from '../queue/queue';
import { CaptureSocialLeadDto } from './dto/capture-social-lead.dto';
import { UpdateSocialLeadDto } from './dto/update-social-lead.dto';
import {
  extractAddressFromEnrichment,
  mergeGooglePeopleProfile,
  mergeLeadAddressSnapshot,
  normalizeEmail,
  normalizeOptional,
  normalizePhone,
  toJsonValue,
} from './checkout-social-lead.util';

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

type CheckoutSocialLeadPrefill = {
  leadId: string;
  provider: CaptureSocialLeadDto['provider'];
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  deviceFingerprint: string | null;
  phone: string | null;
  cpf: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  complement: string | null;
};

/** Checkout social lead service. */
@Injectable()
export class CheckoutSocialLeadService {
  private readonly logger = new Logger(CheckoutSocialLeadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly facebookAuthService: FacebookAuthService,
    private readonly appleAuthService: AppleAuthService,
  ) {}

  /** Capture lead. */
  async captureLead(dto: CaptureSocialLeadDto) {
    const plan = await this.resolvePlanBySlug(dto.slug);
    const provider = this.parseProvider(dto.provider);

    const verified = await this.verifySocialProvider(provider, dto);
    const lead = await this.prisma.checkoutSocialLead.create({
      data: {
        workspaceId: plan.workspaceId,
        planId: plan.id,
        productId: plan.productId,
        checkoutSlug: plan.slug,
        checkoutCode: normalizeOptional(dto.checkoutCode),
        provider,
        providerId: verified.providerId,
        providerEmailVerified: verified.emailVerified,
        name: normalizeOptional(verified.name),
        email: normalizeEmail(verified.email),
        avatarUrl: normalizeOptional(verified.image),
        sourceUrl: normalizeOptional(dto.sourceUrl),
        refererUrl: normalizeOptional(dto.refererUrl),
        utmSource: normalizeOptional(dto.utmSource),
        utmMedium: normalizeOptional(dto.utmMedium),
        utmCampaign: normalizeOptional(dto.utmCampaign),
        utmContent: normalizeOptional(dto.utmContent),
        utmTerm: normalizeOptional(dto.utmTerm),
        fbclid: normalizeOptional(dto.fbclid),
        gclid: normalizeOptional(dto.gclid),
        deviceFingerprint: normalizeOptional(dto.deviceFingerprint),
        providerPayload: toJsonValue({
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

  /** Get lead prefill. */
  async getLeadPrefill(input: {
    slug: string;
    checkoutCode?: string | null;
    deviceFingerprint?: string | null;
  }): Promise<CheckoutSocialLeadPrefill | null> {
    const normalizedSlug = normalizeOptional(input.slug);
    const fingerprint = normalizeOptional(input.deviceFingerprint);
    if (!normalizedSlug || !fingerprint) {
      return null;
    }

    const plan = await this.resolvePlanBySlug(normalizedSlug);
    const normalizedCheckoutCode = normalizeOptional(input.checkoutCode);
    const lead = await this.prisma.checkoutSocialLead.findFirst({
      where: {
        workspaceId: plan.workspaceId,
        deviceFingerprint: fingerprint,
        OR: [
          { checkoutSlug: plan.slug },
          ...(normalizedCheckoutCode ? [{ checkoutCode: normalizedCheckoutCode }] : []),
        ],
      },
      orderBy: [{ enrichedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        provider: true,
        name: true,
        email: true,
        avatarUrl: true,
        deviceFingerprint: true,
        phone: true,
        cpf: true,
        enrichmentData: true,
      },
    });

    if (!lead) {
      return null;
    }

    const address = extractAddressFromEnrichment(lead.enrichmentData);

    return {
      leadId: lead.id,
      provider: this.serializeProvider(lead.provider),
      name: lead.name,
      email: lead.email,
      avatarUrl: lead.avatarUrl,
      deviceFingerprint: lead.deviceFingerprint,
      phone: lead.phone,
      cpf: lead.cpf,
      cep: address.cep,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      complement: address.complement,
    };
  }

  /** Hydrate google profile. */
  async hydrateGoogleProfile(leadId: string, accessToken: string) {
    const updatedLead = await this.prisma.$transaction(
      async (tx) => {
        const lead = await tx.checkoutSocialLead.findUnique({
          where: { id: leadId },
          select: {
            id: true,
            workspaceId: true,
            provider: true,
            email: true,
            phone: true,
            enrichmentData: true,
          },
        });

        if (!lead) {
          throw new NotFoundException('Lead social do checkout não encontrado.');
        }

        if (lead.provider !== CheckoutSocialProvider.GOOGLE) {
          throw new ServiceUnavailableException(
            'Escopos adicionais disponíveis apenas para Google.',
          );
        }

        const peopleProfile = await this.googleAuthService.fetchPeopleProfile(accessToken);
        const normalizedLeadEmail = normalizeEmail(lead.email);
        const normalizedProfileEmail = normalizeEmail(peopleProfile.email);

        if (
          normalizedLeadEmail &&
          normalizedProfileEmail &&
          normalizedLeadEmail !== normalizedProfileEmail
        ) {
          const emailMismatchSummary = {
            leadId,
            leadEmail: normalizedLeadEmail,
            peopleEmail: normalizedProfileEmail,
          };
          this.logger.warn(`google_people_email_mismatch: ${JSON.stringify(emailMismatchSummary)}`);
          throw new UnauthorizedException('Conta Google divergente da identidade já capturada.');
        }

        const normalizedPhone = normalizePhone(peopleProfile.phone) || lead.phone || null;
        const mergedEnrichmentData = mergeGooglePeopleProfile(lead.enrichmentData, peopleProfile);

        return {
          normalizedPhone,
          result: await tx.checkoutSocialLead.update({
            where: { id: lead.id },
            data: {
              phone: normalizedPhone,
              enrichmentData: mergedEnrichmentData,
            },
            select: {
              id: true,
              workspaceId: true,
              provider: true,
              name: true,
              email: true,
              avatarUrl: true,
              deviceFingerprint: true,
              phone: true,
              cpf: true,
              enrichmentData: true,
            },
          }),
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );

    if (updatedLead.normalizedPhone) {
      await this.syncLeadContact(updatedLead.result.id);
    }

    const address = extractAddressFromEnrichment(updatedLead.result.enrichmentData);

    return {
      leadId: updatedLead.result.id,
      provider: this.serializeProvider(updatedLead.result.provider),
      name: updatedLead.result.name,
      email: updatedLead.result.email,
      avatarUrl: updatedLead.result.avatarUrl,
      deviceFingerprint: updatedLead.result.deviceFingerprint,
      phone: updatedLead.result.phone,
      cpf: updatedLead.result.cpf,
      cep: address.cep,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      complement: address.complement,
    };
  }

  /** Update lead. */
  async updateLead(leadId: string, dto: UpdateSocialLeadDto) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.checkoutSocialLead.findUnique({
          where: { id: leadId },
          select: {
            id: true,
            workspaceId: true,
            name: true,
            email: true,
            phone: true,
            cpf: true,
            enrichmentData: true,
            stepReached: true,
          },
        });

        if (!existing) {
          throw new NotFoundException('Lead social do checkout não encontrado.');
        }

        const normalizedPhone = normalizePhone(dto.phone) || existing.phone || null;
        const normalizedName = normalizeOptional(dto.name) || existing.name || null;
        const normalizedEmail = normalizeEmail(dto.email) || existing.email || null;
        const nextStep = Math.max(existing.stepReached, dto.stepReached || existing.stepReached);
        const mergedEnrichmentData = mergeLeadAddressSnapshot(existing.enrichmentData, dto);

        return {
          workspaceId: existing.workspaceId,
          normalizedPhone,
          normalizedName,
          normalizedEmail,
          updated: await tx.checkoutSocialLead.update({
            where: { id: leadId },
            data: {
              name: normalizedName,
              email: normalizedEmail,
              phone: normalizedPhone,
              cpf: normalizeOptional(dto.cpf) || existing.cpf || null,
              stepReached: nextStep,
              enrichmentData: mergedEnrichmentData,
            },
            select: {
              id: true,
              workspaceId: true,
              phone: true,
              cpf: true,
              stepReached: true,
              contactId: true,
            },
          }),
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );

    // Upsert contact outside the transaction
    const contactId = result.normalizedPhone
      ? await this.upsertContact({
          workspaceId: result.workspaceId,
          name: result.normalizedName,
          email: result.normalizedEmail,
          phone: result.normalizedPhone,
        })
      : null;

    // Update contactId if changed
    if (contactId && contactId !== result.updated.contactId) {
      await this.prisma.checkoutSocialLead.update({
        where: { id: leadId },
        data: { contactId },
        select: { id: true, workspaceId: true },
      });
    }

    return result.updated;
  }

  /** Mark converted from order. */
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
        workspaceId: true,
        status: true,
        convertedAt: true,
        convertedOrderId: true,
      },
    });
  }

  /** Sync lead contact. */
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

    await this.prisma.$transaction(
      async (tx) => {
        await tx.checkoutSocialLead.update({
          where: { id: lead.id },
          data: { contactId },
          select: { id: true, workspaceId: true },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );

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
    if (provider === 'google') {
      return CheckoutSocialProvider.GOOGLE;
    }
    if (provider === 'facebook') {
      return CheckoutSocialProvider.FACEBOOK;
    }
    return CheckoutSocialProvider.APPLE;
  }

  private serializeProvider(provider: CheckoutSocialProvider): CaptureSocialLeadDto['provider'] {
    if (provider === CheckoutSocialProvider.GOOGLE) {
      return 'google';
    }
    if (provider === CheckoutSocialProvider.FACEBOOK) {
      return 'facebook';
    }
    return 'apple';
  }

  private async verifySocialProvider(provider: CheckoutSocialProvider, dto: CaptureSocialLeadDto) {
    if (provider === CheckoutSocialProvider.FACEBOOK) {
      return this.facebookAuthService.verifyAccessToken(dto.accessToken || '', dto.userId);
    }
    if (provider === CheckoutSocialProvider.APPLE) {
      return this.appleAuthService.verifyCredential({
        identityToken: dto.identityToken,
        authorizationCode: dto.authorizationCode,
        redirectUri: dto.redirectUri,
        user: dto.user,
      });
    }
    return this.googleAuthService.verifyCredential(dto.credential || '');
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
    const phone = normalizePhone(input.phone);
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
        name: normalizeOptional(input.name),
        email: normalizeEmail(input.email),
        customFields: {
          checkoutSocialLead: true,
        },
      },
      update: {
        name: normalizeOptional(input.name) || undefined,
        email: normalizeEmail(input.email) || undefined,
      },
      select: { id: true },
    });

    return contact.id;
  }
}
