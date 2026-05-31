import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { CheckoutSocialLeadStatus, CheckoutSocialProvider } from '@prisma/client';
import { AppleAuthService } from '../auth/apple-auth.service';
import { FacebookAuthService } from '../auth/facebook-auth.service';
import { GoogleAuthService } from '../auth/google-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { crmQueue } from '../queue/queue';
import { CaptureSocialLeadDto } from './dto/capture-social-lead.dto';
import { UpdateSocialLeadDto } from './dto/update-social-lead.dto';
import { findLatestCandidate as companionFindLatestCandidate } from './checkout-social-lead.candidate';
import {
  mergeGooglePeopleProfile,
  normalizeEmail,
  normalizeOptional,
} from './checkout-social-lead.util';
import { digitsOrNull as normalizePhone } from '../common/phone';
import { buildLeadPrefill, parseProvider } from './checkout-social-lead.helpers';
import type { CheckoutSocialLeadPrefill } from './checkout-social-lead.helpers';
import {
  buildCaptureLeadCreateData,
  buildCaptureLeadResponse,
  buildContactUpsertArgs,
  buildConvertedUpdateData,
  buildLeadUpdateData,
  buildPrefillOrFilter,
  computeUpdatedLeadFields,
  type CheckoutPlanContext,
} from './checkout-social-lead.service.helpers';

type ConversionInput = {
  workspaceId: string;
  orderId: string;
  capturedLeadId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  deviceFingerprint?: string | null;
};

/** Checkout social lead service. */
@Injectable()
export class CheckoutSocialLeadService {
  private readonly logger = StructuredLogger.from(CheckoutSocialLeadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly facebookAuthService: FacebookAuthService,
    private readonly appleAuthService: AppleAuthService,
  ) {}

  /** Capture lead. */
  async captureLead(dto: CaptureSocialLeadDto) {
    const plan = await this.resolvePlanBySlug(dto.slug);
    const provider = parseProvider(dto.provider);

    const verified = await this.verifySocialProvider(provider, dto);
    const lead = await this.prisma.checkoutSocialLead.create({
      data: buildCaptureLeadCreateData(plan, provider, verified, dto),
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

    return buildCaptureLeadResponse(lead, dto.provider);
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
        OR: buildPrefillOrFilter(plan.slug, normalizedCheckoutCode),
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

    return buildLeadPrefill(lead);
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

    return buildLeadPrefill(updatedLead.result);
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

        const fields = computeUpdatedLeadFields(existing, dto);

        return {
          workspaceId: fields.workspaceId,
          normalizedPhone: fields.normalizedPhone,
          normalizedName: fields.normalizedName,
          normalizedEmail: fields.normalizedEmail,
          updated: await tx.checkoutSocialLead.update({
            where: { id: leadId },
            data: buildLeadUpdateData(fields),
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
      : await companionFindLatestCandidate(this.prisma, input);

    if (!target) {
      return null;
    }

    return this.prisma.checkoutSocialLead.update({
      where: { id: target.id },
      data: buildConvertedUpdateData(input.orderId, CheckoutSocialLeadStatus.CONVERTED),
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

  private async verifySocialProvider(provider: CheckoutSocialProvider, dto: CaptureSocialLeadDto) {
    if (provider === CheckoutSocialProvider.FACEBOOK) {
      return this.facebookAuthService.verifyAccessToken(dto.accessToken || '', dto.userId);
    }
    if (provider === CheckoutSocialProvider.APPLE) {
      return this.appleAuthService.verifyCredential({
        ...(dto.identityToken !== undefined ? { identityToken: dto.identityToken } : {}),
        ...(dto.authorizationCode !== undefined
          ? { authorizationCode: dto.authorizationCode }
          : {}),
        ...(dto.redirectUri !== undefined ? { redirectUri: dto.redirectUri } : {}),
        ...(dto.user !== undefined ? { user: dto.user } : {}),
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

  private async upsertContact(input: {
    workspaceId: string;
    name?: string | null;
    email?: string | null;
    phone: string;
  }) {
    const args = buildContactUpsertArgs(input);
    if (!args) {
      return null;
    }

    const { workspaceId } = input;
    const contact = await this.prisma.contact.upsert({
      ...args,
      where: { workspaceId_phone: { workspaceId, phone: args.where.workspaceId_phone.phone } },
      select: { id: true },
    });

    return contact.id;
  }
}
