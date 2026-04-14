import { Injectable, NotFoundException } from '@nestjs/common';
import { Workspace } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizeWhatsAppProvider,
  resolveDefaultWhatsAppProvider,
} from '../whatsapp/providers/provider-env';

@Injectable()
export class WorkspaceService {
  constructor(private prisma: PrismaService) {}

  private getDefaultWhatsAppProvider(): 'meta-cloud' | 'whatsapp-api' {
    return resolveDefaultWhatsAppProvider();
  }

  /**
   * Obtém workspace (ou cria se não existir)
   */
  async getWorkspace(id: string): Promise<Workspace> {
    const ws = await this.prisma.workspace.findUnique({ where: { id } });
    if (!ws) {
      throw new NotFoundException('Workspace não encontrado');
    }
    return ws;
  }

  private async updateSettings(id: string, patch: any) {
    const ws = await this.getWorkspace(id);
    const currentSettings = ws.providerSettings as Record<string, any>;
    const newSettings = { ...currentSettings, ...patch };

    return this.prisma.workspace.update({
      where: { id },
      data: { providerSettings: newSettings },
    });
  }

  /**
   * Atualiza providerSettings com merge superficial e merge especial de autopilot.
   * Útil para o front salvar configurações pontuais (ex: conversionFlowId).
   */
  async patchSettings(id: string, patch: any) {
    const ws = await this.getWorkspace(id);
    const current = (ws.providerSettings as Record<string, any>) || {};
    const securePatch = { ...(patch || {}) };
    const mergedAutonomy = {
      ...(current.autonomy || {}),
      ...(securePatch?.autonomy || {}),
    };
    const autopilotEnabledPatch =
      typeof securePatch?.autopilot?.enabled === 'boolean'
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
        ...(securePatch?.autopilot || {}),
        ...(typeof synchronizedAutopilotEnabled === 'boolean'
          ? { enabled: synchronizedAutopilotEnabled }
          : {}),
      },
      ...(securePatch?.autonomy || current?.autonomy ? { autonomy: mergedAutonomy } : {}),
    };
    return this.prisma.workspace.update({
      where: { id },
      data: { providerSettings: merged },
    });
  }

  /**
   * Atualiza provedor
   */
  async setProvider(id: string, _provider: string) {
    const normalized = normalizeWhatsAppProvider(_provider) || this.getDefaultWhatsAppProvider();
    return this.updateSettings(id, { whatsappProvider: normalized });
  }

  /**
   * Ajusta jitter humano
   */
  async setJitter(id: string, min: number, max: number) {
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
    const settings = (ws.providerSettings as Record<string, any>) || {};
    return {
      whatsapp: true,
      email: !!settings.email?.enabled,
    };
  }

  async setChannels(id: string, email?: boolean) {
    const ws = await this.getWorkspace(id);
    const settings = (ws.providerSettings as Record<string, any>) || {};
    return this.prisma.workspace.update({
      where: { id },
      data: {
        providerSettings: {
          ...settings,
          email: { ...(settings.email || {}), enabled: !!email },
        },
      },
    });
  }

  async getAccountSettings(id: string) {
    const ws = await this.getWorkspace(id);
    const settings = (ws.providerSettings as Record<string, any>) || {};
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
    const ws = await this.getWorkspace(id);
    const settings = (ws.providerSettings as Record<string, any>) || {};

    const data: any = {};
    if (payload.name !== undefined) data.name = payload.name;

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
        ...(settings.notifications || {}),
        ...(payload.notifications || {}),
      },
    };

    return this.prisma.workspace.update({
      where: { id },
      data: {
        ...data,
        providerSettings: nextSettings,
      },
    });
  }

  /**
   * Converte o Workspace (Prisma) para o formato
   * esperado pelo WhatsAppEngine (UWE-Ω).
   */
  toEngineWorkspace(ws: Workspace): any {
    return {
      id: ws.id,
      jitterMin: ws.jitterMin,
      jitterMax: ws.jitterMax,
      whatsappProvider:
        normalizeWhatsAppProvider((ws.providerSettings as Record<string, any>)?.whatsappProvider) ||
        this.getDefaultWhatsAppProvider(),
    };
  }
}
