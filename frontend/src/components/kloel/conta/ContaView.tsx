'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
};

// ═══ STATUS CONFIG ═══

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: '#F59E0B', bg: 'rgba(245,158,11,.06)', icon: Icons.clock },
  submitted: { label: 'Em analise', color: '#3B82F6', bg: 'rgba(59,130,246,.06)', icon: Icons.eye },
  approved: { label: 'Aprovado', color: '#10B981', bg: 'rgba(16,185,129,.06)', icon: Icons.check },
  rejected: { label: 'Reprovado', color: '#EF4444', bg: 'rgba(239,68,68,.06)', icon: Icons.alert },
};

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
  label, placeholder, value, onChange, type = 'text', mono = false, half = false,
  required = true, disabled = false, rows,
}: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void;
  type?: string; mono?: boolean; half?: boolean; required?: boolean; disabled?: boolean; rows?: number;
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
  };

  return (
    <div style={{ flex: half ? 1 : 'none', width: half ? 'auto' : '100%' }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontFamily: SORA }}>
        {label} {required && <span style={{ color: EMBER, fontSize: 8 }}>*</span>}
      </label>
      {rows ? (
        <textarea
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    documentNumber: '',
    phone: '',
    birthDate: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || '',
        email: profile.email || '',
        documentNumber: profile.documentNumber || profile.cpf || '',
        phone: profile.phone || '',
        birthDate: profile.birthDate || '',
      });
    }
  }, [profile]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: form.name,
        documentNumber: form.documentNumber,
        phone: form.phone,
        birthDate: form.birthDate,
      });
      mutate();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAvatar(file);
      mutate();
    } catch { /* silent */ }
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
            cursor: 'pointer', overflow: 'hidden',
          }}
        >
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' as const }} />
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
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <Field label="Nome completo" placeholder="Seu nome completo" value={form.name} onChange={v => set('name', v)} />
        <Field label="E-mail" value={form.email} onChange={() => {}} disabled />
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="CPF" placeholder="000.000.000-00" value={form.documentNumber} onChange={v => set('documentNumber', v)} mono half />
          <Field label="Celular" placeholder="(00) 00000-0000" value={form.phone} onChange={v => set('phone', v)} mono half />
        </div>
        <Field label="Data de nascimento" value={form.birthDate} onChange={v => set('birthDate', v)} type="date" />
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const }}>
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 2: DADOS FISCAIS ═══

