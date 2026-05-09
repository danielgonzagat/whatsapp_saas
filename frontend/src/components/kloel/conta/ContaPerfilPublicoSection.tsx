'use client';

import { kloelT } from '@/lib/i18n/t';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useProfileMutations } from '@/hooks/useKyc';
import { useToast } from '@/components/kloel/ToastProvider';
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview';
import Icons from './ContaIcons';
import { SORA, MONO, EMBER, HTTPS_RE } from './ContaConstants';
import { cleanPayload, getErrorMessage, initialsFromName } from './ContaHelpers';
import { Field, SaveActions, SectionCard } from './ContaShared';
import type { KycProfile } from './ContaTypes';

export default function PerfilPublicoSection({
  profile,
  mutate,
}: {
  profile: KycProfile | null;
  mutate: () => void;
}) {
  const { updateProfile } = useProfileMutations();
  const { showToast } = useToast();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { previewUrl: avatarPreviewUrl } = usePersistentImagePreview({
    storageKey: 'kloel_profile_avatar_preview',
  });

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const [form, setForm] = useState({
    publicName: '',
    bio: '',
    website: '',
    instagram: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        publicName: profile.publicName || profile.name || '',
        bio: profile.bio || '',
        website: profile.website || '',
        instagram: profile.instagram || '',
      });
    }
  }, [profile]);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError(null);
    setSaveStatus('idle');
    setSaving(true);
    try {
      await updateProfile(
        cleanPayload({
          publicName: form.publicName,
          bio: form.bio,
          website: form.website,
          instagram: form.instagram,
        }),
      );
      showToast('Perfil público salvo', 'success');
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (err) {
      setError(getErrorMessage(err) || 'Erro ao salvar. Tente novamente.');
      showToast(getErrorMessage(err) || 'Erro ao salvar perfil público', 'error');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const initials = initialsFromName(form.publicName);

  return (
    <>
      <SectionCard
        title={kloelT(`Perfil publico`)}
        subtitle={kloelT(`Informacoes visiveis para compradores e afiliados`)}
      >
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <Field
            label={kloelT(`Nome publico`)}
            placeholder={kloelT(`Como voce quer ser conhecido`)}
            value={form.publicName}
            onChange={(v) => set('publicName', v)}
          />
          <Field
            label={kloelT(`Bio`)}
            placeholder={kloelT(`Uma breve descricao sobre voce ou seu negocio`)}
            value={form.bio}
            onChange={(v) => set('bio', v)}
            rows={3}
            required={false}
          />
          <div style={{ display: 'flex', gap: 14 }}>
            <Field
              label={kloelT(`Website`)}
              placeholder="https://seusite.com"
              value={form.website}
              onChange={(v) => set('website', v)}
              half
              required={false}
            />
            <Field
              label={kloelT(`Instagram`)}
              placeholder={kloelT(`@seuusuario`)}
              value={form.instagram}
              onChange={(v) => set('instagram', v)}
              half
              required={false}
            />
          </div>
        </div>
        <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
      </SectionCard>

      <SectionCard
        title={kloelT(`Pre-visualizacao`)}
        subtitle={kloelT(`Como seu perfil aparece para os outros`)}
      >
        <div
          style={{
            background: 'var(--app-bg-secondary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 6,
              background: 'var(--app-bg-primary)',
              border: '1px solid var(--app-border-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
            }}
          >
            {avatarPreviewUrl || profile?.avatarUrl ? (
              <Image
                src={avatarPreviewUrl || profile?.avatarUrl || ''}
                alt=""
                unoptimized
                width={224}
                height={224}
                style={{
                  objectFit: 'contain',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 6,
                  display: 'block',
                }}
              />
            ) : (
              <span
                style={{
                  fontFamily: SORA, fontSize: 18, fontWeight: 700, color: 'var(--app-text-tertiary)',
                }}
              >
                {initials}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 15, fontWeight: 600, color: 'var(--app-text-primary)', display: 'block', fontFamily: SORA,
              }}
            >
              {form.publicName || 'Seu nome'}
            </span>
            {form.bio && (
              <span
                style={{
                  fontSize: 11, color: 'var(--app-text-secondary)', display: 'block', marginTop: 2, fontFamily: SORA,
                }}
              >
                {form.bio}
              </span>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {form.website && (
                <span
                  style={{
                    fontSize: 10, color: 'var(--app-text-tertiary)', fontFamily: SORA, display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {Icons.globe(10)} {form.website.replace(HTTPS_RE, '')}
                </span>
              )}
              {form.instagram && (
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
                  {form.instagram}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: EMBER }}>0</span>
            <span style={{ fontSize: 9, color: 'var(--app-text-tertiary)', display: 'block', fontFamily: SORA }}>
              produtos
            </span>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
