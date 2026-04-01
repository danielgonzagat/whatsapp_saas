'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mutate as globalMutate } from 'swr'; // PULSE:OK — globalMutate used after Meta disconnect; SWR mutate() used in TeamSection for invite/revoke/remove
import { tokenStorage, apiFetch } from '@/lib/api/core';
import { billingApi } from '@/lib/api';
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import { BillingSettingsSection } from '@/components/kloel/settings/billing-settings-section';
import { BrainSettingsSection } from '@/components/kloel/settings/brain-settings-section';
import { CrmSettingsSection } from '@/components/kloel/settings/crm-settings-section';
import { AnalyticsSettingsSection } from '@/components/kloel/settings/analytics-settings-section';
import { ActivitySection } from '@/components/kloel/settings/activity-section';
import { SystemAlertsCard } from '@/components/kloel/settings/system-alerts-card';
import { AccountSettingsSection } from '@/components/kloel/settings/account-settings-section';
import { WORKSPACE_SETTINGS_SECTIONS } from '@/components/kloel/settings/settings-registry';
import {
  useProfile,
  useProfileMutations,
  useFiscalData,
  useFiscalMutations,
  useKycDocuments,
  useDocumentMutations,
  useBankAccount,
  useBankMutations,
  useSecurityMutations,
  useKycStatus,
  useKycCompletion,
  useKycSubmit,
} from '@/hooks/useKyc';
import { BRAZILIAN_BANKS, POPULAR_BANK_CODES, formatBankCode } from '@/data/brazilian-banks';
import { listTeam, inviteTeamMember, revokeTeamInvite, removeTeamMember } from '@/lib/api/team';
import { readFileAsDataUrl } from '@/lib/media-upload';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

// ═══ HELPERS ═══

/** Strip empty-string values from payload before sending to backend.
 *  class-validator's @IsOptional() only skips undefined/null, not "". */
function cleanPayload<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '' && v !== undefined && v !== null) result[k] = v;
  }
  return result as Partial<T>;
}

// ═══ CONSTANTS ═══

const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const EMBER = '#E85D30';

// ═══ ICONS ═══

const Icons = {
  user: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  building: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
    </svg>
  ),
  doc: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  bank: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 21h18" />
      <path d="M3 10h18" />
      <path d="M5 6l7-3 7 3" />
      <path d="M4 10v11" />
      <path d="M20 10v11" />
      <path d="M8 14v3" />
      <path d="M12 14v3" />
      <path d="M16 14v3" />
    </svg>
  ),
  shield: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  bell: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  globe: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  check: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  clock: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  alert: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  upload: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  camera: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  eye: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  x: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  trash: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  language: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10" fontWeight="bold">A</text>
    </svg>
  ),
  help: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  logout: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  users: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  mail: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  plus: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
};

// ═══ STATUS CONFIG ═══

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: '#F59E0B', bg: 'rgba(245,158,11,.06)', icon: Icons.clock },
  submitted: { label: 'Em analise', color: '#3B82F6', bg: 'rgba(59,130,246,.06)', icon: Icons.eye },
  approved: { label: 'Aprovado', color: '#10B981', bg: 'rgba(16,185,129,.06)', icon: Icons.check },
  rejected: { label: 'Reprovado', color: '#EF4444', bg: 'rgba(239,68,68,.06)', icon: Icons.alert },
};

type SettingsSectionKey =
  | 'account'
  | 'pessoal'
  | 'fiscal'
  | 'documentos'
  | 'bancario'
  | 'billing'
  | 'apps'
  | 'brain'
  | 'crm'
  | 'analytics'
  | 'activity'
  | 'seguranca'
  | 'equipe'
  | 'notificacoes'
  | 'perfil'
  | 'idiomas'
  | 'presentear'
  | 'saiba-mais'
  | 'ajuda'
  | 'sair';

const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'pessoal';

const SETTINGS_SECTION_ALIASES: Record<string, SettingsSectionKey> = {
  workspace: 'account',
  account: 'account',
  configuracao: 'account',
  'configuracao-da-conta': 'account',
  pessoal: 'pessoal',
  personal: 'pessoal',
  fiscal: 'fiscal',
  documentos: 'documentos',
  documents: 'documentos',
  bancario: 'bancario',
  bank: 'bancario',
  billing: 'billing',
  pagamentos: 'billing',
  payment: 'billing',
  payments: 'billing',
  upgrades: 'billing',
  plano: 'billing',
  apps: 'apps',
  integracoes: 'apps',
  integrations: 'apps',
  brain: 'brain',
  kloel: 'brain',
  crm: 'crm',
  analytics: 'analytics',
  activity: 'activity',
  atividade: 'activity',
  seguranca: 'seguranca',
  security: 'seguranca',
  equipe: 'equipe',
  team: 'equipe',
  notificacoes: 'notificacoes',
  notifications: 'notificacoes',
  perfil: 'perfil',
  profile: 'perfil',
  idiomas: 'idiomas',
  language: 'idiomas',
  languages: 'idiomas',
  presentear: 'presentear',
  gift: 'presentear',
  'saiba-mais': 'saiba-mais',
  'learn-more': 'saiba-mais',
  about: 'saiba-mais',
  ajuda: 'ajuda',
  help: 'ajuda',
  sair: 'sair',
  logout: 'sair',
};

function resolveSettingsSection(raw: string | null | undefined): SettingsSectionKey {
  if (!raw) return DEFAULT_SETTINGS_SECTION;
  return SETTINGS_SECTION_ALIASES[raw] || DEFAULT_SETTINGS_SECTION;
}

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: st.bg, borderRadius: 4 }}>
      <span style={{ color: st.color }}>{st.icon(10)}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: st.color, fontFamily: SORA }}>{st.label}</span>
    </div>
  );
}

// ═══ REUSABLE FIELD ═══

