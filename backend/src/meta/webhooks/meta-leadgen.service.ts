import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaSdkService } from '../meta-sdk.service';
import { decryptMetaToken } from '../meta-token-crypto';

const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;
const NON_DIGIT_RE = /\D/g;

interface MetaLeadgenEntry {
  id?: string;
  time?: number;
  changes?: MetaLeadgenChange[];
}

interface MetaLeadgenChange {
  field?: string;
  value?: Record<string, unknown>;
}

interface MetaLeadField {
  name: string;
  values: string[];
}

@Injectable()
export class MetaLeadgenService {
  private readonly logger = new Logger(MetaLeadgenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSdk: MetaSdkService,
  ) {}

  async captureRealtimePageLeadgen(entry: MetaLeadgenEntry, workspaceId: string): Promise<void> {
    const leadgenChanges = Array.isArray(entry.changes)
      ? entry.changes.filter((change) => String(change?.field || '').trim() === 'leadgen')
      : [];

    if (leadgenChanges.length === 0) {
      return;
    }

    const connection = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: {
        accessToken: true,
        pageAccessToken: true,
        pageId: true,
        pageName: true,
      },
    });

    const accessToken =
      decryptMetaToken(connection?.pageAccessToken) ||
      decryptMetaToken(connection?.accessToken) ||
      '';
    const pageId = this.readText(entry.id) || String(connection?.pageId || '').trim() || null;
    const pageName = String(connection?.pageName || '').trim() || null;
    const eventTime = this.parseDate(entry.time);

    for (const change of leadgenChanges) {
      await this.captureSingleLeadgenChange({
        change,
        workspaceId,
        pageId,
        pageName,
        accessToken,
        eventTime,
      });
    }
  }

  private async captureSingleLeadgenChange(input: {
    change: MetaLeadgenChange;
    workspaceId: string;
    pageId: string | null;
    pageName: string | null;
    accessToken: string;
    eventTime: Date | null;
  }) {
    const webhookValue = this.readRecord(input.change.value);
    const leadgenId = this.readText(webhookValue.leadgen_id);
    if (!leadgenId) {
      this.logger.warn(
        `[Leadgen] Ignoring leadgen webhook without leadgen_id for ${input.workspaceId}`,
      );
      return;
    }

    let detailRecord: Record<string, unknown> = {};
    let failureReason: string | null = null;
    if (!input.accessToken) {
      failureReason = 'missing_meta_page_access_token';
    } else {
      try {
        detailRecord = await this.fetchLeadRecord(leadgenId, input.accessToken);
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'unknown_error';
        failureReason = `lead_fetch_failed:${message}`;
        this.logger.warn(
          `[Leadgen] Failed to fetch ${leadgenId} for ${input.workspaceId}: ${message}`,
        );
      }
    }

    const fieldData = this.normalizeFieldData(detailRecord.field_data);
    const firstName = this.pickFieldValue(fieldData, ['first_name', 'primeiro_nome']);
    const lastName = this.pickFieldValue(fieldData, ['last_name', 'sobrenome']);
    const fullName =
      this.pickFieldValue(fieldData, ['full_name', 'nome_completo', 'name', 'nome']) ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      null;
    const email = this.pickFieldValue(fieldData, ['email', 'e_mail']);
    const phone = this.normalizePhone(
      this.pickFieldValue(fieldData, [
        'phone_number',
        'phone',
        'telefone',
        'celular',
        'whatsapp',
      ]) || '',
    );

    const contactSync = await this.syncContact({
      workspaceId: input.workspaceId,
      phone,
      fullName,
      email,
    });

    const createdTime =
      this.parseDate(detailRecord.created_time) || this.parseDate(webhookValue.created_time);
    const formId =
      this.readText(detailRecord.form_id) || this.readText(webhookValue.form_id) || null;
    const pageId =
      this.readText(detailRecord.page_id) || this.readText(webhookValue.page_id) || input.pageId;
    const adId = this.readText(detailRecord.ad_id) || this.readText(webhookValue.ad_id) || null;
    const campaignId =
      this.readText(detailRecord.campaign_id) || this.readText(webhookValue.campaign_id) || null;

    const syncStatus = failureReason
      ? 'fetch_failed'
      : contactSync.contactId
        ? 'crm_synced'
        : phone
          ? 'captured'
          : 'missing_phone';
    const syncNotes = failureReason || contactSync.syncNotes;
    const processedAt = new Date();
    const rawPayload = this.toJsonValue({
      webhook: webhookValue,
      lead: detailRecord,
    });
    const safeFieldData = fieldData.length > 0 ? this.toJsonValue(fieldData) : undefined;

    await this.prisma.metaLeadCapture.upsert({
      where: {
        workspaceId_leadgenId: {
          workspaceId: input.workspaceId,
          leadgenId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        contactId: contactSync.contactId,
        leadgenId,
        source: 'facebook_leadgen',
        pageId,
        pageName: input.pageName,
        formId,
        adId,
        campaignId,
        createdTime,
        eventTime: input.eventTime,
        capturedAt: processedAt,
        fullName,
        firstName,
        lastName,
        email,
        phone,
        ...(safeFieldData ? { fieldData: safeFieldData } : {}),
        rawPayload,
        syncStatus,
        syncNotes,
        processedAt,
        failureReason,
      },
      update: {
        ...(contactSync.contactId ? { contactId: contactSync.contactId } : {}),
        ...(pageId ? { pageId } : {}),
        ...(input.pageName ? { pageName: input.pageName } : {}),
        ...(formId ? { formId } : {}),
        ...(adId ? { adId } : {}),
        ...(campaignId ? { campaignId } : {}),
        ...(createdTime ? { createdTime } : {}),
        ...(input.eventTime ? { eventTime: input.eventTime } : {}),
        ...(fullName ? { fullName } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(safeFieldData ? { fieldData: safeFieldData } : {}),
        rawPayload,
        syncStatus,
        syncNotes,
        processedAt,
        failureReason,
      },
    });
  }

  private async fetchLeadRecord(
    leadgenId: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.metaSdk.graphApiGet(
      leadgenId,
      {
        fields: 'id,created_time,field_data,form_id,page_id,ad_id,campaign_id',
      },
      accessToken,
    );

    if (response.error) {
      throw new Error(response.error.message);
    }

    return this.readRecord(response);
  }

  private async syncContact(input: {
    workspaceId: string;
    phone: string | null;
    fullName: string | null;
    email: string | null;
  }): Promise<{ contactId: string | null; syncNotes: string | null }> {
    if (!input.phone) {
      return {
        contactId: null,
        syncNotes: 'lead_without_phone_preserved_without_crm_contact',
      };
    }

    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: input.workspaceId,
          phone: input.phone,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        phone: input.phone,
        name: input.fullName || input.phone,
        email: input.email || undefined,
      },
      update: {
        ...(input.fullName ? { name: input.fullName } : {}),
        ...(input.email ? { email: input.email } : {}),
      },
      select: { id: true },
    });

    return {
      contactId: contact.id,
      syncNotes: null,
    };
  }

  private normalizeFieldData(rawFieldData: unknown): MetaLeadField[] {
    if (!Array.isArray(rawFieldData)) {
      return [];
    }

    return rawFieldData.flatMap((field): MetaLeadField[] => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) {
        return [];
      }
      const record = field as Record<string, unknown>;
      const name = this.readText(record.name) || '';
      if (!name) {
        return [];
      }

      const values = Array.isArray(record.values)
        ? record.values
            .map((value) => this.readText(value))
            .filter((value): value is string => Boolean(value))
        : [];

      return [{ name, values }];
    });
  }

  private pickFieldValue(fieldData: MetaLeadField[], names: string[]): string | null {
    const expected = new Set(names.map((name) => this.normalizeFieldName(name)));
    for (const field of fieldData) {
      if (!expected.has(this.normalizeFieldName(field.name))) {
        continue;
      }
      const firstValue = field.values.find((value) => value.trim().length > 0);
      if (firstValue) {
        return firstValue.trim();
      }
    }
    return null;
  }

  private normalizeFieldName(name: string): string {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(NON_ALPHANUMERIC_RE, '_')
      .replace(/^_+|_+$/g, '');
  }

  private normalizePhone(phone: string): string | null {
    const digits = String(phone || '').replace(NON_DIGIT_RE, '');
    return digits.length >= 8 ? digits : null;
  }

  private readText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value * 1000);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
