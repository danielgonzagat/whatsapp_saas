'use client';

import { kloelT } from '@/lib/i18n/t';
import type { VoiceToneProfile } from './brain-settings-section.helpers';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';

interface VoiceToneSectionProps {
  value?: VoiceToneProfile;
  saving?: boolean;
  disabled?: boolean;
  onSave?: (payload: VoiceToneProfile) => void | Promise<void>;
}

export function VoiceToneSection({
  value,
  saving = false,
  disabled = false,
  onSave,
}: VoiceToneSectionProps) {
  const [voiceTone, setVoiceTone] = useState<VoiceToneProfile>({
    style: '',
    customInstructions: '',
    useProfessional: true,
    useFriendly: false,
    usePersuasive: false,
  });

  useEffect(() => {
    if (!value) {
      return;
    }
    setVoiceTone({
      style: value.style || '',
      customInstructions: value.customInstructions || '',
      useProfessional: value.useProfessional !== false,
      useFriendly: value.useFriendly === true,
      usePersuasive: value.usePersuasive === true,
    });
  }, [value]);

  return (
    <AccordionSection icon={MessageSquare} title={kloelT(`Tom de voz`)}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">{kloelT(`Estilo de comunicacao`)}</Label>
          <Select
            value={voiceTone.style}
            onValueChange={(v: string) => setVoiceTone({ ...voiceTone, style: v })}
          >
            <SelectTrigger className="rounded-xl border-gray-200">
              <SelectValue placeholder={kloelT(`Selecione um estilo`)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">{kloelT(`Profissional e formal`)}</SelectItem>
              <SelectItem value="friendly">{kloelT(`Amigavel e descontraido`)}</SelectItem>
              <SelectItem value="persuasive">{kloelT(`Persuasivo e vendedor`)}</SelectItem>
              <SelectItem value="technical">{kloelT(`Tecnico e detalhado`)}</SelectItem>
              <SelectItem value="custom">{kloelT(`Personalizado`)}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
            <span className="text-sm text-gray-700">{kloelT(`Ser profissional`)}</span>
            <Switch
              checked={voiceTone.useProfessional}
              onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, useProfessional: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
            <span className="text-sm text-gray-700">{kloelT(`Ser amigavel`)}</span>
            <Switch
              checked={voiceTone.useFriendly}
              onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, useFriendly: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
            <span className="text-sm text-gray-700">{kloelT(`Ser persuasivo`)}</span>
            <Switch
              checked={voiceTone.usePersuasive}
              onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, usePersuasive: v })}
            />
          </div>
        </div>

        {voiceTone.style === 'custom' && (
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">{kloelT(`Instrucoes personalizadas`)}</Label>
            <Textarea
              placeholder={kloelT(`Descreva como o Kloel deve se comunicar...`)}
              value={voiceTone.customInstructions}
              onChange={(e) => setVoiceTone({ ...voiceTone, customInstructions: e.target.value })}
              className="min-h-[80px] rounded-xl border-gray-200"
            />
          </div>
        )}

        <Button
          onClick={() => onSave?.(voiceTone)}
          disabled={disabled || saving}
          className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
        >
          {kloelT(`Salvar tom de voz`)}
        </Button>
      </div>
    </AccordionSection>
  );
}
