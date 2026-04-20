'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsCard, SettingsHeader, SettingsNotice, kloelSettingsClass } from './contract';

interface EmergencyModeCardProps {
  value?: {
    emergencyAction?: string;
    fixedMessage?: string;
  };
  saving?: boolean;
  onSave?: (payload: { emergencyAction: string; fixedMessage: string }) => void | Promise<void>;
}

/** Emergency mode card. */
export function EmergencyModeCard({ value, saving = false, onSave }: EmergencyModeCardProps) {
  const [emergencyAction, setEmergencyAction] = useState(value?.emergencyAction || '');
  const [fixedMessage, setFixedMessage] = useState(value?.fixedMessage || '');

  useEffect(() => {
    setEmergencyAction(value?.emergencyAction || '');
    setFixedMessage(value?.fixedMessage || '');
  }, [value]);

  return (
    <SettingsCard className="p-6">
      <SettingsHeader
        icon={<AlertTriangle className="h-5 w-5 text-[#E85D30]" aria-hidden="true" />}
        title={kloelT(`Modo de Emergencia`)}
        description={kloelT(`Configure o que o Kloel deve fazer quando houver problemas tecnicos ou instabilidades.`)}
      />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className={kloelSettingsClass.label}>
            
            {kloelT(`O que o Kloel deve fazer quando houver problemas?`)}
          </Label>
          <Select value={emergencyAction} onValueChange={setEmergencyAction}>
            <SelectTrigger className={kloelSettingsClass.selectTrigger}>
              <SelectValue placeholder={kloelT(`Selecione uma acao`)} />
            </SelectTrigger>
            <SelectContent className={kloelSettingsClass.selectContent}>
              <SelectItem value="pause">{kloelT(`Pausar atendimento`)}</SelectItem>
              <SelectItem value="forward">{kloelT(`Encaminhar para humano`)}</SelectItem>
              <SelectItem value="fixed">{kloelT(`Enviar mensagem fixa`)}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {emergencyAction === 'fixed' && (
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Mensagem de emergencia`)}</Label>
            <Textarea
              placeholder={kloelT(`Estamos passando por uma instabilidade. Ja vamos te responder.`)}
              value={fixedMessage}
              onChange={(e) => setFixedMessage(e.target.value)}
              className={`min-h-[80px] ${kloelSettingsClass.textarea}`}
            />
          </div>
        )}

        {emergencyAction === 'forward' && (
          <SettingsNotice tone="info">
            <p className="text-sm">
              
              {kloelT(`Quando ativado, o Kloel ira notificar o responsavel e encaminhar a conversa para
              atendimento humano.`)}
            </p>
          </SettingsNotice>
        )}

        {emergencyAction === 'pause' && (
          <SettingsNotice tone="warning">
            <p className="text-sm">
              
              {kloelT(`O Kloel ira pausar todas as respostas automaticas ate que o problema seja resolvido.`)}
            </p>
          </SettingsNotice>
        )}
      </div>

      <Button
        onClick={() => onSave?.({ emergencyAction, fixedMessage })}
        disabled={saving}
        className={`mt-4 w-full ${kloelSettingsClass.primaryButton}`}
      >
        
        {kloelT(`Salvar configuracao de emergencia`)}
      </Button>
    </SettingsCard>
  );
}
