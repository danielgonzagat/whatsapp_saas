'use client';

import { kloelT } from '@/lib/i18n/t';
import { type SegmentationPreset, type SegmentationStats } from '@/lib/api';
import { Sparkles } from 'lucide-react';
import { SettingsCard, SettingsHeader, SettingsInset, SettingsNotice } from './contract';

const fieldClass =
  'h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

interface PresetContact {
  id: string;
  phone: string;
  name?: string;
}

interface CrmSettingsSegmentationProps {
  presets: SegmentationPreset[];
  segmentStats: SegmentationStats | null;
  selectedPreset: string;
  onPresetChange: (preset: string) => void;
  presetContacts: PresetContact[];
  presetTotal: number;
}

/** Segmentation presets and audience preview card. */
export function CrmSettingsSegmentation({
  presets,
  segmentStats,
  selectedPreset,
  onPresetChange,
  presetContacts,
  presetTotal,
}: CrmSettingsSegmentationProps) {
  return (
    <SettingsCard>
      <SettingsHeader
        title={kloelT(`Segmentacao`)}
        icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
        description={kloelT(`Veja presets, volumes e audiencia operacional sem sair do CRM.`)}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(segmentStats?.segments || {})
          .slice(0, 8)
          .map(([name, segmentTotal]) => (
            <SettingsInset key={name} className="px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-text-secondary)]">
                {name}
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                {String(segmentTotal)}
              </p>
            </SettingsInset>
          ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <select
          value={selectedPreset}
          onChange={(event) => onPresetChange(event.target.value)}
          className={fieldClass}
        >
          <option value="">{kloelT(`Escolha um preset`)}</option>
          {presets.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.label || preset.name}
            </option>
          ))}
        </select>
        <SettingsInset className="px-4 py-2 text-sm text-[var(--app-text-secondary)]">
          {presetTotal} {kloelT(`contatos nesse recorte`)}
        </SettingsInset>
      </div>

      <div className="mt-4 space-y-2">
        {presetContacts.length === 0 ? (
          <SettingsNotice>{kloelT(`Selecione um preset para ver a audiencia.`)}</SettingsNotice>
        ) : (
          presetContacts.map((contact) => (
            <SettingsInset key={contact.id} className="px-4 py-3">
              <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                {contact.name || 'Contato sem nome'}
              </p>
              <p className="text-xs text-[var(--app-text-secondary)]">{contact.phone}</p>
            </SettingsInset>
          ))
        )}
      </div>
    </SettingsCard>
  );
}