function Field({
  label, placeholder, value, onChange, onBlur: onBlurProp, type = 'text', mono = false, half = false,
  required = true, disabled = false, rows, suffix,
}: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void;
  onBlur?: () => void; type?: string; mono?: boolean; half?: boolean; required?: boolean;
  disabled?: boolean; rows?: number; suffix?: React.ReactNode;
}) {
  const baseStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', background: disabled ? '#0A0A0C' : '#111113',
    border: '1px solid #222226', borderRadius: 6, fontSize: 13,
    fontFamily: mono ? MONO : SORA, color: disabled ? '#3A3A3F' : '#E0DDD8',
    boxSizing: 'border-box' as const, transition: 'border-color .15s',
    outline: 'none', cursor: disabled ? 'not-allowed' : 'text', resize: 'none' as const,
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!disabled) {
      e.currentTarget.style.borderColor = EMBER;
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,93,48,.06)';
    }
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#222226';
    e.currentTarget.style.boxShadow = 'none';
    onBlurProp?.();
  };

  return (
    <div style={{ flex: half ? 1 : 'none', width: half ? 'auto' : '100%' }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontFamily: SORA }}>
        {label} {required && <span style={{ color: EMBER, fontSize: 8 }}>*</span>}
      </label>
      <div style={{ position: 'relative' as const }}>
        {rows ? (
          <textarea
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            style={baseStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        ) : (
          <input
            aria-label={label}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            style={baseStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        )}
        {suffix && (
          <span style={{ position: 'absolute' as const, right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══ SAVE BUTTON ═══

function SaveButton({ saving, onClick, label = 'Salvar alteracoes' }: { saving: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        padding: '11px 28px', background: saving ? '#3A3A3F' : EMBER, border: 'none', borderRadius: 6,
        color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
        fontFamily: SORA, transition: 'all 150ms ease', opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? 'Salvando...' : label}
    </button>
  );
}

// ═══ SECTION CARD WRAPPER ═══

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 24, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#E0DDD8', fontFamily: SORA }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12, color: '#6E6E73', margin: '4px 0 0', fontFamily: SORA }}>{subtitle}</p>}
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

// ═══ SECTION 1: DADOS PESSOAIS ═══

function DadosPessoaisSection({ profile, mutate }: { profile: any; mutate: () => void }) {
  const { updateProfile, uploadAvatar } = useProfileMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const {
    previewUrl: avatarPreviewUrl,
    setPreviewUrl: setAvatarPreviewUrl,
  } = usePersistentImagePreview({ storageKey: 'kloel_profile_avatar_preview' });

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
  });

  useEffect(() => {
    if (profile) {
      // Normalize birthDate to YYYY-MM-DD for <input type="date">
      let bd = profile.birthDate || '';
      if (bd && bd.length > 10) bd = bd.slice(0, 10);
      setForm({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        birthDate: bd,
      });
    }
  }, [profile]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    setSaving(true);
    try {
      await updateProfile(cleanPayload({
        name: form.name,
        phone: form.phone,
        birthDate: form.birthDate,
      }));
      setSaveStatus('success');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarPreviewUrl(dataUrl);
      await uploadAvatar(file);
      mutate();
    } catch (e: any) { setError(e?.message || 'Erro ao salvar. Tente novamente.'); }
  };

  const initials = (form.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <SectionCard title="Dados pessoais" subtitle="Informacoes basicas da sua conta">
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            width: 72, height: 72, borderRadius: 6, background: '#19191C', border: '1px solid #222226',
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' as const,
            cursor: 'pointer', padding: 8,
          }}
        >
          {avatarPreviewUrl || profile?.avatarUrl ? (
            <img
              src={avatarPreviewUrl || profile?.avatarUrl}
              alt=""
              style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%', borderRadius: 4, display: 'block' }}
            />
          ) : (
            <span style={{ fontFamily: SORA, fontSize: 22, fontWeight: 700, color: '#3A3A3F' }}>{initials}</span>
          )}
          <div style={{
            position: 'absolute' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
          >
            <span style={{ color: '#E0DDD8' }}>{Icons.camera(18)}</span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{form.name || 'Seu nome'}</span>
          <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>{form.email}</span>
        </div>
        <input aria-label="Foto de perfil" ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <Field label="Nome completo" placeholder="Seu nome completo" value={form.name} onChange={v => set('name', v)} />
        <Field label="E-mail" value={form.email} onChange={() => {}} disabled />
        <Field label="Celular" placeholder="(00) 00000-0000" value={form.phone} onChange={v => set('phone', v)} mono />
        <Field label="Data de nascimento" value={form.birthDate} onChange={v => set('birthDate', v)} type="date" />
      </div>

      {error && <span style={{ fontSize: 11, color: '#EF4444', marginTop: 8, display: 'block', fontFamily: SORA }}>{error}</span>}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const, alignItems: 'center', gap: 12 }}>
        {saveStatus === 'success' && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>Salvo!</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', fontFamily: SORA }}>Erro ao salvar</span>
        )}
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 2: DADOS FISCAIS ═══

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={EMBER} strokeWidth={2.5}
      style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function DadosFiscaisSection({ fiscal, mutate }: { fiscal: any; mutate: () => void }) {
  const { updateFiscal } = useFiscalMutations();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF');
  const [form, setForm] = useState({
    cpf: '',
    legalName: '',
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    responsavelCpf: '',
    responsavelNome: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  });

  useEffect(() => {
    if (fiscal) {
      setTipo(fiscal.type === 'PJ' || fiscal.cnpj ? 'PJ' : 'PF');
      setForm({
        cpf: fiscal.cpf || '',
        legalName: fiscal.fullName || '',
        cnpj: fiscal.cnpj || '',
        razaoSocial: fiscal.razaoSocial || '',
        nomeFantasia: fiscal.nomeFantasia || '',
        inscricaoEstadual: fiscal.inscricaoEstadual || '',
        inscricaoMunicipal: fiscal.inscricaoMunicipal || '',
        responsavelCpf: fiscal.responsavelCpf || '',
        responsavelNome: fiscal.responsavelNome || '',
        cep: fiscal.cep || '',
        rua: fiscal.street || '',
        numero: fiscal.number || '',
        complemento: fiscal.complement || '',
        bairro: fiscal.neighborhood || '',
        cidade: fiscal.city || '',
        uf: fiscal.state || '',
      });
    }
  }, [fiscal]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  // ── CNPJ auto-fill from BrasilAPI ──
  const lookupCnpj = async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return;
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!res.ok) return;
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        razaoSocial: data.razao_social || prev.razaoSocial,
        nomeFantasia: data.nome_fantasia || prev.nomeFantasia,
        cep: data.cep || prev.cep,
        rua: data.logradouro || prev.rua,
        numero: data.numero || prev.numero,
        complemento: data.complemento || prev.complemento,
        bairro: data.bairro || prev.bairro,
        cidade: data.municipio || prev.cidade,
        uf: data.uf || prev.uf,
        responsavelNome: data.qsa?.[0]?.nome_socio || prev.responsavelNome,
        responsavelCpf: data.qsa?.[0]?.cnpj_cpf_do_socio || prev.responsavelCpf,
      }));
    } catch { /* API offline, don't block */ }
    finally { setCnpjLoading(false); }
  };

  // ── CEP auto-fill from ViaCEP ──
  const lookupCep = async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.erro) return;
      setForm(prev => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        complemento: data.complemento || prev.complemento,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        uf: data.uf || prev.uf,
      }));
    } catch { /* API offline */ }
    finally { setCepLoading(false); }
  };

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    setSaving(true);
    try {
      const payload = cleanPayload({
        type: tipo,
        cpf: form.cpf,
        fullName: form.legalName,
        cnpj: form.cnpj,
        razaoSocial: form.razaoSocial,
        nomeFantasia: form.nomeFantasia,
        inscricaoEstadual: form.inscricaoEstadual,
        inscricaoMunicipal: form.inscricaoMunicipal,
        responsavelCpf: form.responsavelCpf,
        responsavelNome: form.responsavelNome,
        cep: form.cep,
        street: form.rua,
        number: form.numero,
        complement: form.complemento,
        neighborhood: form.bairro,
        city: form.cidade,
        state: form.uf,
      });
      await updateFiscal(payload);
      setSaveStatus('success');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', background: active ? 'rgba(232,93,48,.06)' : 'transparent',
    border: active ? `1px solid ${EMBER}` : '1px solid #222226', borderRadius: 6,
    color: active ? EMBER : '#6E6E73', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: SORA, transition: 'all 150ms ease',
  });

  return (
    <SectionCard title="Dados fiscais" subtitle="Informacoes para emissao de notas e compliance">
      {/* Type selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setTipo('PF')} style={btnStyle(tipo === 'PF')}>Pessoa Fisica (CPF)</button>
        <button onClick={() => setTipo('PJ')} style={btnStyle(tipo === 'PJ')}>Pessoa Juridica (CNPJ)</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        {tipo === 'PF' ? (
          <>
            <Field label="CPF" placeholder="000.000.000-00" value={form.cpf} onChange={v => set('cpf', v)} mono />
            <Field label="Nome legal" placeholder="Nome conforme documento" value={form.legalName} onChange={v => set('legalName', v)} />
            {/* Warning */}
            <div style={{
              background: 'rgba(245,158,11,.04)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 6,
              padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <span style={{ color: '#F59E0B', marginTop: 2, flexShrink: 0 }}>{Icons.alert(16)}</span>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>Limite de saque para CPF</span>
                <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>Como pessoa fisica, o limite de saque mensal e de R$ 2.259,20. Para remover esse limite, cadastre um CNPJ.</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 14 }}>
              <Field label="CNPJ" placeholder="00.000.000/0000-00" value={form.cnpj}
                onChange={v => {
                  set('cnpj', v);
                  const clean = v.replace(/\D/g, '');
                  if (clean.length === 14) lookupCnpj(v);
                }}
                onBlur={() => lookupCnpj(form.cnpj)}
                mono half
                suffix={cnpjLoading ? <Spinner size={14} /> : undefined}
              />
              <Field label="Razao social" placeholder="Razao social da empresa" value={form.razaoSocial} onChange={v => set('razaoSocial', v)} half />
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Field label="Nome fantasia" placeholder="Nome fantasia" value={form.nomeFantasia} onChange={v => set('nomeFantasia', v)} half />
              <Field label="Inscricao estadual" placeholder="Opcional" value={form.inscricaoEstadual} onChange={v => set('inscricaoEstadual', v)} half required={false} />
            </div>
            <Field label="Inscricao municipal" placeholder="Opcional" value={form.inscricaoMunicipal} onChange={v => set('inscricaoMunicipal', v)} required={false} />
            <div style={{ display: 'flex', gap: 14 }}>
              <Field label="CPF do responsavel" placeholder="000.000.000-00" value={form.responsavelCpf} onChange={v => set('responsavelCpf', v)} mono half />
              <Field label="Nome do responsavel" placeholder="Nome completo" value={form.responsavelNome} onChange={v => set('responsavelNome', v)} half />
            </div>
          </>
        )}
      </div>

      {/* Address */}
      <div style={{ borderTop: '1px solid #19191C', marginTop: 24, paddingTop: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 14, fontFamily: SORA }}>Endereco fiscal</span>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field label="CEP" placeholder="00000-000" value={form.cep}
              onChange={v => {
                set('cep', v);
                const clean = v.replace(/\D/g, '');
                if (clean.length === 8) lookupCep(v);
              }}
              onBlur={() => lookupCep(form.cep)}
              mono half
              suffix={cepLoading ? <Spinner size={14} /> : undefined}
            />
            <Field label="Rua" placeholder="Nome da rua" value={form.rua} onChange={v => set('rua', v)} half />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field label="Numero" placeholder="123" value={form.numero} onChange={v => set('numero', v)} mono half />
            <Field label="Complemento" placeholder="Apt, sala..." value={form.complemento} onChange={v => set('complemento', v)} half required={false} />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field label="Bairro" placeholder="Bairro" value={form.bairro} onChange={v => set('bairro', v)} half />
            <Field label="Cidade" placeholder="Cidade" value={form.cidade} onChange={v => set('cidade', v)} half />
          </div>
          <Field label="UF" placeholder="SP" value={form.uf} onChange={v => set('uf', v)} />
        </div>
      </div>

      {error && <span style={{ fontSize: 11, color: '#EF4444', marginTop: 8, display: 'block', fontFamily: SORA }}>{error}</span>}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const, alignItems: 'center', gap: 12 }}>
        {saveStatus === 'success' && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>Salvo!</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', fontFamily: SORA }}>Erro ao salvar</span>
        )}
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 3: DOCUMENTOS ═══

