'use client';

import { kloelT } from '@/lib/i18n/t';
import { externalBrands } from '@/lib/external-brand-tokens';
import { colors } from '@/lib/design-tokens';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsSwitchRow,
  kloelSettingsClass,
} from './contract';

interface OpeningMessageCardProps {
  value?: {
    message?: string;
    useEmojis?: boolean;
    isFormal?: boolean;
    isFriendly?: boolean;
  };
  saving?: boolean;
  onSave?: (payload: {
    message: string;
    useEmojis: boolean;
    isFormal: boolean;
    isFriendly: boolean;
  }) => void | Promise<void>;
}

/** Opening message card. */
export function OpeningMessageCard({ value, saving = false, onSave }: OpeningMessageCardProps) {
  const [message, setMessage] = useState(value?.message || '');
  const [useEmojis, setUseEmojis] = useState(value?.useEmojis !== false);
  const [isFormal, setIsFormal] = useState(value?.isFormal === true);
  const [isFriendly, setIsFriendly] = useState(value?.isFriendly !== false);

  useEffect(() => {
    setMessage(value?.message || '');
    setUseEmojis(value?.useEmojis !== false);
    setIsFormal(value?.isFormal === true);
    setIsFriendly(value?.isFriendly !== false);
  }, [value]);

  return (
    <SettingsCard className="p-6">
      <SettingsHeader
        icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
        title={kloelT(`Mensagem de abertura do Kloel`)}
        description={kloelT(
          `Essa e a primeira mensagem que o Kloel envia quando um cliente inicia uma conversa.`,
        )}
      />

      <div className="mb-4 space-y-2">
        <Label className={kloelSettingsClass.label}>{kloelT(`Mensagem inicial`)}</Label>
        <Textarea
          placeholder={kloelT(
            `Ex: Ola! Eu sou o Kloel, assistente comercial da sua empresa. Como posso ajudar voce hoje?`,
          )}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`min-h-[100px] ${kloelSettingsClass.textarea}`}
        />
      </div>

      {message && (
        <SettingsInset className="mb-6 p-4" style={{ border: `1px solid ${externalBrands.whatsappCardDark}`, background: externalBrands.whatsappBgDark }}>
          <p className="mb-2 text-xs" style={{ color: colors.text.muted }}>
            {kloelT(`Pre-visualizacao no WhatsApp`)}
          </p>
          <div className="inline-block max-w-[80%] rounded-lg px-3 py-2" style={{ border: `1px solid ${externalBrands.whatsappBubbleBorder}`, background: externalBrands.whatsappBubbleBg }}>
            <p className="text-sm" style={{ color: colors.text.silver }}>{message}</p>
            <p className="mt-1 text-right text-[10px]" style={{ color: colors.text.muted }}>
              {kloelT(`12:00`)}
            </p>
          </div>
        </SettingsInset>
      )}

      <div className="space-y-4">
        <SettingsSwitchRow
          title={kloelT(`Usar emojis?`)}
          description={kloelT(`Adiciona emojis para deixar a mensagem mais amigavel`)}
          control={
            <Switch
              className={kloelSettingsClass.switch}
              checked={useEmojis}
              onCheckedChange={setUseEmojis}
            />
          }
        />
        <SettingsSwitchRow
          title={kloelT(`Ser formal?`)}
          description={kloelT(`Usa linguagem mais profissional e corporativa`)}
          control={
            <Switch
              className={kloelSettingsClass.switch}
              checked={isFormal}
              onCheckedChange={setIsFormal}
            />
          }
        />
        <SettingsSwitchRow
          title={kloelT(`Ser amigavel?`)}
          description={kloelT(`Usa tom mais descontraido e acolhedor`)}
          control={
            <Switch
              className={kloelSettingsClass.switch}
              checked={isFriendly}
              onCheckedChange={setIsFriendly}
            />
          }
        />
      </div>

      <Button
        onClick={() => onSave?.({ message, useEmojis, isFormal, isFriendly })}
        disabled={saving}
        className={`mt-4 w-full ${kloelSettingsClass.primaryButton}`}
      >
        {kloelT(`Salvar mensagem`)}
      </Button>
    </SettingsCard>
  );
}
