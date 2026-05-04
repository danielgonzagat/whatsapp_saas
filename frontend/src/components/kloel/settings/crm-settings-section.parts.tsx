'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { type CrmContact, type SegmentationPreset, type SegmentationStats } from '@/lib/api';
import { Plus, Sparkles, Users } from 'lucide-react';
import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsMetricTile,
  SettingsNotice,
  SettingsStatusPill,
  kloelSettingsClass,
} from './contract';

export const fieldClass =
  'h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

export const textareaClass =
  'min-h-[96px] rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

export function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <SettingsMetricTile>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
        {props.title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--app-text-primary)]">{props.value}</p>
      {props.hint ? (
        <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{props.hint}</p>
      ) : null}
    </SettingsMetricTile>
  );
}

type ContactForm = { name: string; phone: string; email: string; notes: string };

interface ContactCardProps {
  contactForm: ContactForm;
  contacts: CrmContact[];
  saving: boolean;
  onFieldChange: (field: keyof ContactForm, value: string) => void;
  onCreateContact: () => void;
}

export function ContactCard({
  contactForm,
  contacts,
  saving,
  onFieldChange,
  onCreateContact,
}: ContactCardProps) {
  return (
    <SettingsCard>
      <SettingsHeader
        title={kloelT(`Novo contato`)}
        icon={<Users className="h-4 w-4" aria-hidden="true" />}
        description={kloelT(
          `Crie contatos no CRM e mantenha as tags comerciais dentro do shell principal.`,
        )}
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          aria-label="Nome do contato"
          value={contactForm.name}
          onChange={(event) => onFieldChange('name', event.target.value)}
          placeholder={kloelT(`Nome do contato`)}
          className={fieldClass}
        />
        <input
          aria-label="Telefone com DDI"
          value={contactForm.phone}
          onChange={(event) => onFieldChange('phone', event.target.value)}
          placeholder={kloelT(`Telefone com DDI`)}
          className={fieldClass}
        />
        <input
          aria-label="Email do contato"
          value={contactForm.email}
          onChange={(event) => onFieldChange('email', event.target.value)}
          placeholder={kloelT(`Email`)}
          className={fieldClass}
        />
        <textarea
          aria-label="Observacao comercial"
          value={contactForm.notes}
          onChange={(event) => onFieldChange('notes', event.target.value)}
          placeholder={kloelT(`Observacao comercial`)}
          className={`${textareaClass} sm:col-span-2`}
        />
      </div>
      <Button
        type="button"
        className={`mt-4 ${kloelSettingsClass.primaryButton}`}
        onClick={onCreateContact}
        disabled={saving}
      >
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        {kloelT(`Criar contato`)}
      </Button>

      <div className="mt-6 space-y-2">
        {(contacts || []).slice(0, 8).map((contact) => (
          <SettingsInset key={contact.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                  {contact.name || 'Sem nome'}
                </p>
                <p className="text-xs text-[var(--app-text-secondary)]">{contact.phone}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {(contact.tags || []).map((tag) => (
                  <SettingsStatusPill key={tag.id}>{tag.name}</SettingsStatusPill>
                ))}
              </div>
            </div>
          </SettingsInset>
        ))}
      </div>
    </SettingsCard>
  );
}

interface SegmentationCardProps {
  segmentStats: SegmentationStats | null;
  presets: SegmentationPreset[];
  selectedPreset: string;
  presetTotal: number;
  presetContacts: Array<{ id: string; phone: string; name?: string }>;
  onPresetChange: (preset: string) => void;
}

export function SegmentationCard({
  segmentStats,
  presets,
  selectedPreset,
  presetTotal,
  presetContacts,
  onPresetChange,
}: SegmentationCardProps) {
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
          .map(([name, total]) => (
            <SettingsInset key={name} className="px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-text-secondary)]">
                {name}
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                {String(total)}
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