function DocumentosSection({ documents, fiscal, mutate }: { documents: any[]; fiscal: any; mutate: () => void }) {
  const { uploadDocument, deleteDocument } = useDocumentMutations();
  const idRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;
  const docs = Array.isArray(documents) ? documents : [];

  const idDoc = docs.find((d: any) => d.type === 'DOCUMENT_FRONT');
  const secondDoc = isPJ
    ? docs.find((d: any) => d.type === 'COMPANY_DOCUMENT')
    : docs.find((d: any) => d.type === 'PROOF_OF_ADDRESS');

  const handleUpload = async (type: string, file: File) => {
    setError('');
    setUploading(type);
    try {
      await uploadDocument(type, file);
      mutate();
    } catch (e: any) { setError(e?.message || 'Erro ao salvar. Tente novamente.'); }
    setUploading(null);
  };

  const handleDelete = async (docId: string) => {
    setError('');
    try {
      await deleteDocument(docId);
      mutate();
    } catch (e: any) { setError(e?.message || 'Erro ao salvar. Tente novamente.'); }
  };

  const UploadZone = ({ label, sublabel, type, doc, inputRef }: {
    label: string; sublabel: string; type: string; doc: any; inputRef: React.RefObject<HTMLInputElement | null>;
  }) => {
    const [hover, setHover] = useState(false);
    const isUploading = uploading === type;

    if (doc) {
      return (
        <div style={{
          background: '#19191C', border: '1px solid #222226', borderRadius: 6, padding: 16,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ color: '#6E6E73' }}>{Icons.doc(20)}</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>
              {doc.fileName || doc.originalName || label}
            </span>
            <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: SORA }}>
              Enviado em {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('pt-BR') : '--'}
            </span>
          </div>
          <StatusBadge status={doc.status || 'pending'} />
          {(doc.status === 'pending' || !doc.status) && (
            <button
              onClick={() => handleDelete(doc.id)}
              style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}
            >
              {Icons.trash(14)}
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          const file = e.dataTransfer.files[0];
          if (file) handleUpload(type, file);
        }}
        style={{
          border: `1px dashed ${hover ? EMBER : '#222226'}`, borderRadius: 6, padding: '28px 20px',
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 10,
          cursor: 'pointer', transition: 'all 150ms ease', background: hover ? 'rgba(232,93,48,.02)' : 'transparent',
        }}
      >
        <span style={{ color: hover ? EMBER : '#3A3A3F', transition: 'color .15s' }}>{Icons.upload(24)}</span>
        <div style={{ textAlign: 'center' as const }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{label}</span>
          <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>{sublabel}</span>
        </div>
        {isUploading && (
          <div style={{ marginTop: 2 }}>
            <PulseLoader width={84} height={18} />
          </div>
        )}
        <input
          aria-label={label}
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(type, file);
          }}
        />
      </div>
    );
  };

  return (
    <SectionCard title="Documentos" subtitle="Envie os documentos necessarios para verificacao">
      <div style={{
        background: 'rgba(59,130,246,.04)', border: '1px solid rgba(59,130,246,.15)', borderRadius: 6,
        padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ color: '#3B82F6', marginTop: 2, flexShrink: 0 }}>{Icons.clock(16)}</span>
        <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
          A analise dos documentos pode levar ate 48 horas uteis. Voce sera notificado por e-mail quando o resultado estiver disponivel.
        </span>
      </div>

      {error && <span style={{ fontSize: 11, color: '#EF4444', marginTop: 8, display: 'block', fontFamily: SORA }}>{error}</span>}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <UploadZone
          label="Documento de identidade"
          sublabel="RG, CNH ou Passaporte"
          type="DOCUMENT_FRONT"
          doc={idDoc}
          inputRef={idRef}
        />
        <UploadZone
          label={isPJ ? 'Contrato social ou cartao CNPJ' : 'Comprovante de residencia'}
          sublabel={isPJ ? 'Documento da empresa' : 'Conta de luz, agua, internet (ate 90 dias)'}
          type={isPJ ? 'COMPANY_DOCUMENT' : 'PROOF_OF_ADDRESS'}
          doc={secondDoc}
          inputRef={secondRef}
        />
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 4: DADOS BANCARIOS ═══

function DadosBancariosSection({ bankAccount, fiscal, profile, mutate }: { bankAccount: any; fiscal: any; profile: any; mutate: () => void }) {
  const { updateBank } = useBankMutations();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  const [form, setForm] = useState({
    bankName: '',
    bankCode: '',
    agency: '',
    account: '',
    accountType: 'CHECKING',
    pixKey: '',
    pixKeyType: '',
    holderName: '',
    holderDocument: '',
  });

  // Bank dropdown state
  const [bankSearch, setBankSearch] = useState('');
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [showAllBanks, setShowAllBanks] = useState(false);
  const bankRef = useRef<HTMLDivElement>(null);

  // Remove accents for search (itau → matches Itaú)
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const searchTerm = bankSearch.trim();
  const filteredBanks = bankDropdownOpen
    ? (searchTerm
        ? BRAZILIAN_BANKS.filter(b => {
            const q = normalize(searchTerm);
            return normalize(b.fullName).includes(q) ||
              normalize(b.name).includes(q) ||
              formatBankCode(b.code).includes(searchTerm) ||
              String(b.code) === searchTerm;
          })
        : showAllBanks
          ? BRAZILIAN_BANKS
          : BRAZILIAN_BANKS.filter(b => POPULAR_BANK_CODES.has(b.code))
      )
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bankRef.current && !bankRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
        setBankSearch('');
        setShowAllBanks(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectBank = (bank: typeof BRAZILIAN_BANKS[number]) => {
    setForm(prev => ({ ...prev, bankName: bank.fullName, bankCode: formatBankCode(bank.code) }));
    setBankSearch('');
    setBankDropdownOpen(false);
  };

  // Resolve holder from fiscal type: PJ → razão social + CNPJ, PF → nome + CPF
  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;
  const autoHolderName = isPJ
    ? (fiscal?.razaoSocial || fiscal?.nomeFantasia || '')
    : (profile?.name || fiscal?.fullName || '');
  const autoHolderDoc = isPJ
    ? (fiscal?.cnpj || '')
    : (fiscal?.cpf || profile?.documentNumber || '');

  useEffect(() => {
    if (bankAccount) {
      setForm({
        bankName: bankAccount.bankName || '',
        bankCode: bankAccount.bankCode || '',
        agency: bankAccount.agency || '',
        account: bankAccount.account || '',
        accountType: bankAccount.accountType || 'CHECKING',
        pixKey: bankAccount.pixKey || '',
        pixKeyType: bankAccount.pixKeyType || '',
        holderName: bankAccount.holderName || autoHolderName,
        holderDocument: bankAccount.holderDocument || autoHolderDoc,
      });
    } else {
      setForm(prev => ({
        ...prev,
        holderName: autoHolderName || prev.holderName,
        holderDocument: autoHolderDoc || prev.holderDocument,
      }));
    }
  }, [bankAccount, fiscal, profile, autoHolderName, autoHolderDoc]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    if (!form.bankName || !form.bankCode) {
      setError('Selecione um banco da lista.');
      return;
    }
    setSaving(true);
    try {
      await updateBank(cleanPayload(form));
      setSaveStatus('success');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const acctTypes = [
    { key: 'CHECKING', label: 'Conta corrente' },
    { key: 'SAVINGS', label: 'Conta poupanca' },
    { key: 'PAYMENT', label: 'Conta pagamento' },
  ];

  const acctBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 0', background: active ? 'rgba(232,93,48,.06)' : 'transparent',
    border: active ? `1px solid ${EMBER}` : '1px solid #222226', borderRadius: 6,
    color: active ? EMBER : '#6E6E73', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: SORA, transition: 'all 150ms ease',
  });

  return (
    <SectionCard title="Dados bancarios" subtitle="Conta para recebimento de saques">
      {/* Account type */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {acctTypes.map(t => (
          <button key={t.key} onClick={() => set('accountType', t.key)} style={acctBtnStyle(form.accountType === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Bank — searchable dropdown */}
          <div ref={bankRef} style={{ flex: 1, position: 'relative' as const }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontFamily: SORA }}>
              Banco <span style={{ color: EMBER, fontSize: 8 }}>*</span>
            </label>
            <div
              onClick={() => setBankDropdownOpen(true)}
              style={{
                width: '100%', padding: '11px 14px', background: '#111113',
                border: `1px solid ${bankDropdownOpen ? EMBER : '#222226'}`,
                boxShadow: bankDropdownOpen ? '0 0 0 3px rgba(232,93,48,.06)' : 'none',
                borderRadius: 6, fontSize: 13, fontFamily: SORA, color: '#E0DDD8',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'border-color .15s, box-shadow .15s', boxSizing: 'border-box' as const,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: form.bankName ? '#E0DDD8' : '#3A3A3F' }}>
                {form.bankName ? `${form.bankCode} — ${form.bankName}` : 'Selecione o banco'}
              </span>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth={2}
                style={{ transform: bankDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {bankDropdownOpen && (
              <div style={{
                position: 'absolute' as const, top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
                background: '#111113', border: '1px solid #222226', borderRadius: 6,
                boxShadow: '0 12px 36px rgba(0,0,0,0.5)', maxHeight: 280, display: 'flex', flexDirection: 'column' as const,
              }}>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #19191C' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0A0A0C', border: '1px solid #222226', borderRadius: 4, padding: '6px 10px' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#3A3A3F" strokeWidth={2}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input
                      aria-label="Buscar banco ou codigo"
                      value={bankSearch}
                      onChange={e => setBankSearch(e.target.value)}
                      placeholder="Buscar banco ou codigo..."
                      autoFocus
                      style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 12, fontFamily: SORA }}
                    />
                  </div>
                </div>
                <div style={{ overflowY: 'auto' as const, flex: 1, maxHeight: 220 }}>
                  {!searchTerm && !showAllBanks && <div style={{ padding: '6px 14px 2px', fontSize: 9, fontWeight: 600, color: '#3A3A3F', letterSpacing: '.06em', textTransform: 'uppercase' as const, fontFamily: SORA }}>Mais populares</div>}
                  {filteredBanks.length === 0 ? (
                    <div style={{ padding: '16px 14px', textAlign: 'center' as const, color: '#3A3A3F', fontSize: 12, fontFamily: SORA }}>Nenhum banco encontrado</div>
                  ) : filteredBanks.map(bank => {
                    const code3 = formatBankCode(bank.code);
                    const isSelected = form.bankCode === code3;
                    return (
                      <button
                        key={`${bank.code}-${bank.ispb}`}
                        onClick={() => selectBank(bank)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', background: isSelected ? 'rgba(232,93,48,0.06)' : 'transparent',
                          border: 'none', borderBottom: '1px solid #19191C', cursor: 'pointer', textAlign: 'left' as const, transition: 'background .1s',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#19191C'; }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: EMBER, width: 32, flexShrink: 0 }}>{code3}</span>
                          <span style={{ fontSize: 12, color: '#E0DDD8', fontFamily: SORA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bank.fullName}</span>
                        </div>
                        {isSelected && <span style={{ color: EMBER, flexShrink: 0 }}>{Icons.check(14)}</span>}
                      </button>
                    );
                  })}
                  {!searchTerm && !showAllBanks && (
                    <button
                      onClick={() => setShowAllBanks(true)}
                      style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid #222226', color: EMBER, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SORA, textAlign: 'center' as const }}
                    >
                      Ver todos os bancos
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bank code — auto-filled, read-only */}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontFamily: SORA }}>
              Codigo do banco <span style={{ color: EMBER, fontSize: 8 }}>*</span>
            </label>
            <div style={{
              width: '100%', padding: '11px 14px', background: '#0A0A0C',
              border: '1px solid #222226', borderRadius: 6, fontSize: 13,
              fontFamily: MONO, color: form.bankCode ? '#E0DDD8' : '#3A3A3F', boxSizing: 'border-box' as const,
            }}>
              {form.bankCode || '---'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="Agencia" placeholder="0000" value={form.agency} onChange={v => set('agency', v)} mono half />
          <Field label="Conta" placeholder="00000-0" value={form.account} onChange={v => set('account', v)} mono half />
        </div>

        {/* Titular — auto-filled from profile, read-only */}
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="Titular da conta" placeholder="Nome completo do titular" value={form.holderName} onChange={v => set('holderName', v)} half disabled />
          <Field label="CPF/CNPJ do titular" placeholder="000.000.000-00" value={form.holderDocument} onChange={v => set('holderDocument', v)} mono half disabled />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(232,93,48,0.04)', border: '1px solid rgba(232,93,48,0.1)', borderRadius: 6, marginTop: -4 }}>
          {Icons.shield(12)}
          <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: SORA }}>
            {isPJ
              ? 'Titular preenchido com a razao social e CNPJ dos dados fiscais. A conta deve ser da mesma titularidade.'
              : 'Titular preenchido com seus dados cadastrais. A conta bancaria deve ser de mesma titularidade.'}
          </span>
        </div>

        {/* PIX */}
        <div style={{ borderTop: '1px solid #19191C', marginTop: 10, paddingTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 14, fontFamily: SORA }}>PIX (opcional)</span>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field label="Chave PIX" placeholder="E-mail, CPF, celular ou chave aleatoria" value={form.pixKey} onChange={v => set('pixKey', v)} half required={false} />
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontFamily: SORA }}>Tipo da chave</label>
              <select value={form.pixKeyType} onChange={(e) => set('pixKeyType', e.target.value)}
                style={{ width: '100%', padding: '11px 14px', background: '#111113', border: '1px solid #222226', borderRadius: 6, fontSize: 13, fontFamily: SORA, color: '#E0DDD8', outline: 'none', cursor: 'pointer', appearance: 'none' as const }}>
                <option value="">Selecione...</option>
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="EMAIL">E-mail</option>
                <option value="PHONE">Celular</option>
                <option value="RANDOM">Aleatoria</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div style={{
        marginTop: 20,
        background: isPJ ? 'rgba(16,185,129,.04)' : 'rgba(245,158,11,.04)',
        border: `1px solid ${isPJ ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)'}`,
        borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ color: isPJ ? '#10B981' : '#F59E0B', marginTop: 2, flexShrink: 0 }}>{isPJ ? Icons.check(16) : Icons.alert(16)}</span>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>
            {isPJ ? 'Saque ilimitado' : 'Limite de saque mensal'}
          </span>
          <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
            {isPJ
              ? 'Contas CNPJ nao possuem limite de saque mensal.'
              : 'Como pessoa fisica, o limite de saque e de R$ 2.259,20/mes. Cadastre um CNPJ para remover o limite.'}
          </span>
        </div>
      </div>

      {error && <span style={{ fontSize: 11, color: '#EF4444', marginTop: 8, display: 'block', fontFamily: SORA }}>{error}</span>}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const, alignItems: 'center', gap: 12 }}>
        {saveStatus === 'success' && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>Salvo!</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', fontFamily: SORA }}>Erro ao salvar</span>
        )}
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 5: SEGURANCA ═══

function SegurancaSection() {
  const { changePassword } = useSecurityMutations();
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const setPw = (k: string, v: string) => setPwForm(prev => ({ ...prev, [k]: v }));

  const handleChangePw = async () => {
    setPwError('');
    setPwSuccess(false);
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('As senhas nao coincidem.');
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.newPw);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e: any) {
      setPwError(e?.message || 'Erro ao alterar senha. Verifique a senha atual.');
    }
    setSaving(false);
  };

  return (
    <>
      {/* Password card */}
      <SectionCard title="Alterar senha" subtitle="Use uma senha forte com pelo menos 8 caracteres">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <Field label="Senha atual" placeholder="Digite a senha atual" value={pwForm.current} onChange={v => setPw('current', v)} type="password" />
          <Field label="Nova senha" placeholder="Minimo 8 caracteres" value={pwForm.newPw} onChange={v => setPw('newPw', v)} type="password" />
          <Field label="Confirmar nova senha" placeholder="Repita a nova senha" value={pwForm.confirm} onChange={v => setPw('confirm', v)} type="password" />
        </div>
        {pwError && (
          <span style={{ fontSize: 11, color: '#EF4444', marginTop: 8, display: 'block', fontFamily: SORA }}>{pwError}</span>
        )}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const, alignItems: 'center', gap: 12 }}>
          {pwSuccess && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>Senha alterada!</span>
          )}
          <SaveButton saving={saving} onClick={handleChangePw} label="Alterar senha" />
        </div>
      </SectionCard>

      {/* 2FA card */}
      <SectionCard title="Autenticacao em dois fatores" subtitle="Adicione uma camada extra de seguranca a sua conta">
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3A3A3F' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Ainda indisponivel nesta conta</span>
          </div>
          <p style={{ fontSize: 12, color: '#6E6E73', fontFamily: SORA, marginTop: 6, lineHeight: 1.5 }}>Enquanto isso, mantenha uma senha forte e acompanhe acessos suspeitos pelo seu e-mail de cadastro.</p>
        </div>
      </SectionCard>

      {/* Sessions card */}
      <SectionCard title="Sessoes ativas" subtitle="Gerencie os dispositivos conectados a sua conta">
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3A3A3F' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Visao unificada ainda nao disponivel</span>
          </div>
          <p style={{ fontSize: 12, color: '#6E6E73', fontFamily: SORA, lineHeight: 1.5 }}>Esta area sera usada para listar dispositivos e permitir revogar acessos sem sair do painel principal.</p>
        </div>
      </SectionCard>
    </>
  );
}

