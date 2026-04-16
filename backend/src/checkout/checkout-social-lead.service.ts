import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CheckoutSocialLeadStatus, CheckoutSocialProvider, Prisma } from '@prisma/client';
import { GoogleAuthService } from '../auth/google-auth.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { crmQueue } from '../queue/queue';
import { PrismaService } from '../prisma/prisma.service';
import { CaptureSocialLeadDto } from './dto/capture-social-lead.dto';
import { UpdateSocialLeadDto } from './dto/update-social-lead.dto';

const D_RE = /\D/g;

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

  async getLeadPrefill(input: {
    slug: string;
    checkoutCode?: string | null;
    deviceFingerprint?: string | null;
  }): Promise<CheckoutSocialLeadPrefill | null> {
    const normalizedSlug = this.normalizeOptional(input.slug);
    const fingerprint = this.normalizeOptional(input.deviceFingerprint);
    if (!normalizedSlug || !fingerprint) {
      return null;
    }

    const plan = await this.resolvePlanBySlug(normalizedSlug);
    const normalizedCheckoutCode = this.normalizeOptional(input.checkoutCode);
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

    const address = this.extractAddressFromEnrichment(lead.enrichmentData);

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

  async hydrateGoogleProfile(leadId: string, accessToken: string) {
    const lead = await this.prisma.checkoutSocialLead.findUnique({
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
      throw new ServiceUnavailableException('Escopos adicionais disponíveis apenas para Google.');
    }

    const peopleProfile = await this.googleAuthService.fetchPeopleProfile(accessToken);
    const normalizedLeadEmail = this.normalizeEmail(lead.email);
    const normalizedProfileEmail = this.normalizeEmail(peopleProfile.email);

    if (
      normalizedLeadEmail &&
      normalizedProfileEmail &&
      normalizedLeadEmail !== normalizedProfileEmail
    ) {
      this.logger.warn(
        `google_people_email_mismatch: ${JSON.stringify({
          leadId,
          leadEmail: normalizedLeadEmail,
          peopleEmail: normalizedProfileEmail,
        })}`,
      );
      throw new UnauthorizedException('Conta Google divergente da identidade já capturada.');
    }

    const normalizedPhone = this.normalizePhone(peopleProfile.phone) || lead.phone || null;
    const mergedEnrichmentData = this.mergeGooglePeopleProfile(lead.enrichmentData, peopleProfile);

    const updatedLead = await this.prisma.checkoutSocialLead.update({
      where: { id: lead.id },
      data: {
        phone: normalizedPhone,
        enrichmentData: mergedEnrichmentData,
      },
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

    if (normalizedPhone) {
      await this.syncLeadContact(updatedLead.id);
    }

    const address = this.extractAddressFromEnrichment(updatedLead.enrichmentData);

    return {
      leadId: updatedLead.id,
      provider: this.serializeProvider(updatedLead.provider),
      name: updatedLead.name,
      email: updatedLead.email,
      avatarUrl: updatedLead.avatarUrl,
      deviceFingerprint: updatedLead.deviceFingerprint,
      phone: updatedLead.phone,
      cpf: updatedLead.cpf,
      cep: address.cep,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      complement: address.complement,
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
        enrichmentData: true,
        stepReached: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Lead social do checkout não encontrado.');
    }

    const normalizedPhone = this.normalizePhone(dto.phone) || existing.phone || null;
    const normalizedName = this.normalizeOptional(dto.name) || existing.name || null;
    const normalizedEmail = this.normalizeEmail(dto.email) || existing.email || null;
    const nextStep = Math.max(existing.stepReached, dto.stepReached || existing.stepReached);
    const mergedEnrichmentData = this.mergeLeadAddressSnapshot(existing.enrichmentData, dto);
    const contactId = normalizedPhone
      ? await this.upsertContact({
          workspaceId: existing.workspaceId,
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
        })
      : null;

    return this.prisma.checkoutSocialLead.update({
      where: { id: leadId },
      data: {
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        cpf: this.normalizeOptional(dto.cpf) || existing.cpf || null,
        stepReached: nextStep,
        enrichmentData: mergedEnrichmentData,
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

  private serializeProvider(provider: CheckoutSocialProvider): CaptureSocialLeadDto['provider'] {
    if (provider === CheckoutSocialProvider.GOOGLE) return 'google';
    if (provider === CheckoutSocialProvider.FACEBOOK) return 'facebook';
    return 'apple';
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
    const digits = String(value || '').replace(D_RE, '');
    return digits || null;
  }

  private extractAddressFromEnrichment(value: Prisma.JsonValue | null) {
    const root = this.readJsonObject(value);
    const nestedAddress = this.readJsonObject(root?.address);
    const addressSource = nestedAddress || root;

    return {
      cep: this.readFirstString(addressSource, [
        'cep',
        'zip',
        'zipCode',
        'zipcode',
        'postalCode',
        'addressZip',
      ]),
      street: this.readFirstString(addressSource, [
        'street',
        'logradouro',
        'addressStreet',
        'addressLine1',
        'line1',
        'address',
      ]),
      number: this.readFirstString(addressSource, ['number', 'addressNumber', 'numero']),
      neighborhood: this.readFirstString(addressSource, ['neighborhood', 'bairro', 'district']),
      city: this.readFirstString(addressSource, ['city', 'cidade', 'addressCity']),
      state: this.readFirstString(addressSource, ['state', 'uf', 'estado', 'addressState']),
      complement: this.readFirstString(addressSource, [
        'complement',
        'complemento',
        'addressComplement',
        'line2',
      ]),
    };
  }

  private mergeLeadAddressSnapshot(
    current: Prisma.JsonValue | null,
    dto: UpdateSocialLeadDto,
  ): Prisma.InputJsonValue | undefined {
    const addressEntries = Object.entries({
      cep: this.normalizeOptional(dto.cep),
      street: this.normalizeOptional(dto.street),
      number: this.normalizeOptional(dto.number),
      neighborhood: this.normalizeOptional(dto.neighborhood),
      city: this.normalizeOptional(dto.city),
      state: this.normalizeOptional(dto.state),
      complement: this.normalizeOptional(dto.complement),
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    );

    if (addressEntries.length === 0) {
      return undefined;
    }

    const root = this.readJsonObject(current) || {};
    const address = this.readJsonObject(root.address) || {};

    return {
      ...root,
      address: {
        ...address,
        ...Object.fromEntries(addressEntries),
      },
    };
  }

  private mergeGooglePeopleProfile(
    current: Prisma.JsonValue | null,
    profile: Awaited<ReturnType<GoogleAuthService['fetchPeopleProfile']>>,
  ): Prisma.InputJsonValue {
    const root = this.readJsonObject(current) || {};
    const address = this.readJsonObject(root.address) || {};
    const providerProfile = this.readJsonObject(root.googleProfile) || {};

    return {
      ...root,
      googleProfile: {
        ...providerProfile,
        email: profile.email,
        phone: profile.phone,
      },
      address: {
        ...address,
        street: this.normalizeOptional(profile.address?.street) || address.street || null,
        city: this.normalizeOptional(profile.address?.city) || address.city || null,
        state: this.normalizeOptional(profile.address?.state) || address.state || null,
        postalCode:
          this.normalizeOptional(profile.address?.postalCode) || address.postalCode || null,
        countryCode:
          this.normalizeOptional(profile.address?.countryCode) || address.countryCode || null,
        formattedValue:
          this.normalizeOptional(profile.address?.formattedValue) || address.formattedValue || null,
      },
    };
  }

  private readJsonObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    return value as Record<string, Prisma.JsonValue>;
  }

  private readFirstString(
    value: Record<string, Prisma.JsonValue> | null,
    keys: readonly string[],
  ): string | null {
    if (!value) return null;

    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === 'string') {
        const normalized = this.normalizeOptional(candidate);
        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  }

  private toJsonValue(value: Record<string, string | boolean | null>): Prisma.InputJsonValue {
    return value;
  }
}
