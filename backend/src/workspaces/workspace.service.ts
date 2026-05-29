import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Workspace } from '@prisma/client';
import { CacheService } from '../common/cache/cache.service';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings } from '../marketing/channels/whatsapp/provider-settings.types';
import {
  normalizeWhatsAppProvider,
  resolveDefaultWhatsAppProvider,
} from '../marketing/channels/whatsapp/providers/provider-env';

type SettingsPatch = Record<string, unknown>;
type EmailSubSettings = Record<string, unknown> & { enabled?: boolean };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merge two plain objects. Arrays and scalars in `patch` replace `base`.
 * Nested plain objects are merged recursively. Undefined keys in `patch` are skipped.
 */
function deepMergePlainObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) {
      continue;
    }
    const baseValue = out[key];
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      out[key] = deepMergePlainObjects(baseValue, patchValue);
    } else {
      out[key] = patchValue;
    }
  }
  return out;
}

const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTimeHHmm(value: unknown): value is string {
  return typeof value === 'string' && TIME_HHMM_RE.test(value);
}

function toMinutes(time: string): number {
  const parts = time.split(':');
  const hours = Number(parts[0] ?? '0');
  const minutes = Number(parts[1] ?? '0');
  return hours * 60 + minutes;
}

/** Workspace service. */
@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    this.logger.debug?.(`WorkspaceService initialized`);
  }

  private getDefaultWhatsAppProvider(): 'meta-cloud' | 'whatsapp-api' {
    return resolveDefaultWhatsAppProvider();
  }

  /**
   * Obtém workspace (ou cria se não existir)
   */
  async getWorkspace(id: string): Promise<Workspace> {
    return this.cache.wrap(
      `cache:workspace:${id}`,
      async () => {
        const ws = await this.prisma.workspace.findUnique({ where: { id } });
        if (!ws) {
          throw new NotFoundException('Workspace não encontrado');
        }
        return ws;
      },
      { ttl: 30 },
    );
  }

  /** Invalida cache do workspace após mutações. */
  private async invalidateWorkspaceCache(id: string): Promise<void> {
    await this.cache.del(`cache:workspace:${id}`);
  }

  /** Delete workspace and all cascaded data. */
  async deleteWorkspace(id: string): Promise<void> {
    await this.invalidateWorkspaceCache(id);
    await this.prisma.workspace.delete({ where: { id } });
  }

  private async mergeSettingsShallow(id: string, patch: Record<string, unknown>) {
    const ws = await this.getWorkspace(id);
    const currentSettings = asProviderSettings(ws.providerSettings);
    const newSettings = { ...currentSettings, ...patch };

    return this.prisma.workspace.update({
      where: { id },
      data: { providerSettings: toPrismaJsonValue(newSettings) },
    });
  }

  /**
   * Atualiza providerSettings com merge superficial e merge especial de autopilot.
   * Útil para o front salvar configurações pontuais (ex: conversionFlowId).
   */
  async patchSettings(id: string, patch: Record<string, unknown>) {
    const ws = await this.getWorkspace(id);
    const current = asProviderSettings(ws.providerSettings);
    const securePatch = { ...(patch || {}) } as SettingsPatch & {
      autonomy?: { mode?: string } & Record<string, unknown>;
      autopilot?: { enabled?: boolean } & Record<string, unknown>;
    };
    const mergedAutonomy = {
      ...(current.autonomy || {}),
      ...(securePatch.autonomy || {}),
    };
    const autopilotEnabledPatch =
      typeof securePatch.autopilot?.enabled === 'boolean'
        ? securePatch.autopilot.enabled
        : undefined;
    const autonomyModePatch =
      typeof mergedAutonomy?.mode === 'string'
        ? String(mergedAutonomy.mode).toUpperCase()
        : undefined;
    const synchronizedAutopilotEnabled =
      typeof autopilotEnabledPatch === 'boolean'
        ? autopilotEnabledPatch
        : autonomyModePatch
          ? ['LIVE', 'BACKLOG', 'FULL'].includes(autonomyModePatch)
          : current?.autopilot?.enabled;

    const merged = {
      ...current,
      ...securePatch,
      autopilot: {
        ...(current.autopilot || {}),
        ...(securePatch.autopilot || {}),
        ...(typeof synchronizedAutopilotEnabled === 'boolean'
          ? { enabled: synchronizedAutopilotEnabled }
          : {}),
      },
      ...(securePatch.autonomy || current?.autonomy ? { autonomy: mergedAutonomy } : {}),
    };
    return this.prisma.workspace.update({
      where: { id },
      data: { providerSettings: toPrismaJsonValue(merged) },
    });
  }

  /**
   * Atualiza provedor
   */
  async setProvider(id: string, _provider: string) {
    const normalized = normalizeWhatsAppProvider(_provider) || this.getDefaultWhatsAppProvider();
    await this.invalidateWorkspaceCache(id);
    return this.mergeSettingsShallow(id, { whatsappProvider: normalized });
  }

  /**
   * Ajusta jitter humano
   */
  async setJitter(id: string, min: number, max: number) {
    await this.invalidateWorkspaceCache(id);
    return this.prisma.workspace.update({
      where: { id },
      data: { jitterMin: min, jitterMax: max },
    });
  }

  /**
   * Retorna status dos canais adicionais (email) se configurados no providerSettings.
   */
  async getChannels(id: string) {
    const ws = await this.getWorkspace(id);
    const settings = asProviderSettings(ws.providerSettings);
    return {
      whatsapp: true,
      email: !!(settings.email as EmailSubSettings | undefined)?.enabled,
    };
  }

  /** Set channels. */
  async setChannels(id: string, email?: boolean) {
    await this.invalidateWorkspaceCache(id);
    const ws = await this.getWorkspace(id);
    const settings = asProviderSettings(ws.providerSettings);
    return this.prisma.workspace.update({
      where: { id },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          email: { ...((settings.email as EmailSubSettings) || {}), enabled: !!email },
        }),
      },
    });
  }

  /** Get account settings. */
  async getAccountSettings(id: string) {
    const ws = await this.getWorkspace(id);
    const settings = asProviderSettings(ws.providerSettings);
    return {
      id: ws.id,
      name: ws.name,
      phone: settings.phone || null,
      timezone: settings.timezone || null,
      webhookUrl: settings.webhookUrl || null,
      website: settings.website || null,
      language: settings.language || null,
      dateFormat: settings.dateFormat || null,
      notifications: settings.notifications || {},
    };
  }

  /**
   * Atualiza informações gerais do workspace e preferências leves.
   */
  async updateAccountSettings(
    id: string,
    payload: {
      name?: string;
      phone?: string;
      timezone?: string;
      webhookUrl?: string;
      website?: string;
      language?: string;
      dateFormat?: string;
      role?: string;
      notifications?: Record<string, boolean>;
    },
  ) {
    await this.invalidateWorkspaceCache(id);
    const ws = await this.getWorkspace(id);
    const settings = asProviderSettings(ws.providerSettings);

    const data: Record<string, unknown> = {};
    if (payload.name !== undefined) {
      data.name = payload.name;
    }

    const nextSettings = {
      ...settings,
      phone: payload.phone ?? settings.phone,
      timezone: payload.timezone ?? settings.timezone,
      website: payload.website ?? settings.website,
      language: payload.language ?? settings.language,
      dateFormat: payload.dateFormat ?? settings.dateFormat,
      webhookUrl: payload.webhookUrl ?? settings.webhookUrl,
      role: payload.role ?? settings.role,
      notifications: {
        ...((settings.notifications as Record<string, boolean>) || {}),
        ...(payload.notifications || {}),
      },
    };

    return this.prisma.workspace.update({
      where: { id },
      data: {
        ...data,
        providerSettings: toPrismaJsonValue(nextSettings),
      },
    });
  }

  /**
   * Converte o Workspace (Prisma) para o formato
   * esperado pelo WhatsAppEngine (UWE-Ω).
   */
  toEngineWorkspace(ws: Workspace): {
    id: string;
    jitterMin: number;
    jitterMax: number;
    whatsappProvider: string;
  } {
    return {
      id: ws.id,
      jitterMin: ws.jitterMin,
      jitterMax: ws.jitterMax,
      whatsappProvider:
        normalizeWhatsAppProvider(asProviderSettings(ws.providerSettings)?.whatsappProvider) ||
        this.getDefaultWhatsAppProvider(),
    };
  }

  async setGlobalPriorOptOut(id: string, optOut: boolean) {
    await this.invalidateWorkspaceCache(id);
    return this.prisma.workspace.update({
      where: { id },
      data: { globalPriorOptOut: optOut },
    });
  }

  async getGlobalPriorOptOut(id: string): Promise<boolean> {
    const ws = await this.getWorkspace(id);
    return ws.globalPriorOptOut;
  }

  /**
   * Atualiza informações de negócio do workspace (nome + businessInfo).
   * K30 capability: save_business_info.
   */
  async updateInfo(
    workspaceId: string,
    dto: { name?: string; businessType?: string; cnpj?: string },
  ): Promise<Workspace> {
    await this.invalidateWorkspaceCache(workspaceId);
    const ws = await this.getWorkspace(workspaceId);
    const settings = asProviderSettings(ws.providerSettings);
    const currentBusinessInfo =
      (settings.businessInfo as Record<string, unknown> | undefined) || {};

    const nextBusinessInfo: Record<string, unknown> = { ...currentBusinessInfo };
    if (dto.businessType !== undefined) {
      nextBusinessInfo.businessType = dto.businessType;
    }
    if (dto.cnpj !== undefined) {
      nextBusinessInfo.cnpj = dto.cnpj;
    }

    const data: Record<string, unknown> = {
      providerSettings: toPrismaJsonValue({
        ...settings,
        businessInfo: nextBusinessInfo,
      }),
    };
    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: data as never,
    });
  }

  /**
   * Atualiza providerSettings com deep merge (mantém chaves aninhadas existentes).
   * K30 capability: update_workspace_settings.
   */
  async updateSettings(workspaceId: string, dto: Record<string, unknown>): Promise<Workspace> {
    await this.invalidateWorkspaceCache(workspaceId);
    const ws = await this.getWorkspace(workspaceId);
    const current = asProviderSettings(ws.providerSettings);
    const merged = deepMergePlainObjects(current, dto || {});

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: toPrismaJsonValue(merged) },
    });
  }

  /**
   * Define horário comercial. Armazena em providerSettings.businessHours.
   * K30 capability: set_business_hours.
   */
  async setHours(
    workspaceId: string,
    dto: { hours: Array<{ dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; open: string; close: string }> },
  ): Promise<{ updated: true }> {
    const hours = Array.isArray(dto?.hours) ? dto.hours : [];
    for (const entry of hours) {
      if (!Number.isInteger(entry?.dayOfWeek) || entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
        throw new Error(`Invalid dayOfWeek: ${entry?.dayOfWeek}`);
      }
      if (!isValidTimeHHmm(entry?.open) || !isValidTimeHHmm(entry?.close)) {
        throw new Error(
          `Invalid time format (expected HH:mm): open=${entry?.open} close=${entry?.close}`,
        );
      }
      if (toMinutes(entry.open) >= toMinutes(entry.close)) {
        throw new Error(`open must be before close (got ${entry.open}-${entry.close})`);
      }
    }

    await this.invalidateWorkspaceCache(workspaceId);
    const ws = await this.getWorkspace(workspaceId);
    const settings = asProviderSettings(ws.providerSettings);

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          businessHours: hours,
        }),
      },
    });
    return { updated: true };
  }

  /**
   * Define política de vendas/reembolso/termos. Armazena em providerSettings.salesPolicy.
   * K30 capability: set_sales_policy.
   */
  async setPolicy(
    workspaceId: string,
    dto: { refundPolicy?: string; salesPolicy?: string; termsUrl?: string },
  ): Promise<{ updated: true }> {
    await this.invalidateWorkspaceCache(workspaceId);
    const ws = await this.getWorkspace(workspaceId);
    const settings = asProviderSettings(ws.providerSettings);
    const currentPolicy = (settings.salesPolicy as Record<string, unknown> | undefined) || {};

    const nextPolicy: Record<string, unknown> = { ...currentPolicy };
    if (dto?.refundPolicy !== undefined) {
      nextPolicy.refundPolicy = dto.refundPolicy;
    }
    if (dto?.salesPolicy !== undefined) {
      nextPolicy.salesPolicy = dto.salesPolicy;
    }
    if (dto?.termsUrl !== undefined) {
      nextPolicy.termsUrl = dto.termsUrl;
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          salesPolicy: nextPolicy,
        }),
      },
    });
    return { updated: true };
  }

  /**
   * Armazena preferência de tema (light|dark) no providerSettings.ui.
   * Tema inválido retorna erro sem alterar workspace.
   */
  async updateThemePreference(
    workspaceId: string,
    theme: 'light' | 'dark',
  ): Promise<{ theme: string }> {
    await this.invalidateWorkspaceCache(workspaceId);
    const ws = await this.getWorkspace(workspaceId);
    const settings = asProviderSettings(ws.providerSettings);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          ui: { ...((settings.ui as Record<string, unknown>) || {}), theme },
        }),
      },
    });
    return { theme };
  }
}