// ═══ SECTION 6: NOTIFICACOES ═══

function NotificacoesSection() {
  return (
    <SectionCard title="Notificacoes" subtitle="Escolha como deseja ser notificado">
      <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Notificacoes por e-mail ativas</span>
        </div>
        <p style={{ fontSize: 12, color: '#6E6E73', fontFamily: SORA, lineHeight: 1.5 }}>Hoje o Kloel envia avisos de vendas e atualizacoes de conta por e-mail. Quando as preferencias granulares forem liberadas, elas aparecerão aqui sem mudar o fluxo da sua conta.</p>
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 7: PERFIL PUBLICO ═══

function PerfilPublicoSection({ profile, mutate }: { profile: any; mutate: () => void }) {
  const { updateProfile } = useProfileMutations();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { previewUrl: avatarPreviewUrl } = usePersistentImagePreview({
    storageKey: 'kloel_profile_avatar_preview',
  });

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
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

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError(null);
    setSaveStatus('idle');
    setSaving(true);
    try {
      await updateProfile(cleanPayload({
        publicName: form.publicName,
        bio: form.bio,
        website: form.website,
        instagram: form.instagram,
      }));
      setSaveStatus('success');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const initials = (form.publicName || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <SectionCard title="Perfil publico" subtitle="Informacoes visiveis para compradores e afiliados">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <Field label="Nome publico" placeholder="Como voce quer ser conhecido" value={form.publicName} onChange={v => set('publicName', v)} />
          <Field label="Bio" placeholder="Uma breve descricao sobre voce ou seu negocio" value={form.bio} onChange={v => set('bio', v)} rows={3} required={false} />
          <div style={{ display: 'flex', gap: 14 }}>
            <Field label="Website" placeholder="https://seusite.com" value={form.website} onChange={v => set('website', v)} half required={false} />
            <Field label="Instagram" placeholder="@seuusuario" value={form.instagram} onChange={v => set('instagram', v)} half required={false} />
          </div>
        </div>

        {error && <span style={{ fontSize: 11, color: '#EF4444', marginTop: 8, display: 'block', fontFamily: SORA }}>{error}</span>}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const, alignItems: 'center', gap: 12 }}>
          {saveStatus === 'success' && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>Salvo!</span>
          )}
          {saveStatus === 'error' && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', fontFamily: SORA }}>Erro ao salvar</span>
          )}
          <SaveButton saving={saving} onClick={handleSave} />
        </div>
      </SectionCard>

      {/* Preview card */}
      <SectionCard title="Pre-visualizacao" subtitle="Como seu perfil aparece para os outros">
        <div style={{
          background: '#19191C', border: '1px solid #222226', borderRadius: 6, padding: 20,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 6, background: '#0A0A0C', border: '1px solid #222226',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6,
          }}>
            {avatarPreviewUrl || profile?.avatarUrl ? (
              <img
                src={avatarPreviewUrl || profile?.avatarUrl}
                alt=""
                style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%', borderRadius: 6, display: 'block' }}
              />
            ) : (
              <span style={{ fontFamily: SORA, fontSize: 18, fontWeight: 700, color: '#3A3A3F' }}>{initials}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>
              {form.publicName || 'Seu nome'}
            </span>
            {form.bio && (
              <span style={{ fontSize: 11, color: '#6E6E73', display: 'block', marginTop: 2, fontFamily: SORA }}>{form.bio}</span>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {form.website && (
                <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: SORA, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {Icons.globe(10)} {form.website.replace(/^https?:\/\//, '')}
                </span>
              )}
              {form.instagram && (
                <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: SORA }}>{form.instagram}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: EMBER }}>0</span>
            <span style={{ fontSize: 9, color: '#3A3A3F', display: 'block', fontFamily: SORA }}>produtos</span>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// ═══ SECTION 8: IDIOMAS ═══

function IdiomasSection() {
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'pt-BR';
    return localStorage.getItem('kloel:language') || 'pt-BR';
  });

  const handleChange = (value: string) => {
    setLanguage(value);
    localStorage.setItem('kloel:language', value);
  };

  const languages = [
    { key: 'pt-BR', label: 'Portugues (BR)', code: 'BR', disabled: false },
    { key: 'en', label: 'English', code: 'EN', disabled: true },
    { key: 'es', label: 'Espanol', code: 'ES', disabled: true },
  ];

  return (
    <SectionCard title="Idiomas" subtitle="Selecione o idioma de preferencia da plataforma">
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {languages.map(lang => {
          const isActive = language === lang.key;
          return (
            <button
              key={lang.key}
              onClick={() => { if (!lang.disabled) handleChange(lang.key); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                background: isActive ? 'rgba(232,93,48,.06)' : lang.disabled ? '#0A0A0C' : '#111113',
                border: isActive ? `1px solid ${EMBER}` : '1px solid #222226',
                borderRadius: 8, cursor: lang.disabled ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease', textAlign: 'left' as const, fontFamily: SORA,
                opacity: lang.disabled ? 0.5 : 1, width: '100%',
              }}
            >
              {/* Radio indicator */}
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: isActive ? `2px solid ${EMBER}` : '2px solid #3A3A3F',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'border-color 150ms ease',
              }}>
                {isActive && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: EMBER }} />
                )}
              </div>
              <span
                style={{
                  fontSize: 10,
                  lineHeight: '16px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const,
                  color: '#8A8A91',
                  minWidth: 24,
                  flexShrink: 0,
                }}
              >
                {lang.code}
              </span>
              <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#E0DDD8' : '#6E6E73', flex: 1 }}>
                {lang.label}
              </span>
              {lang.disabled && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: EMBER, background: 'rgba(232,93,48,0.1)',
                  padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' as const, fontFamily: SORA,
                  flexShrink: 0,
                }}>
                  Planejado
                </span>
              )}
              {isActive && !lang.disabled && (
                <span style={{ color: EMBER, flexShrink: 0 }}>{Icons.check(14)}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{
        marginTop: 16,
        background: 'rgba(59,130,246,.04)', border: '1px solid rgba(59,130,246,.15)', borderRadius: 6,
        padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ color: '#3B82F6', marginTop: 2, flexShrink: 0 }}>{Icons.clock(16)}</span>
        <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
          A traducao completa da plataforma esta em andamento. Algumas secoes podem permanecer em portugues temporariamente.
        </span>
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 9: AJUDA ═══

function AjudaSection() {
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  const faqs = [
    { q: 'Como conecto meu WhatsApp?', a: 'Acesse a secao "WhatsApp" no menu lateral e escaneie o QR Code com o aplicativo do WhatsApp no seu celular.' },
    { q: 'Quanto tempo leva a verificacao KYC?', a: 'A analise dos documentos pode levar ate 48 horas uteis. Voce sera notificado por e-mail quando o resultado estiver disponivel.' },
    { q: 'Qual o limite de saque mensal?', a: 'Para contas com CPF, o limite e de R$ 2.259,20/mes. Cadastre um CNPJ nos dados fiscais para remover esse limite.' },
    { q: 'Como altero meu plano?', a: 'Entre em contato com nosso suporte via WhatsApp ou e-mail para solicitar alteracoes no seu plano atual.' },
  ];

  const toggle = (idx: number) => {
    setOpenQuestion(openQuestion === idx ? null : idx);
  };

  const helpLinks = [
    { label: 'Central de Ajuda', href: '#', target: '_blank', icon: Icons.help },
    { label: 'Contato / Suporte', href: 'mailto:suporte@kloel.com', target: undefined, icon: Icons.bell },
  ];

  return (
    <>
      <SectionCard title="Precisa de ajuda?" subtitle="Entre em contato conosco ou consulte as perguntas frequentes">
        {/* Quick links */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 24 }}>
          {helpLinks.map(link => (
            <a
              key={link.label}
              href={link.href}
              target={link.target}
              rel={link.target === '_blank' ? 'noopener noreferrer' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                background: '#111113', border: '1px solid #222226', borderRadius: 8,
                textDecoration: 'none', color: '#E0DDD8', fontSize: 13, fontFamily: SORA,
                transition: 'all 150ms ease', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = EMBER; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#222226'; }}
            >
              <span style={{ color: EMBER, flexShrink: 0 }}>{link.icon(16)}</span>
              <span style={{ flex: 1 }}>{link.label}</span>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#3A3A3F" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          ))}
        </div>

        {/* Contact buttons */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <a
            href="https://wa.me/5500000000000"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, padding: '14px 20px', background: 'rgba(37,211,102,.06)',
              border: '1px solid rgba(37,211,102,.2)', borderRadius: 6,
              color: '#25D366', fontSize: 13, fontWeight: 600, fontFamily: SORA,
              textDecoration: 'none', textAlign: 'center' as const, cursor: 'pointer',
              transition: 'all 150ms ease', display: 'block',
            }}
          >
            WhatsApp
          </a>
          <a
            href="mailto:suporte@kloel.com"
            style={{
              flex: 1, padding: '14px 20px', background: 'rgba(232,93,48,.06)',
              border: `1px solid rgba(232,93,48,.2)`, borderRadius: 6,
              color: EMBER, fontSize: 13, fontWeight: 600, fontFamily: SORA,
              textDecoration: 'none', textAlign: 'center' as const, cursor: 'pointer',
              transition: 'all 150ms ease', display: 'block',
            }}
          >
            E-mail
          </a>
        </div>

        {/* FAQ Accordion */}
        <div style={{ borderTop: '1px solid #19191C', paddingTop: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 14, fontFamily: SORA }}>Perguntas frequentes</span>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {faqs.map((faq, idx) => (
              <div key={idx} style={{ background: '#19191C', border: '1px solid #222226', borderRadius: 6, overflow: 'hidden' }}>
                <button
                  onClick={() => toggle(idx)}
                  style={{
                    width: '100%', padding: '12px 16px', background: 'transparent', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', fontFamily: SORA,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8', textAlign: 'left' as const }}>{faq.q}</span>
                  <span style={{ color: '#3A3A3F', transform: openQuestion === idx ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0, marginLeft: 8 }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {openQuestion === idx && (
                  <div style={{ padding: '0 16px 12px', fontSize: 11, color: '#6E6E73', lineHeight: 1.6, fontFamily: SORA }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Platform version */}
        <div style={{
          borderTop: '1px solid #19191C', marginTop: 20, paddingTop: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#3A3A3F', flexShrink: 0 }}>{Icons.shield(14)}</span>
          <span style={{ fontSize: 11, color: '#3A3A3F', fontFamily: SORA }}>
            Versao da plataforma: Kloel v1.0.0-beta
          </span>
        </div>
      </SectionCard>
    </>
  );
}

// ═══ META PLATFORM CONNECT ═══

function MetaConnectSection() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    apiFetch('/meta/auth/status').then((data: any) => {
      setStatus(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    try {
      const res = await apiFetch('/meta/auth/url');
      const url = (res as any)?.url || (res as any)?.data?.url;
      if (url) {
        window.open(url, 'meta-auth', 'width=600,height=700');
      }
    } catch {
      // silent
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await apiFetch('/meta/auth/disconnect', { method: 'POST' });
      setStatus({ connected: false });
      globalMutate((key: string) => typeof key === 'string' && key.startsWith('/meta'));
    } catch {
      // silent
    }
    setDisconnecting(false);
  };

  if (loading) {
    return (
      <SectionCard title="Meta Platform" subtitle="Instagram, Messenger, Meta Ads">
        <div style={{ fontSize: 12, color: '#6E6E73', fontFamily: SORA }}>Carregando...</div>
      </SectionCard>
    );
  }

  if (status?.connected) {
    return (
      <SectionCard title="Meta Platform" subtitle="Instagram, Messenger, Meta Ads">
        <div style={{
          background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.15)', borderRadius: 6,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#10B981', fontFamily: SORA, display: 'block' }}>
              Conectado ao Meta
            </span>
            <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
              {status.pageName ? `Pagina: ${status.pageName}` : ''}
              {status.instagramUsername ? ` | @${status.instagramUsername}` : ''}
              {status.adAccountId ? ` | Ads: ${status.adAccountId}` : ''}
            </span>
          </div>
        </div>
        {status.tokenExpired && (
          <div style={{
            background: 'rgba(245,158,11,.04)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 6,
            padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 11, color: '#F59E0B', fontFamily: SORA }}>Token expirado. Reconecte para renovar.</span>
            <button onClick={handleConnect} style={{
              padding: '6px 14px', background: EMBER, border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SORA,
            }}>Reconectar</button>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              padding: '9px 20px', background: 'transparent',
              border: '1px solid rgba(239,68,68,.3)', borderRadius: 6,
              color: '#EF4444', fontSize: 12, fontWeight: 600,
              cursor: disconnecting ? 'not-allowed' : 'pointer',
              fontFamily: SORA, transition: 'all 150ms ease',
              opacity: disconnecting ? 0.5 : 1,
            }}
          >
            {disconnecting ? 'Desconectando...' : 'Desconectar Meta'}
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Meta Platform" subtitle="Conecte Instagram, Messenger e Meta Ads">
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16, padding: '16px 0' }}>
        <div style={{ color: '#1877F2', opacity: 0.3 }}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </div>
        <div style={{ fontSize: 13, color: '#6E6E73', fontFamily: SORA, textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
          Conecte sua conta Meta para gerenciar Instagram DM, Messenger e Meta Ads diretamente na KLOEL.
        </div>
        <button
          onClick={handleConnect}
          style={{
            padding: '11px 28px', background: '#1877F2',
            border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: SORA, transition: 'all 150ms ease',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Conectar com Meta
        </button>
      </div>
    </SectionCard>
  );
}

// ═══ SECTION: EQUIPE ═══

function TeamSection() {
  const { data, isLoading, mutate } = useSWR('/team', swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const members: any[] = (data as any)?.members || [];
  const invites: any[] = (data as any)?.invites || [];

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      await inviteTeamMember(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setInviteSuccess(`Convite enviado para ${inviteEmail.trim()}`);
      await mutate();
    } catch (e: any) {
      setInviteError(e?.message || 'Erro ao enviar convite');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeTeamInvite(id);
      await mutate();
    } catch { /* silent */ } finally {
      setRevokingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remover este membro da equipe?')) return;
    setRemovingId(id);
    try {
      await removeTeamMember(id);
      await mutate();
    } catch { /* silent */ } finally {
      setRemovingId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', background: '#111113',
    border: '1px solid #222226', borderRadius: 6, fontSize: 13,
    fontFamily: SORA, color: '#E0DDD8', boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  const ROLES: Record<string, string> = {
    admin: 'Administrador',
    member: 'Membro',
    viewer: 'Visualizador',
  };

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#E0DDD8', margin: '0 0 16px', fontFamily: SORA }}>Equipe</h2>

      {/* Invite form */}
      <SectionCard title="Convidar membro" subtitle="Envie um convite por email para adicionar alguem a sua equipe">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 6, fontFamily: SORA }}>Email</label>
            <input
              aria-label="Email do convidado"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
              placeholder="email@exemplo.com"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 6, fontFamily: SORA }}>Funcao</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={selectStyle}>
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            style={{
              padding: '11px 20px', background: inviting || !inviteEmail.trim() ? '#3A3A3F' : EMBER,
              border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: inviting || !inviteEmail.trim() ? 'not-allowed' : 'pointer', fontFamily: SORA,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {Icons.plus(12)} {inviting ? 'Enviando...' : 'Convidar'}
          </button>
        </div>
        {inviteError && <p style={{ fontSize: 11, color: '#EF4444', margin: '8px 0 0', fontFamily: SORA }}>{inviteError}</p>}
        {inviteSuccess && <p style={{ fontSize: 11, color: '#10B981', margin: '8px 0 0', fontFamily: SORA }}>{inviteSuccess}</p>}
      </SectionCard>

      {/* Active members */}
      <SectionCard title="Membros ativos">
        {isLoading ? (
          <span style={{ fontSize: 12, color: '#3A3A3F', fontFamily: SORA }}>Carregando...</span>
        ) : members.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' as const }}>
            <span style={{ color: '#3A3A3F' }}>{Icons.users(28)}</span>
            <p style={{ fontSize: 12, color: '#3A3A3F', margin: '8px 0 0', fontFamily: SORA }}>Nenhum membro na equipe ainda</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {members.map((m: any) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #19191C' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#19191C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6E6E73' }}>
                  {Icons.user(14)}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{m.name || m.email}</span>
                  <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>{m.email} &middot; {ROLES[m.role] || m.role}</span>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, fontFamily: SORA,
                  color: m.status === 'active' ? '#10B981' : '#F59E0B',
                  background: m.status === 'active' ? 'rgba(16,185,129,.08)' : 'rgba(245,158,11,.08)',
                }}>
                  {m.status === 'active' ? 'Ativo' : 'Pendente'}
                </span>
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={removingId === m.id}
                  style={{ padding: '5px 8px', background: 'none', border: '1px solid #222226', borderRadius: 4, color: '#EF4444', cursor: 'pointer', display: 'flex', opacity: removingId === m.id ? 0.5 : 1 }}
                  title="Remover membro"
                >
                  {Icons.trash(12)}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Pending invites */}
      {invites.filter((inv: any) => inv.status === 'pending').length > 0 && (
        <SectionCard title="Convites pendentes">
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {invites.filter((inv: any) => inv.status === 'pending').map((inv: any) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #19191C' }}>
                <span style={{ color: '#3A3A3F' }}>{Icons.mail(16)}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{inv.email}</span>
                  <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>{ROLES[inv.role] || inv.role} &middot; Aguardando aceite</span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, color: '#F59E0B', background: 'rgba(245,158,11,.08)', fontFamily: SORA }}>Pendente</span>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={revokingId === inv.id}
                  style={{ padding: '5px 10px', background: 'none', border: '1px solid #222226', borderRadius: 4, color: '#6E6E73', fontSize: 10, cursor: 'pointer', fontFamily: SORA, opacity: revokingId === inv.id ? 0.5 : 1 }}
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ═══ SECTION 10: SAIR ═══

function SairSection() {
  const router = useRouter();

  const handleLogout = () => {
    tokenStorage.clear();
    router.push('/login');
  };

  return (
    <SectionCard title="Sair da conta" subtitle="Encerre sua sessao atual">
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16, padding: '20px 0' }}>
        <span style={{ color: '#EF4444' }}>{Icons.logout(32)}</span>
        <p style={{ fontSize: 13, color: '#6E6E73', fontFamily: SORA, textAlign: 'center' as const, margin: 0, lineHeight: 1.6 }}>
          Ao sair, voce sera desconectado desta sessao. Seus dados permanecem salvos e voce podera fazer login novamente a qualquer momento.
        </p>
        <button
          onClick={handleLogout}
          style={{
            padding: '12px 32px', background: '#EF4444', border: 'none', borderRadius: 6,
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: SORA, transition: 'all 150ms ease',
          }}
        >
          Sair da conta
        </button>
      </div>
    </SectionCard>
  );
}

// ═══ MAIN COMPONENT ═══

export default function ContaView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<SettingsSectionKey>(() => resolveSettingsSection(searchParams.get('section')));
  const { profile, isLoading: profileLoading, mutate: mutateProfile } = useProfile();
  const { fiscal, mutate: mutateFiscal } = useFiscalData();
  const { documents, mutate: mutateDocs } = useKycDocuments();
  const { bankAccount, mutate: mutateBank } = useBankAccount();
  const { status, mutate: mutateStatus } = useKycStatus();
  const { completion, mutate: mutateCompletion } = useKycCompletion();
  const { submitKyc } = useKycSubmit();
  const [submitError, setSubmitError] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<'none' | 'trial' | 'active' | 'expired' | 'suspended'>('none');
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [hasCard, setHasCard] = useState(false);

  const completionData = completion || { percentage: 0, sections: [] };
  const sectionStatus = (name: string) => {
    const s = completionData.sections?.find((sec: any) => sec.name === name);
    return s?.complete ? 'approved' : 'pending';
  };

  const kycStatus = status?.kycStatus || 'pending';
  const pct = completionData.percentage || 0;
  const isBlocked = pct < 100 || kycStatus !== 'approved';

  const loadBillingSummary = useCallback(async () => {
    try {
      const [subscriptionResponse, paymentMethodsResponse] = await Promise.all([
        billingApi.getSubscription(),
        billingApi.getPaymentMethods(),
      ]);

      if (subscriptionResponse.data) {
        setSubscriptionStatus(subscriptionResponse.data.status ?? 'none');
        setTrialDaysLeft(subscriptionResponse.data.trialDaysLeft ?? 0);
        setCreditsBalance(subscriptionResponse.data.creditsBalance ?? 0);
      } else {
        setSubscriptionStatus('none');
        setTrialDaysLeft(0);
        setCreditsBalance(0);
      }

      setHasCard(!!paymentMethodsResponse.data?.paymentMethods?.length);
    } catch {
      setSubscriptionStatus('none');
      setTrialDaysLeft(0);
      setCreditsBalance(0);
      setHasCard(false);
    }
  }, []);

  useEffect(() => {
    void loadBillingSummary();
  }, [loadBillingSummary]);

  useEffect(() => {
    const nextSection = resolveSettingsSection(searchParams.get('section'));
    setSection((current) => (current === nextSection ? current : nextSection));
  }, [searchParams]);

  const handleSelectSection = useCallback((nextSection: SettingsSectionKey) => {
    setSection(nextSection);
    const params = new URLSearchParams(searchParams.toString());
    if (nextSection === DEFAULT_SETTINGS_SECTION) {
      params.delete('section');
    } else {
      params.set('section', nextSection);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleActivateTrialFromSettings = useCallback(async () => {
    await billingApi.activateTrial();
    await loadBillingSummary();
  }, [loadBillingSummary]);

  const showSystemAlerts =
    section === 'account' ||
    section === 'billing' ||
    section === 'apps' ||
    section === 'brain' ||
    section === 'crm' ||
    section === 'analytics' ||
    section === 'activity';

  const workspaceIcons: Record<string, (s: number) => React.ReactNode> = {
    user: Icons.user,
    bank: Icons.bank,
    shield: Icons.shield,
    users: Icons.users,
    eye: Icons.eye,
    clock: Icons.clock,
  };

  const SECTIONS: Array<{ key: SettingsSectionKey; label: string; icon: (s: number) => React.ReactNode; statusKey: string | null }> = [
    { key: 'pessoal', label: 'Dados pessoais', icon: Icons.user, statusKey: 'profile' },
    { key: 'fiscal', label: 'Dados fiscais', icon: Icons.building, statusKey: 'fiscal' },
    { key: 'documentos', label: 'Documentos', icon: Icons.doc, statusKey: 'documents' },
    { key: 'bancario', label: 'Dados bancarios', icon: Icons.bank, statusKey: 'bank' },
    ...WORKSPACE_SETTINGS_SECTIONS.map((sectionDef) => ({
      key: sectionDef.key as SettingsSectionKey,
      label: sectionDef.label,
      icon: workspaceIcons[sectionDef.iconKey],
      statusKey: null,
    })),
    { key: 'apps', label: 'Apps e integracoes', icon: Icons.globe, statusKey: null },
    { key: 'seguranca', label: 'Seguranca', icon: Icons.shield, statusKey: null },
    { key: 'equipe', label: 'Equipe', icon: Icons.users, statusKey: null },
    { key: 'notificacoes', label: 'Notificacoes', icon: Icons.bell, statusKey: null },
    { key: 'perfil', label: 'Perfil publico', icon: Icons.globe, statusKey: null },
    { key: 'idiomas', label: 'Idiomas', icon: Icons.language, statusKey: null },
    { key: 'presentear', label: 'Presentear Kloel', icon: Icons.help, statusKey: null },
    { key: 'saiba-mais', label: 'Saiba mais', icon: Icons.help, statusKey: null },
    { key: 'ajuda', label: 'Ajuda', icon: Icons.help, statusKey: null },
    { key: 'sair', label: 'Sair', icon: Icons.logout, statusKey: null },
  ];

  const mutateAll = () => { mutateCompletion(); };

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0C', fontFamily: SORA, color: '#E0DDD8' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Minha conta</h1>
            <p style={{ fontSize: 12, color: '#6E6E73', margin: '4px 0 0' }}>Preencha todos os campos obrigatorios para utilizar a plataforma</p>
          </div>
          <StatusBadge status={kycStatus} />
        </div>

        {/* Blocker Banner */}
        {isBlocked && (
          <div style={{
            background: 'rgba(245,158,11,.04)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 6,
            padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ color: '#F59E0B' }}>{Icons.alert(20)}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block' }}>Cadastro incompleto</span>
              <span style={{ fontSize: 11, color: '#6E6E73' }}>
                Voce pode visualizar todas as funcionalidades, mas para criar produtos, se afiliar e utilizar a IA, complete seu cadastro e aguarde a aprovacao.
              </span>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: pct === 100 ? '#10B981' : '#F59E0B' }}>{pct}%</span>
              <span style={{ fontSize: 9, color: '#3A3A3F', display: 'block' }}>completo</span>
            </div>
          </div>
        )}

        {profileLoading && (
          <div style={{
            background: 'rgba(59,130,246,.04)', border: '1px solid rgba(59,130,246,.15)', borderRadius: 6,
            padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ color: '#3B82F6', flexShrink: 0 }}>{Icons.clock(18)}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block' }}>Sincronizando dados da conta</span>
              <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
                O painel continua disponível enquanto perfil, workspace e status regulatório são revalidados.
              </span>
            </div>
            <PulseLoader width={84} height={18} />
          </div>
        )}

        {/* Progress bar */}
        <div style={{ height: 4, background: '#19191C', borderRadius: 2, marginBottom: 24 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10B981' : EMBER, borderRadius: 2, transition: 'width .3s' }} />
        </div>

        {/* Layout: sidebar + content */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
          {/* Left nav */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {SECTIONS.map(sec => {
              const active = section === sec.key;
              const done = sec.statusKey ? sectionStatus(sec.statusKey) === 'approved' : false;
              return (
                <button
                  key={sec.key}
                  onClick={() => handleSelectSection(sec.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: active ? '#111113' : 'transparent',
                    border: active ? '1px solid #222226' : '1px solid transparent',
                    borderRadius: 6, cursor: 'pointer', transition: 'all .15s',
                    textAlign: 'left' as const, fontFamily: SORA,
                  }}
                >
                  <span style={{ color: active ? EMBER : done ? '#10B981' : '#3A3A3F' }}>{sec.icon(16)}</span>
                  <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#E0DDD8' : '#6E6E73', flex: 1 }}>{sec.label}</span>
                  {done ? <span style={{ color: '#10B981' }}>{Icons.check(12)}</span> : null}
                </button>
              );
            })}

            {/* Danger zone */}
            <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #19191C' }}>
              <button
                onClick={() => { if (confirm('Para encerrar sua conta, entre em contato com nosso suporte via chat ou WhatsApp.')) { /* no-op */ } }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444',
                  fontSize: 11, fontFamily: SORA,
                }}
              >
                {Icons.alert(14)} Encerrar conta
              </button>
            </div>
          </div>

          {/* Right content */}
          <div key={section} style={{ animation: 'fadeIn .3s' }}>
            {showSystemAlerts && (
              <div style={{ marginBottom: 20 }}>
                <SystemAlertsCard />
              </div>
            )}
            {section === 'pessoal' && (
              <DadosPessoaisSection profile={profile} mutate={() => { mutateProfile(); mutateAll(); }} />
            )}
            {section === 'fiscal' && (
              <DadosFiscaisSection fiscal={fiscal} mutate={() => { mutateFiscal(); mutateAll(); }} />
            )}
            {section === 'documentos' && (
              <DocumentosSection documents={documents} fiscal={fiscal} mutate={() => { mutateDocs(); mutateAll(); }} />
            )}
            {section === 'bancario' && (
              <DadosBancariosSection bankAccount={bankAccount} fiscal={fiscal} profile={profile} mutate={() => { mutateBank(); mutateAll(); }} />
            )}
            {section === 'account' && <AccountSettingsSection />}
            {section === 'billing' && (
              <BillingSettingsSection
                subscriptionStatus={subscriptionStatus}
                trialDaysLeft={trialDaysLeft}
                creditsBalance={creditsBalance}
                hasCard={hasCard}
                onActivateTrial={handleActivateTrialFromSettings}
              />
            )}
            {section === 'brain' && <BrainSettingsSection />}
            {section === 'crm' && <CrmSettingsSection />}
            {section === 'analytics' && <AnalyticsSettingsSection />}
            {section === 'activity' && <ActivitySection />}
            {section === 'seguranca' && <SegurancaSection />}
            {section === 'equipe' && <TeamSection />}
            {section === 'notificacoes' && <NotificacoesSection />}
            {section === 'perfil' && (
              <PerfilPublicoSection profile={profile} mutate={() => { mutateProfile(); mutateAll(); }} />
            )}
            {section === 'apps' && (
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#E0DDD8', margin: '0 0 16px', fontFamily: SORA }}>Apps e integracoes</h2>
                <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
                  {[
                    { name: 'WhatsApp e Inbox', status: 'Operacional', connected: true, cta: 'Abrir inbox', action: () => router.push('/inbox') },
                    { name: 'Meta Platform', status: 'Gerenciar', connected: true, cta: 'Abrir anuncios', action: () => router.push('/anuncios') },
                    { name: 'Plano e cobranca Kloel', status: 'Operacional', connected: true, cta: 'Abrir billing', action: () => handleSelectSection('billing') },
                    { name: 'CRM e analytics', status: 'Ajustar', connected: true, cta: 'Abrir configuracoes', action: () => handleSelectSection('crm') },
                  ].map((app) => (
                    <div key={app.name} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: app.connected ? '#10B981' : '#3A3A3F' }} />
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', fontFamily: SORA, display: 'block' }}>{app.name}</span>
                          <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>{app.status}</span>
                        </div>
                      </div>
                      <button
                        onClick={app.action}
                        style={{
                          padding: '8px 14px',
                          background: 'transparent',
                          border: '1px solid #222226',
                          borderRadius: 6,
                          color: app.connected ? '#E0DDD8' : '#6E6E73',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: SORA,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {app.cta}
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '14px 18px', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Integrações publicadas do Kloel</div>
                  <div style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA, lineHeight: 1.6, marginTop: 6 }}>
                    Esta área agora concentra apenas integrações reais ou já operacionais em outros módulos. O que ainda não existe de forma utilizável não aparece mais como promessa dentro da sua conta.
                  </div>
                </div>
                <MetaConnectSection />
              </div>
            )}
            {section === 'presentear' && (
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#E0DDD8', margin: '0 0 16px', fontFamily: SORA }}>Presentear Kloel</h2>
                <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 24 }}>
                  <p style={{ fontSize: 13, color: '#6E6E73', margin: '0 0 16px' }}>Compartilhe seu link de indicacao e ganhe beneficios quando seus amigos se cadastrarem.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input aria-label="Link de indicacao" readOnly value={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/seu-codigo`} style={{ flex: 1, background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, padding: '10px 14px', color: '#E0DDD8', fontSize: 13, fontFamily: SORA }} />
                    <button onClick={() => { navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/seu-codigo`); }} style={{ padding: '10px 18px', background: EMBER, color: '#0A0A0C', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>Copiar</button>
                  </div>
                </div>
              </div>
            )}
            {section === 'saiba-mais' && (
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#E0DDD8', margin: '0 0 16px', fontFamily: SORA }}>Saiba mais</h2>
                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    { label: 'Termos de uso', url: '/terms' },
                    { label: 'Politica de privacidade', url: '/privacy' },
                    { label: 'Documentacao', url: '/terms' },
                    { label: 'Contato', url: 'mailto:suporte@kloel.com' },
                  ].map((link) => (
                    <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '14px 18px', textDecoration: 'none', color: '#E0DDD8', fontSize: 13, fontFamily: SORA }}>
                      {link.label}
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {section === 'idiomas' && <IdiomasSection />}
            {section === 'ajuda' && <AjudaSection />}
            {section === 'sair' && <SairSection />}
          </div>
        </div>

        {/* Submit KYC button */}
        {pct >= 100 && kycStatus === 'pending' && (
          <div style={{ marginTop: 32, textAlign: 'center' as const }}>
            {submitError && <span style={{ fontSize: 12, color: '#EF4444', display: 'block', marginBottom: 8, fontFamily: SORA }}>{submitError}</span>}
            <button
              onClick={async () => {
                setSubmitError('');
                try {
                  await submitKyc();
                  mutateCompletion();
                  mutateStatus();
                } catch (e: any) {
                  setSubmitError(e?.message || 'Erro ao enviar. Tente novamente.');
                }
              }}
              style={{
                padding: '14px 40px', background: EMBER, border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: SORA,
              }}
            >
              Enviar para analise
            </button>
          </div>
        )}
      </div>

      {/* CSS animation */}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
