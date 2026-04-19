import { describe, expect, it } from 'vitest';

import {
  buildAppsIntegrationCards,
  type BillingWorkspaceStatus,
  type MetaIntegrationSnapshot,
  type WhatsAppIntegrationSnapshot,
} from './apps-integrations';

describe('buildAppsIntegrationCards', () => {
  it('marks WhatsApp and Meta as connected when live integrations exist', () => {
    const whatsapp: WhatsAppIntegrationSnapshot = {
      connected: true,
      phone: '+55 11 99999-0000',
      pushName: 'Kloel Sales',
    };
    const meta: MetaIntegrationSnapshot = {
      connected: true,
      pageName: 'Kloel Oficial',
      instagramUsername: 'kloel',
      phoneNumber: '+55 11 99999-0000',
    };

    const cards = buildAppsIntegrationCards({
      whatsapp,
      meta,
      subscriptionStatus: 'active',
      creditsBalance: 240,
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'whatsapp',
          connected: true,
          cta: 'Abrir inbox',
          status: expect.stringContaining('WhatsApp oficial ativo'),
        }),
        expect.objectContaining({
          key: 'meta',
          connected: true,
          cta: 'Abrir anúncios',
          status: expect.stringContaining('Kloel Oficial'),
        }),
        expect.objectContaining({
          key: 'billing',
          connected: true,
          status: expect.stringContaining('Plano ativo'),
        }),
      ]),
    );
  });

  it('turns pending and disconnected integrations into actionable cards', () => {
    const whatsapp: WhatsAppIntegrationSnapshot = {
      connected: false,
      authUrl: 'https://www.facebook.com/dialog/oauth',
      status: 'connection_incomplete',
    };
    const meta: MetaIntegrationSnapshot = {
      connected: true,
      tokenExpired: true,
      pageName: 'Kloel Oficial',
    };

    const cards = buildAppsIntegrationCards({
      whatsapp,
      meta,
      subscriptionStatus: 'expired',
      creditsBalance: 0,
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'whatsapp',
          connected: false,
          cta: 'Concluir conexão',
          status: 'Conexão pendente',
        }),
        expect.objectContaining({
          key: 'meta',
          connected: false,
          cta: 'Reconectar Meta',
          status: 'Token expirado',
        }),
        expect.objectContaining({
          key: 'billing',
          connected: false,
          status: 'Plano expirado',
        }),
      ]),
    );
  });

  it('keeps internal CRM card available even when external integrations are absent', () => {
    const cards = buildAppsIntegrationCards({
      whatsapp: null,
      meta: null,
      subscriptionStatus: 'none' satisfies BillingWorkspaceStatus,
      creditsBalance: 0,
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'crm',
          connected: true,
          cta: 'Abrir configurações',
          status: 'Disponível',
        }),
      ]),
    );
  });
});
