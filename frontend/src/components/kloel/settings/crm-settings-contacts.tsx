'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { type CrmContact, crmApi } from '@/lib/api';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsStatusPill,
  kloelSettingsClass,
} from './contract';
import { errorMessage } from './crm-settings-section.helpers';

const fieldClass =
  'h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

const textareaClass =
  'min-h-[96px] rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

interface CrmSettingsContactsProps {
  contacts: CrmContact[];
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
}

/** New-contact form + contact list card. */
export function CrmSettingsContacts({
  contacts,
  onSuccess,
  onError,
  onReload,
}: CrmSettingsContactsProps) {
  const [saving, setSaving] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });

  const handleCreateContact = async () => {
    if (!contactForm.phone.trim()) {
      onError('Informe o telefone do contato.');
      return;
    }

    setSaving(true);

    try {
      await crmApi.createContact({
        name: contactForm.name.trim() || undefined,
        phone: contactForm.phone.trim(),
        email: contactForm.email.trim() || undefined,
        notes: contactForm.notes.trim() || undefined,
      });
      setContactForm({ name: '', phone: '', email: '', notes: '' });
      onSuccess('Contato criado no CRM.');
      await onReload();
    } catch (createError) {
      onError(errorMessage(createError, 'Nao foi possivel criar o contato.'));
    } finally {
      setSaving(false);
    }
  };

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
          onChange={(event) =>
            setContactForm((current) => ({ ...current, name: event.target.value }))
          }
          placeholder={kloelT(`Nome do contato`)}
          className={fieldClass}
        />
        <input
          aria-label="Telefone com DDI"
          value={contactForm.phone}
          onChange={(event) =>
            setContactForm((current) => ({ ...current, phone: event.target.value }))
          }
          placeholder={kloelT(`Telefone com DDI`)}
          className={fieldClass}
        />
        <input
          aria-label="Email do contato"
          value={contactForm.email}
          onChange={(event) =>
            setContactForm((current) => ({ ...current, email: event.target.value }))
          }
          placeholder={kloelT(`Email`)}
          className={fieldClass}
        />
        <textarea
          aria-label="Observacao comercial"
          value={contactForm.notes}
          onChange={(event) =>
            setContactForm((current) => ({ ...current, notes: event.target.value }))
          }
          placeholder={kloelT(`Observacao comercial`)}
          className={`${textareaClass} sm:col-span-2`}
        />
      </div>
      <Button
        type="button"
        className={`mt-4 ${kloelSettingsClass.primaryButton}`}
        onClick={() => void handleCreateContact()}
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
