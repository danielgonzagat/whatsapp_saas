import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Workspace } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class WorkspaceService {
  private readonly providerSecret = process.env.PROVIDER_SECRET_KEY || '';

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

    // Sanitize sensíveis antes de mesclar (garante criptografia mesmo via patch genérico)
    const securePatch = { ...(patch || {}) };
    if (securePatch.meta?.token) {
      securePatch.meta = {
        ...securePatch.meta,
        token: this.encryptSecret(securePatch.meta.token),
      };
    }
    if (securePatch.evolution?.apiKey) {
      securePatch.evolution = {
        ...securePatch.evolution,
        apiKey: this.encryptSecret(securePatch.evolution.apiKey),
      };
    }
    if (securePatch.ultrawa?.apiKey) {
      securePatch.ultrawa = {
        ...securePatch.ultrawa,
        apiKey: this.encryptSecret(securePatch.ultrawa.apiKey),
      };
    }

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
  async setProvider(id: string, provider: string) {
    return this.updateSettings(id, { whatsappProvider: provider });
  }

  /**
   * Atualiza credenciais Meta API (manual)
   */
  async setMeta(id: string, token: string, phoneId: string) {
    return this.updateSettings(id, {
      meta: { token: this.encryptSecret(token), phoneId },
    });
  }

  /**
   * Atualiza credenciais Meta API (OAuth)
   */
  async setMetaCredentials(
    id: string,
    credentials: { token: string; phoneId: string; wabaId: string },
  ) {
    return this.updateSettings(id, {
      meta: {
        ...credentials,
        token: this.encryptSecret(credentials.token),
      },
    });
  }

  /**
   * Atualiza session do WPPConnect
   */
  async setWppSession(id: string, sessionId: string) {
    return this.updateSettings(id, { wpp: { sessionId } });
  }

  /**
   * Atualiza EvolutionAPI
   */
  async setEvolutionKey(id: string, apiKey: string) {
    return this.updateSettings(id, {
      evolution: { apiKey: this.encryptSecret(apiKey) },
    });
  }

  /**
   * UltraWA Key
   */
  async setUltraWAKey(id: string, apiKey: string) {
    return this.updateSettings(id, {
      ultrawa: { apiKey: this.encryptSecret(apiKey) },
    });
  }

  /**
   * Recriptografa segredos existentes (quando PROVIDER_SECRET_KEY for definido após dados já salvos).
   * Apenas criptografa valores que ainda não possuem prefixo "enc:".
   */
  async rotateProviderSecrets(id: string) {
    if (!this.providerSecret) {
      throw new Error(
        'PROVIDER_SECRET_KEY não configurado; não é possível recriptografar segredos.',
      );
    }

    const ws = await this.getWorkspace(id);
    const settings = (ws.providerSettings as any) || {};

    const next = { ...settings };

    if (next.meta?.token) {
      next.meta = {
        ...next.meta,
        token: this.encryptSecret(next.meta.token),
      };
    }
    if (next.evolution?.apiKey) {
      next.evolution = {
        ...next.evolution,
        apiKey: this.encryptSecret(next.evolution.apiKey),
      };
    }
    if (next.ultrawa?.apiKey) {
      next.ultrawa = {
        ...next.ultrawa,
        apiKey: this.encryptSecret(next.ultrawa.apiKey),
      };
    }

    return this.updateSettings(id, next);
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
  async updateAccountSettings(id: string, payload: {
    name?: string;
    phone?: string;
    timezone?: string;
    webhookUrl?: string;
    notifications?: Record<string, boolean>;
  }) {
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
   * Encontra workspace pelo phoneId Meta (Cloud API) salvo em providerSettings.meta.phoneId
   */
  async findByMetaPhoneId(phoneId: string) {
    if (!phoneId) return null;
    return this.prisma.workspace.findFirst({
      where: {
        providerSettings: {
          path: ['meta', 'phoneId'],
          equals: phoneId,
        },
      },
    });
  }

  /**
   * Converte o Workspace (Prisma) para o formato
   * esperado pelo WhatsAppEngine (UWE-Ω).
   */
  toEngineWorkspace(ws: Workspace): any {
    const settings = (ws.providerSettings as any) || {};

    const decode = (value: string | undefined) =>
      typeof value === 'string' ? this.decryptSecret(value) : value;

    return {
      id: ws.id,
      jitterMin: ws.jitterMin,
      jitterMax: ws.jitterMax,

      // Default agora é whatsapp-api (novo provider oficial)
      whatsappProvider: settings.whatsappProvider ?? 'whatsapp-api',

      meta: settings.meta
        ? { ...settings.meta, token: decode(settings.meta.token) }
        : { token: '', phoneId: '' },
      wpp: settings.wpp ?? { sessionId: '' },
      evolution: settings.evolution
        ? { ...settings.evolution, apiKey: decode(settings.evolution.apiKey) }
        : { apiKey: '' },
      ultrawa: settings.ultrawa
        ? { ...settings.ultrawa, apiKey: decode(settings.ultrawa.apiKey) }
        : { apiKey: '' },
    };
  }

  /**
   * Criptografa segredos de provedores usando PROVIDER_SECRET_KEY (AES-256-GCM).
   * Mantém valores originais se a chave não estiver configurada ou se já estiver criptografado.
   */
  private encryptSecret(value: string): string {
    if (!value) return value;
    if (!this.providerSecret) return value;
    if (value.startsWith('enc:')) return value;
    const key = createHash('sha256').update(this.providerSecret).digest(); // 32 bytes
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /**
   * Descriptografa segredos de provedores; se falhar, retorna o valor original.
   */
  private decryptSecret(value: string): string {
    if (!value) return value;
    if (!value.startsWith('enc:')) return value;
    if (!this.providerSecret) return value;
    try {
      const [, ivB64, tagB64, dataB64] = value.split(':');
      const key = createHash('sha256').update(this.providerSecret).digest();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivB64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return decrypted;
    } catch {
      return value;
    }
  }
}
