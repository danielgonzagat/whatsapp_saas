'use client';

import { kloelT } from '@/lib/i18n/t';
import { AlertTriangle, ArrowRight, Info, Zap } from 'lucide-react';
import Link from 'next/link';
import { SettingsCard, SettingsHeader, SettingsNotice } from './contract';

/** Legacy payment providers (Asaas, MercadoPago, PIX) migration notice section. */
export function BillingLegacyProvidersSection() {
  return (
    <SettingsCard>
      <SettingsHeader
        title={kloelT(`Provedores de pagamento legados`)}
        description={kloelT(
          `Os provedores de pagamento antigos (Asaas, MercadoPago, PIX externo e links de pagamento) foram migrados para Stripe Connect ou descontinuados.`,
        )}
      />

      <div className="space-y-3">
        <SettingsNotice tone="info">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {kloelT(`Asaas — Migrado para Stripe Connect`)}
              </p>
              <p className="mt-1 text-xs opacity-85">
                {kloelT(
                  `A integracao com Asaas foi migrada para Stripe Connect. Gerencie suas contas de recebimento e saques diretamente no painel Kloel.`,
                )}
              </p>
              <Link
                href="/settings?section=billing"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:opacity-80"
              >
                {kloelT(`Ver conta de recebimento`)}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </SettingsNotice>

        <SettingsNotice tone="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{kloelT(`MercadoPago — Descontinuado`)}</p>
              <p className="mt-1 text-xs opacity-85">
                {kloelT(
                  `MercadoPago foi descontinuado. Use Stripe para receber pagamentos dos seus clientes. O Stripe oferece checkout, PIX, boleto e cartao de credito.`,
                )}
              </p>
            </div>
          </div>
        </SettingsNotice>

        <SettingsNotice tone="neutral">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{kloelT(`PIX e Links de Pagamento Externos`)}</p>
              <p className="mt-1 text-xs opacity-85">
                {kloelT(
                  `PIX agora e processado via Stripe. Configure em Configuracoes > Pagamentos. Links de pagamento externos sao gerados automaticamente pelo Stripe Checkout.`,
                )}
              </p>
            </div>
          </div>
        </SettingsNotice>
      </div>
    </SettingsCard>
  );
}
