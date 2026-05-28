'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { CreditCard, Plus, Trash2 } from 'lucide-react';

import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsNotice,
  SettingsStatusPill,
  kloelSettingsClass,
} from './contract';
interface PaymentMethod {
  id: string;
  last4?: string | undefined;
  brand?: string | undefined;
  expiry?: string | undefined;
  isDefault?: boolean | undefined;
}

interface PaymentMethodsCardProps {
  cards: PaymentMethod[];
  showCardsFirst: boolean;
  onAddCard: () => void;
  onSetDefault: (id: string) => void;
  onRemove: (id: string) => void;
}
/** Payment methods card for billing settings. */
export function PaymentMethodsCard({
  cards,
  showCardsFirst,
  onAddCard,
  onSetDefault,
  onRemove,
}: PaymentMethodsCardProps) {
  return (
    <SettingsCard>
      <SettingsHeader
        title={kloelT(`Cartoes para assinatura`)}
        description={kloelT(
          `Metodo de pagamento da sua conta Kloel. Os clientes finais nao dependem dessas configuracoes.`,
        )}
      />

      {showCardsFirst ? (
        <SettingsNotice tone="info" className="mb-4">
          {kloelT(`Adicione um cartao para liberar a ativacao do plano.`)}
        </SettingsNotice>
      ) : null}

      {cards.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] px-4 py-8 text-center">
          <CreditCard
            className="mx-auto h-5 w-5 text-[var(--app-text-secondary)]"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium text-[var(--app-text-primary)]">
            {kloelT(`Nenhum cartao cadastrado`)}
          </p>
          <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
            {kloelT(`Cadastre um cartao para manter sua assinatura ativa.`)}
          </p>
          <Button
            onClick={onAddCard}
            className={`mt-4 ${kloelSettingsClass.primaryButton}`}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />

            {kloelT(`Adicionar cartao`)}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <SettingsInset
              key={card.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)]">
                  <CreditCard
                    className="h-4 w-4 text-[colors.ember.primary]"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                    {card.brand || 'CARD'} final {card.last4 || '0000'}
                  </p>
                  <p className="text-xs text-[var(--app-text-secondary)]">
                    {card.expiry || 'Sem validade informada'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {card.isDefault ? (
                  <SettingsStatusPill tone="success">{kloelT(`Padrao`)}</SettingsStatusPill>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => onSetDefault(card.id)}
                    className={kloelSettingsClass.outlineButton}
                  >
                    {kloelT(`Definir padrao`)}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => onRemove(card.id)}
                  className={kloelSettingsClass.dangerButton}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />

                  {kloelT(`Remover`)}
                </Button>
              </div>
            </SettingsInset>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