function DadosFiscaisSection({ fiscal, mutate }: { fiscal: any; mutate: () => void }) {
  const { updateFiscal } = useFiscalMutations();
  const [saving, setSaving] = useState(false);
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
        legalName: fiscal.legalName || '',
        cnpj: fiscal.cnpj || '',
        razaoSocial: fiscal.razaoSocial || '',
        nomeFantasia: fiscal.nomeFantasia || '',
        inscricaoEstadual: fiscal.inscricaoEstadual || '',
        inscricaoMunicipal: fiscal.inscricaoMunicipal || '',
        responsavelCpf: fiscal.responsavelCpf || '',
        responsavelNome: fiscal.responsavelNome || '',
        cep: fiscal.cep || fiscal.address?.cep || '',
        rua: fiscal.rua || fiscal.address?.street || '',
        numero: fiscal.numero || fiscal.address?.number || '',
        complemento: fiscal.complemento || fiscal.address?.complement || '',
        bairro: fiscal.bairro || fiscal.address?.neighborhood || '',
        cidade: fiscal.cidade || fiscal.address?.city || '',
        uf: fiscal.uf || fiscal.address?.state || '',
      });
    }
  }, [fiscal]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateFiscal({ ...form, type: tipo });
      mutate();
    } catch { /* silent */ }
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
              <Field label="CNPJ" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={v => set('cnpj', v)} mono half />
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
            <Field label="CEP" placeholder="00000-000" value={form.cep} onChange={v => set('cep', v)} mono half />
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

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const }}>
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

  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;
  const docs = Array.isArray(documents) ? documents : [];

  const idDoc = docs.find((d: any) => d.type === 'identity');
  const secondDoc = isPJ
    ? docs.find((d: any) => d.type === 'company')
    : docs.find((d: any) => d.type === 'address_proof');

  const handleUpload = async (type: string, file: File) => {
    setUploading(type);
    try {
      await uploadDocument(type, file);
      mutate();
    } catch { /* silent */ }
    setUploading(null);
  };

  const handleDelete = async (docId: string) => {
    try {
      await deleteDocument(docId);
      mutate();
    } catch { /* silent */ }
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
        {isUploading && <span style={{ fontSize: 11, color: EMBER, fontFamily: SORA }}>Enviando...</span>}
        <input
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

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <UploadZone
          label="Documento de identidade"
          sublabel="RG, CNH ou Passaporte"
          type="identity"
          doc={idDoc}
          inputRef={idRef}
        />
        <UploadZone
          label={isPJ ? 'Contrato social ou cartao CNPJ' : 'Comprovante de residencia'}
          sublabel={isPJ ? 'Documento da empresa' : 'Conta de luz, agua, internet (ate 90 dias)'}
          type={isPJ ? 'company' : 'address_proof'}
          doc={secondDoc}
          inputRef={secondRef}
        />
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 4: DADOS BANCARIOS ═══

function DadosBancariosSection({ bankAccount, fiscal, mutate }: { bankAccount: any; fiscal: any; mutate: () => void }) {
  const { updateBank } = useBankMutations();
  const [saving, setSaving] = useState(false);
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
        holderName: bankAccount.holderName || '',
        holderDocument: bankAccount.holderDocument || '',
      });
    }
  }, [bankAccount]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBank(form);
      mutate();
    } catch { /* silent */ }
    setSaving(false);
  };

  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;

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
          <Field label="Banco" placeholder="Nome do banco" value={form.bankName} onChange={v => set('bankName', v)} half />
          <Field label="Codigo do banco" placeholder="000" value={form.bankCode} onChange={v => set('bankCode', v)} mono half />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="Agencia" placeholder="0000" value={form.agency} onChange={v => set('agency', v)} mono half />
          <Field label="Conta" placeholder="00000-0" value={form.account} onChange={v => set('account', v)} mono half />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="Titular da conta" placeholder="Nome completo do titular" value={form.holderName} onChange={v => set('holderName', v)} half />
          <Field label="CPF/CNPJ do titular" placeholder="000.000.000-00" value={form.holderDocument} onChange={v => set('holderDocument', v)} mono half />
        </div>

        {/* PIX */}
        <div style={{ borderTop: '1px solid #19191C', marginTop: 10, paddingTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 14, fontFamily: SORA }}>PIX (opcional)</span>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field label="Chave PIX" placeholder="E-mail, CPF, celular ou chave aleatoria" value={form.pixKey} onChange={v => set('pixKey', v)} half required={false} />
            <Field label="Tipo da chave" placeholder="CPF, e-mail, celular, aleatoria" value={form.pixKeyType} onChange={v => set('pixKeyType', v)} half required={false} />
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

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const }}>
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
  const [twoFA, setTwoFA] = useState(false);
  const [pwError, setPwError] = useState('');

  const setPw = (k: string, v: string) => setPwForm(prev => ({ ...prev, [k]: v }));

  const handleChangePw = async () => {
    setPwError('');
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
    } catch {
      setPwError('Erro ao alterar senha. Verifique a senha atual.');
    }
    setSaving(false);
  };

  const sessions = [
    { id: '1', device: 'Chrome — macOS', ip: '189.44.xxx.xxx', lastActive: 'Agora', current: true },
    { id: '2', device: 'Safari — iPhone', ip: '189.44.xxx.xxx', lastActive: '2h atras', current: false },
    { id: '3', device: 'Firefox — Windows', ip: '201.12.xxx.xxx', lastActive: '3 dias atras', current: false },
  ];

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
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const }}>
          <SaveButton saving={saving} onClick={handleChangePw} label="Alterar senha" />
        </div>
      </SectionCard>

      {/* 2FA card */}
      <SectionCard title="Autenticacao em dois fatores" subtitle="Adicione uma camada extra de seguranca a sua conta">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>
              {twoFA ? 'Ativado' : 'Desativado'}
            </span>
            <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
              {twoFA ? 'Sua conta esta protegida com 2FA.' : 'Ative para proteger sua conta com um codigo extra no login.'}
            </span>
          </div>
          <div
            onClick={() => setTwoFA(!twoFA)}
            style={{
              width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'background .15s',
              background: twoFA ? EMBER : '#222226', position: 'relative' as const, flexShrink: 0,
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: '50%', background: '#E0DDD8',
              position: 'absolute' as const, top: 3,
              left: twoFA ? 23 : 3, transition: 'left .15s',
            }} />
          </div>
        </div>
      </SectionCard>

      {/* Sessions card */}
      <SectionCard title="Sessoes ativas" subtitle="Gerencie os dispositivos conectados a sua conta">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {sessions.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              background: '#19191C', borderRadius: 6,
            }}>
              <span style={{ color: s.current ? EMBER : '#3A3A3F' }}>{Icons.shield(16)}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{s.device}</span>
                <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: MONO }}>{s.ip} — {s.lastActive}</span>
              </div>
              {s.current ? (
                <span style={{
                  fontSize: 9, fontWeight: 600, color: EMBER, background: 'rgba(232,93,48,.06)',
                  padding: '3px 8px', borderRadius: 4, fontFamily: SORA,
                }}>
                  Sessao atual
                </span>
              ) : (
                <button style={{
                  background: 'none', border: '1px solid #222226', borderRadius: 4, padding: '4px 10px',
                  color: '#EF4444', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: SORA,
                }}>
                  Encerrar
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

// ═══ SECTION 6: NOTIFICACOES ═══

function NotificacoesSection() {
  const [notifs, setNotifs] = useState<Record<string, { email: boolean; push: boolean; whatsapp: boolean }>>({
    sales: { email: true, push: true, whatsapp: false },
    withdrawals: { email: true, push: false, whatsapp: true },
    affiliates: { email: true, push: false, whatsapp: false },
    kyc: { email: true, push: true, whatsapp: true },
    marketing: { email: false, push: false, whatsapp: false },
    system: { email: true, push: true, whatsapp: false },
  });

  const types = [
    { key: 'sales', label: 'Vendas', sub: 'Novas vendas, reembolsos e chargebacks' },
    { key: 'withdrawals', label: 'Saques', sub: 'Solicitacoes de saque e confirmacoes' },
    { key: 'affiliates', label: 'Afiliados', sub: 'Novas afiliacoes e comissoes' },
    { key: 'kyc', label: 'Conta e KYC', sub: 'Atualizacoes de verificacao e documentos' },
    { key: 'marketing', label: 'Marketing', sub: 'Dicas, novidades e promocoes da plataforma' },
    { key: 'system', label: 'Sistema', sub: 'Manutencoes, atualizacoes e alertas' },
  ];

  const channels: Array<{ key: 'email' | 'push' | 'whatsapp'; label: string }> = [
    { key: 'email', label: 'Email' },
    { key: 'push', label: 'Push' },
    { key: 'whatsapp', label: 'WhatsApp' },
  ];

  const toggle = (type: string, channel: 'email' | 'push' | 'whatsapp') => {
    setNotifs(prev => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type][channel] },
    }));
  };

  const Checkbox = ({ checked, onClick }: { checked: boolean; onClick: () => void }) => (
    <div
      onClick={onClick}
      style={{
        width: 14, height: 14, borderRadius: 3, cursor: 'pointer', transition: 'all 150ms ease',
        background: checked ? EMBER : 'transparent', border: checked ? `1px solid ${EMBER}` : '1px solid #3A3A3F',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {checked && <span style={{ color: '#fff' }}>{Icons.check(8)}</span>}
    </div>
  );

  return (
    <SectionCard title="Notificacoes" subtitle="Escolha como deseja ser notificado">
      {/* Channel headers */}
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #19191C', marginBottom: 4 }}>
        <div style={{ flex: 1 }} />
        {channels.map(ch => (
          <span key={ch.key} style={{ width: 70, textAlign: 'center' as const, fontSize: 9, fontWeight: 600, color: '#3A3A3F', letterSpacing: '.06em', textTransform: 'uppercase' as const, fontFamily: SORA }}>
            {ch.label}
          </span>
        ))}
      </div>

      {types.map(t => (
        <div key={t.key} style={{
          display: 'flex', alignItems: 'center', padding: '14px 0',
          borderBottom: '1px solid #19191C',
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{t.label}</span>
            <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: SORA }}>{t.sub}</span>
          </div>
          {channels.map(ch => (
            <div key={ch.key} style={{ width: 70, display: 'flex', justifyContent: 'center' }}>
              <Checkbox checked={notifs[t.key][ch.key]} onClick={() => toggle(t.key, ch.key)} />
            </div>
          ))}
        </div>
      ))}
    </SectionCard>
  );
}

// ═══ SECTION 7: PERFIL PUBLICO ═══

function PerfilPublicoSection({ profile, mutate }: { profile: any; mutate: () => void }) {
  const { updateProfile } = useProfileMutations();
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    try {
      await updateProfile({
        publicName: form.publicName,
        bio: form.bio,
        website: form.website,
        instagram: form.instagram,
      });
      mutate();
    } catch { /* silent */ }
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

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' as const }}>
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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' as const, borderRadius: 6 }} />
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

// ═══ MAIN COMPONENT ═══

export default function ContaView() {
  const [section, setSection] = useState('pessoal');
  const { profile, isLoading: profileLoading, mutate: mutateProfile } = useProfile();
  const { fiscal, mutate: mutateFiscal } = useFiscalData();
  const { documents, mutate: mutateDocs } = useKycDocuments();
  const { bankAccount, mutate: mutateBank } = useBankAccount();
  const { status } = useKycStatus();
  const { completion, mutate: mutateCompletion } = useKycCompletion();
  const { submitKyc } = useKycSubmit();

  const completionData = completion || { percentage: 0, sections: [] };
  const sectionStatus = (name: string) => {
    const s = completionData.sections?.find((sec: any) => sec.name === name);
    return s?.complete ? 'approved' : 'pending';
  };

  const kycStatus = status?.kycStatus || 'pending';
  const pct = completionData.percentage || 0;
  const isBlocked = pct < 100 || kycStatus !== 'approved';

  const SECTIONS = [
    { key: 'pessoal', label: 'Dados pessoais', icon: Icons.user, statusKey: 'profile' },
    { key: 'fiscal', label: 'Dados fiscais', icon: Icons.building, statusKey: 'fiscal' },
    { key: 'documentos', label: 'Documentos', icon: Icons.doc, statusKey: 'documents' },
    { key: 'bancario', label: 'Dados bancarios', icon: Icons.bank, statusKey: 'bank' },
    { key: 'seguranca', label: 'Seguranca', icon: Icons.shield, statusKey: null },
    { key: 'notificacoes', label: 'Notificacoes', icon: Icons.bell, statusKey: null },
    { key: 'perfil', label: 'Perfil publico', icon: Icons.globe, statusKey: null },
  ];

  const mutateAll = () => { mutateCompletion(); };

  if (profileLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#3A3A3F', fontFamily: SORA, fontSize: 13 }}>Carregando...</span>
      </div>
    );
  }

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
                  onClick={() => setSection(sec.key)}
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
              <button style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444',
                fontSize: 11, fontFamily: SORA,
              }}>
                {Icons.alert(14)} Encerrar conta
              </button>
            </div>
          </div>

          {/* Right content */}
          <div key={section} style={{ animation: 'fadeIn .3s' }}>
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
              <DadosBancariosSection bankAccount={bankAccount} fiscal={fiscal} mutate={() => { mutateBank(); mutateAll(); }} />
            )}
            {section === 'seguranca' && <SegurancaSection />}
            {section === 'notificacoes' && <NotificacoesSection />}
            {section === 'perfil' && (
              <PerfilPublicoSection profile={profile} mutate={() => { mutateProfile(); mutateAll(); }} />
            )}
          </div>
        </div>

        {/* Submit KYC button */}
        {pct >= 100 && kycStatus === 'pending' && (
          <div style={{ marginTop: 32, textAlign: 'center' as const }}>
            <button
              onClick={async () => { await submitKyc(); mutateCompletion(); }}
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
