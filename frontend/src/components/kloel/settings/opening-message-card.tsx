'use client';

import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  kloelSettingsClass,
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsSwitchRow,
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
        icon={<MessageSquare className="h-5 w-5" />}
        title="Mensagem de abertura do Kloel"
        description="Essa e a primeira mensagem que o Kloel envia quando um cliente inicia uma conversa."
      />

      <div className="mb-4 space-y-2">
        <Label className={kloelSettingsClass.label}>Mensagem inicial</Label>
        <Textarea
          placeholder="Ex: Ola! Eu sou o Kloel, assistente comercial da sua empresa. Como posso ajudar voce hoje?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`min-h-[100px] ${kloelSettingsClass.textarea}`}
        />
      </div>

      {message && (
        <SettingsInset className="mb-6 border-[#1F2C33] bg-[#101B20] p-4">
          <p className="mb-2 text-xs text-[#6E6E73]">Pre-visualizacao no WhatsApp</p>
          <div className="inline-block max-w-[80%] rounded-lg border border-[#2A3942] bg-[#202C33] px-3 py-2">
            <p className="text-sm text-[#E0DDD8]">{message}</p>
            <p className="mt-1 text-right text-[10px] text-[#6E6E73]">12:00</p>
          </div>
        </SettingsInset>
      )}

      <div className="space-y-4">
        <SettingsSwitchRow
          title="Usar emojis?"
          description="Adiciona emojis para deixar a mensagem mais amigavel"
          control={
            <Switch
              className={kloelSettingsClass.switch}
              checked={useEmojis}
              onCheckedChange={setUseEmojis}
            />
          }
        />
        <SettingsSwitchRow
          title="Ser formal?"
          description="Usa linguagem mais profissional e corporativa"
          control={
            <Switch
              className={kloelSettingsClass.switch}
              checked={isFormal}
              onCheckedChange={setIsFormal}
            />
          }
        />
        <SettingsSwitchRow
          title="Ser amigavel?"
          description="Usa tom mais descontraido e acolhedor"
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
        Salvar mensagem
      </Button>
    </SettingsCard>
  );
}
