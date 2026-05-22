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
        <Field
          label={kloelT(`Data de nascimento`)}
          value={form.birthDate}
          onChange={(v) => set('birthDate', v)}
          type="date"
        />
      </div>

      <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
    </SectionCard>
  );
}
