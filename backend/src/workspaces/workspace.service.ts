import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Workspace } from '@prisma/client';

@Injectable()
export class WorkspaceService {
  constructor(private prisma: PrismaService) {}

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
    const currentSettings = ws.providerSettings as any;
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
    const current = (ws.providerSettings as any) || {};
    const securePatch = { ...(patch || {}) };

    const merged = {
      ...current,
      ...securePatch,
      autopilot: {
        ...(current.autopilot || {}),
        ...(securePatch?.autopilot || {}),
      },
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
    return this.updateSettings(id, { whatsappProvider: 'whatsapp-api' });
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
   * Retorna status dos canais adicionais (email/telegram) se configurados no providerSettings.
   */
  async getChannels(id: string) {
    const ws = await this.getWorkspace(id);
    const settings = (ws.providerSettings as any) || {};
    return {
      whatsapp: true,
      email: !!settings.email?.enabled,
      telegram: !!settings.telegram?.enabled,
    };
  }

  async setChannels(id: string, email?: boolean, telegram?: boolean) {
    const ws = await this.getWorkspace(id);
    const settings = (ws.providerSettings as any) || {};
    return this.prisma.workspace.update({
      where: { id },
      data: {
        providerSettings: {
          ...settings,
          email: { ...(settings.email || {}), enabled: !!email },
          telegram: { ...(settings.telegram || {}), enabled: !!telegram },
        },
      },
    });
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
      notifications?: Record<string, boolean>;
    },
  ) {
    const ws = await this.getWorkspace(id);
    const settings = (ws.providerSettings as any) || {};

    const data: any = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.phone !== undefined) data.phone = payload.phone;
    if (payload.timezone !== undefined) data.timezone = payload.timezone;

    const nextSettings = {
      ...settings,
      webhookUrl: payload.webhookUrl ?? settings.webhookUrl,
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
      whatsappProvider: 'whatsapp-api',
    };
  }
}
