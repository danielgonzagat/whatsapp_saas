'use client';

import { kloelT } from '@/lib/i18n/t';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useProfileMutations } from '@/hooks/useKyc';
import { useToast } from '@/components/kloel/ToastProvider';
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview';
import { readFileAsDataUrl } from '@/lib/media-upload';
import Icons from './ContaIcons';
import { SORA } from './ContaConstants';
import { cleanPayload, getErrorMessage, initialsFromName } from './ContaHelpers';
import { Field, SaveActions, SectionCard } from './ContaShared';
import type { KycProfile } from './ContaTypes';

function AvatarUploader({
  previewUrl,
  fallbackUrl,
  initials,
  fileRef,
  onFileChange,
  displayName,
  displayEmail,
}: {
  previewUrl: string | null;
  fallbackUrl: string | null | undefined;
  initials: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  displayName: string;
  displayEmail: string;
}) {
  const imgSrc = previewUrl || fallbackUrl || undefined;
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
      <div
        onClick={() => fileRef.current?.click()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: 72,
          height: 72,
          borderRadius: 6,
          background: 'var(--app-bg-secondary)',
          border: '1px solid var(--app-border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative' as const,
          cursor: 'pointer',
          padding: 8,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt=""
            unoptimized
            width={120}
            height={120}
            style={{
              objectFit: 'contain',
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 4,
              display: 'block',
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: SORA,
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--app-text-tertiary)',
            }}
          >
            {initials}
          </span>
        )}
        <div
          style={{
            position: 'absolute' as const,
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity .15s',
          }}
        >
          <span style={{ color: 'var(--app-text-primary)' }}>{Icons.camera(18)}</span>
        </div>
      </div>
      <div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {displayName}
        </span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {displayEmail}
        </span>
      </div>
      <input
        aria-label="Foto de perfil"
        ref={fileRef}
        type="file"
        accept={kloelT(`image/*`)}
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
    </div>
  );
}

type BirthDateParts = { day: string; month: string; year: string };

const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function splitBirthDate(value: string): BirthDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) {
    return { day: '1', month: '1', year: String(new Date().getFullYear() - 18) };
  }
  return { day: String(Number(match[3])), month: String(Number(match[2])), year: match[1] };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function normalizedBirthDate(parts: BirthDateParts): string {
  const year = Number(parts.year);
  const month = Math.min(12, Math.max(1, Number(parts.month) || 1));
  const day = Math.min(daysInMonth(year, month), Math.max(1, Number(parts.day) || 1));
  if (!Number.isFinite(year) || year < 1900) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

function formatBirthDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Selecionar data';
}

function BirthDatePickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BirthDateParts>(() => splitBirthDate(value));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 121 }, (_, index) => currentYear - index);
  const draftYear = Number(draft.year) || currentYear - 18;
  const draftMonth = Math.min(12, Math.max(1, Number(draft.month) || 1));
  const maxDay = daysInMonth(draftYear, draftMonth);
  const draftDay = Math.min(maxDay, Math.max(1, Number(draft.day) || 1));
  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 10px',
    background: 'var(--app-bg-input)',
    border: '1px solid var(--app-border-primary)',
    borderRadius: 6,
    color: 'var(--app-text-primary)',
    fontFamily: SORA,
    fontSize: 12,
    outline: 'none',
  };

  return (
    <div style={{ position: 'relative' as const, width: '100%' }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--app-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 6,
          fontFamily: SORA,
        }}
      >
        {kloelT(`Data de nascimento`)} <span style={{ color: 'var(--app-accent)', fontSize: 8 }}>*</span>
      </label>
      <button
        type="button"
        aria-label="Data de nascimento"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setDraft(splitBirthDate(value));
          }
          setOpen((next) => !next);
        }}
        style={{
          width: '100%',
          padding: '11px 14px',
          background: 'var(--app-bg-input)',
          border: `1px solid ${open ? 'var(--app-accent)' : 'var(--app-border-primary)'}`,
          borderRadius: 6,
          color: value ? 'var(--app-text-primary)' : 'var(--app-text-placeholder)',
          boxSizing: 'border-box' as const,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: SORA,
          fontSize: 13,
          textAlign: 'left' as const,
        }}
      >
        <span>{formatBirthDate(value)}</span>
        <span style={{ color: 'var(--app-text-tertiary)', fontSize: 12 }}>v</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Selecionar data de nascimento"
          style={{
            position: 'absolute' as const,
            zIndex: 20,
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            boxShadow: '0 18px 44px rgba(0,0,0,0.18)',
            padding: 14,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 1fr', gap: 10 }}>
            <label style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)' }}>
              Dia
              <select
                aria-label="Dia"
                value={String(draftDay)}
                onChange={(event) => setDraft((prev) => ({ ...prev, day: event.target.value }))}
                style={selectStyle}
              >
                {Array.from({ length: maxDay }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {pad2(day)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)' }}>
              Mes
              <select
                aria-label="Mes"
                value={String(draftMonth)}
                onChange={(event) => setDraft((prev) => ({ ...prev, month: event.target.value }))}
                style={selectStyle}
              >
                {MONTH_LABELS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {pad2(index + 1)} - {label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)' }}>
              Ano
              <select
                aria-label="Ano"
                value={String(draftYear)}
                onChange={(event) => setDraft((prev) => ({ ...prev, year: event.target.value }))}
                style={selectStyle}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-secondary)',
                cursor: 'pointer',
                fontFamily: SORA,
                fontSize: 12,
                padding: '8px 12px',
              }}
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-secondary)',
                cursor: 'pointer',
                fontFamily: SORA,
                fontSize: 12,
                padding: '8px 12px',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(normalizedBirthDate({ ...draft, day: String(draftDay) }));
                setOpen(false);
              }}
              style={{
                background: 'var(--app-accent)',
                border: 'none',
                borderRadius: 6,
                color: 'var(--app-text-on-accent)',
                cursor: 'pointer',
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 12px',
              }}
            >
              Aplicar data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DadosPessoaisSection({
  profile,
  mutate,
}: {
  profile: KycProfile | null;
  mutate: () => void;
}) {
  const { updateProfile, uploadAvatar } = useProfileMutations();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { previewUrl: avatarPreviewUrl, setPreviewUrl: setAvatarPreviewUrl } =
    usePersistentImagePreview({ storageKey: 'kloel_profile_avatar_preview' });

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
  });

  useEffect(() => {
    if (profile) {
      let bd = profile.birthDate || '';
      if (bd && bd.length > 10) {
        bd = bd.slice(0, 10);
      }
      queueMicrotask(() => {
        setForm({
          name: profile.name || '',
          email: profile.email || '',
          phone: profile.phone || '',
          birthDate: bd,
        });
      });
    }
  }, [profile]);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    setSaving(true);
    try {
      await updateProfile(
        cleanPayload({
          name: form.name,
          phone: form.phone,
          birthDate: form.birthDate,
        }),
      );
      showToast('Dados pessoais salvos', 'success');
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
      showToast(getErrorMessage(e) || 'Erro ao salvar dados pessoais', 'error');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarPreviewUrl(dataUrl);
      await uploadAvatar(file);
      mutate();
    } catch (err) {
      setError(getErrorMessage(err) || 'Erro ao salvar. Tente novamente.');
    }
  };

  const initials = initialsFromName(form.name);

  return (
    <SectionCard
      title={kloelT(`Dados pessoais`)}
      subtitle={kloelT(`Informacoes basicas da sua conta`)}
    >
      <AvatarUploader
        previewUrl={avatarPreviewUrl}
        fallbackUrl={profile?.avatarUrl}
        initials={initials}
        fileRef={fileRef}
        onFileChange={handleAvatarChange}
        displayName={form.name || 'Seu nome'}
        displayEmail={form.email}
      />

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <Field
          label={kloelT(`Nome completo`)}
          placeholder={kloelT(`Seu nome completo`)}
          value={form.name}
          onChange={(v) => set('name', v)}
        />
        <Field label={kloelT(`E-mail`)} value={form.email} onChange={() => {}} disabled />
        <Field
          label={kloelT(`Celular`)}
          placeholder={kloelT(`(00) 00000-0000`)}
          value={form.phone}
          onChange={(v) => set('phone', v)}
          mono
        />
        <BirthDatePickerField value={form.birthDate} onChange={(v) => set('birthDate', v)} />
      </div>

      <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
    </SectionCard>
  );
}
