'use client';

import { useState, useCallback, CSSProperties, ReactNode } from 'react';
import { useMemberAreas, useMemberAreaStats } from '@/hooks/useMemberAreas';
import { memberAreaApi } from '@/lib/api';

/* ════════════════════════════════════════════
   INLINE SVG ICON LIBRARY (IC)
   No lucide-react. No emoji. Pure SVG paths.
   ════════════════════════════════════════════ */
const ic = (d: string, size = 18, stroke = 'currentColor') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d} /> : d}</svg>
);

const IC = {
  plus: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  areas: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  students: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  chart: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  star: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  book: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  community: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  hybrid: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  membership: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  sparkle: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>,
  check: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  chevLeft: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevRight: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  dots: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>,
  trash: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  edit: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  play: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  module: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  lesson: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  palette: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5" fill="none"/><circle cx="8.5" cy="7.5" r="2.5" fill="none"/><circle cx="6.5" cy="12.5" r="2.5" fill="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>,
  settings: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  rocket: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 3 0 3 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-3 0-3"/></svg>,
  layout: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  globe: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
};

/* ════════════════════════════════════════════
   DESIGN TOKENS (inline for zero-dep)
   ════════════════════════════════════════════ */
const T = {
  bg: '#0A0A0C',
  surface: '#111113',
  elevated: '#19191C',
  border: '#222226',
  borderHover: '#333338',
  ember: '#E85D30',
  emberBg: 'rgba(232,93,48,0.06)',
  emberGlow: 'rgba(232,93,48,0.1)',
  ember30: 'rgba(232,93,48,0.3)',
  textPrimary: '#E0DDD8',
  textSecondary: '#6E6E73',
  textDim: '#3A3A3F',
  fontSans: "'Sora', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  radius: 6,
  transition: 'all 150ms ease',
};

/* ════════════════════════════════════════════
   AREA TYPES
   ════════════════════════════════════════════ */
const AREA_TYPES = [
  { id: 'COURSE', label: 'Curso Online', desc: 'Aulas organizadas em modulos sequenciais com progresso do aluno', icon: IC.book },
  { id: 'COMMUNITY', label: 'Comunidade', desc: 'Espaco para membros interagirem, com forum e conteudo exclusivo', icon: IC.community },
  { id: 'HYBRID', label: 'Hibrido', desc: 'Combine curso + comunidade em uma unica experiencia integrada', icon: IC.hybrid },
  { id: 'MEMBERSHIP', label: 'Assinatura', desc: 'Conteudo recorrente com acesso por assinatura mensal ou anual', icon: IC.membership },
];

/* ════════════════════════════════════════════
   FEATURE TOGGLES
   ════════════════════════════════════════════ */
const FEATURES = [
  { id: 'certificates', label: 'Certificados', desc: 'Emissao automatica ao concluir' },
  { id: 'comments', label: 'Comentarios', desc: 'Comentarios nas aulas' },
  { id: 'forum', label: 'Forum', desc: 'Forum de discussao por modulo' },
  { id: 'gamification', label: 'Gamificacao', desc: 'Pontos e conquistas' },
  { id: 'drip', label: 'Drip Content', desc: 'Liberacao gradual de conteudo' },
  { id: 'quizzes', label: 'Quizzes', desc: 'Avaliacoes por aula' },
  { id: 'downloads', label: 'Downloads', desc: 'Materiais complementares' },
  { id: 'live', label: 'Aulas ao Vivo', desc: 'Integracao com lives' },
];

/* ════════════════════════════════════════════
   VISUAL TEMPLATES
   ════════════════════════════════════════════ */
const TEMPLATES = [
  { id: 'minimal', label: 'Minimal', desc: 'Layout limpo e focado no conteudo' },
  { id: 'sidebar', label: 'Sidebar', desc: 'Navegacao lateral com modulos' },
  { id: 'cards', label: 'Cards', desc: 'Grid de cards com thumbnails' },
  { id: 'timeline', label: 'Timeline', desc: 'Progresso linear tipo jornada' },
];

const ACCENT_COLORS = ['#E85D30', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#F43F5E'];

/* ════════════════════════════════════════════
   SMALL REUSABLE COMPONENTS
   ════════════════════════════════════════════ */

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 32, height: 32, border: `2px solid ${T.border}`, borderTop: `2px solid ${T.ember}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string | number; sub?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.surface,
        border: `1px solid ${hovered ? T.borderHover : T.border}`,
        borderRadius: T.radius,
        padding: 18,
        transition: T.transition,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ color: T.textSecondary }}>{icon}</div>
        <span style={{ fontFamily: T.fontSans, fontSize: 10, fontWeight: 600, color: T.textSecondary, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</span>
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: 28, fontWeight: 600, color: T.textPrimary, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontFamily: T.fontSans, fontSize: 12, color: T.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled = false, style: extraStyle }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'outline'; disabled?: boolean; style?: CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 20px', borderRadius: T.radius,
    fontFamily: T.fontSans, fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: T.transition, border: 'none',
    opacity: disabled ? 0.5 : 1,
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: hovered && !disabled ? T.ember30 : T.ember, color: '#fff' },
    ghost: { background: hovered ? T.emberBg : 'transparent', color: T.ember, border: `1px solid ${T.border}` },
    outline: { background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent', color: T.textPrimary, border: `1px solid ${T.border}` },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variants[variant], ...extraStyle }}
    >
      {children}
    </button>
  );
}

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 38, height: 20, borderRadius: 10,
        background: active ? T.ember : T.elevated,
        border: `1px solid ${active ? T.ember : T.border}`,
        cursor: 'pointer', position: 'relative',
        transition: T.transition,
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: active ? '#fff' : T.textSecondary,
        position: 'absolute', top: 2,
        left: active ? 20 : 2,
        transition: T.transition,
      }} />
    </div>
  );
}

function Input({ value, onChange, placeholder, style: extraStyle }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', padding: '10px 14px',
        background: T.elevated, border: `1px solid ${focused ? T.ember : T.border}`,
        borderRadius: T.radius, color: T.textPrimary,
        fontFamily: T.fontSans, fontSize: 14,
        outline: 'none', transition: T.transition,
        boxSizing: 'border-box' as const,
        ...extraStyle,
      }}
    />
  );
}

/* ════════════════════════════════════════════
   STEP INDICATOR
   ════════════════════════════════════════════ */
function StepIndicator({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 32 }}>
      {labels.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? T.ember : done ? T.emberBg : T.elevated,
              border: `1px solid ${active ? T.ember : done ? T.ember : T.border}`,
              color: active ? '#fff' : done ? T.ember : T.textSecondary,
              fontFamily: T.fontMono, fontSize: 11, fontWeight: 600,
              transition: T.transition,
            }}>
              {done ? IC.check : i + 1}
            </div>
            <span style={{
              fontFamily: T.fontSans, fontSize: 11, fontWeight: 500,
              color: active ? T.textPrimary : T.textDim,
              display: active ? 'block' : 'none',
            }}>
              {label}
            </span>
            {i < total - 1 && (
              <div style={{
                width: 24, height: 1,
                background: done ? T.ember : T.border,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════
   AREA CARD (list view)
   ════════════════════════════════════════════ */
function AreaCard({ area, onEdit, onDelete }: { area: any; onEdit?: () => void; onDelete?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const completion = area.avgCompletion || area.completion || 0;
  const students = area.totalStudents || area.students || 0;
  const modules = area.totalModules || area.modules?.length || 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      style={{
        background: T.surface,
        border: `1px solid ${hovered ? T.borderHover : T.border}`,
        borderRadius: T.radius,
        padding: 18,
        transition: T.transition,
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: T.fontSans, fontSize: 15, fontWeight: 600, color: T.textPrimary }}>{area.name}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textDim, marginTop: 2 }}>/{area.slug || area.name?.toLowerCase().replace(/\s+/g, '-')}</div>
        </div>
        <div style={{ position: 'relative' }}>
          <div
            onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            style={{ cursor: 'pointer', color: T.textSecondary, padding: 4 }}
          >
            {IC.dots}
          </div>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 24, zIndex: 20,
              background: T.elevated, border: `1px solid ${T.border}`,
              borderRadius: T.radius, overflow: 'hidden', minWidth: 140,
            }}>
              <div onClick={onEdit} style={{ padding: '8px 14px', fontFamily: T.fontSans, fontSize: 12, color: T.textPrimary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: T.transition }} onMouseEnter={e => (e.currentTarget.style.background = T.emberBg)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {IC.edit} Editar
              </div>
              <div onClick={onDelete} style={{ padding: '8px 14px', fontFamily: T.fontSans, fontSize: 12, color: T.ember, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: T.transition }} onMouseEnter={e => (e.currentTarget.style.background = T.emberBg)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {IC.trash} Excluir
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: T.textSecondary }}>{IC.students}</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.textPrimary }}>{students}</span>
          <span style={{ fontFamily: T.fontSans, fontSize: 11, color: T.textDim }}>alunos</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: T.textSecondary }}>{IC.module}</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.textPrimary }}>{modules}</span>
          <span style={{ fontFamily: T.fontSans, fontSize: 11, color: T.textDim }}>modulos</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: T.fontSans, fontSize: 11, color: T.textDim }}>Conclusao media</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textSecondary }}>{completion}%</span>
        </div>
        <div style={{ height: 3, background: T.elevated, borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${Math.min(completion, 100)}%`, background: T.ember, borderRadius: 2, transition: 'width 300ms ease' }} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   GHOST "CREATE" CARD
   ════════════════════════════════════════════ */
function CreateGhostCard({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? T.emberBg : 'transparent',
        border: `1px dashed ${hovered ? T.ember : T.border}`,
        borderRadius: T.radius,
        padding: 18,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: 160, cursor: 'pointer',
        transition: T.transition,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: hovered ? T.emberGlow : T.elevated,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 12, color: hovered ? T.ember : T.textSecondary,
        transition: T.transition,
      }}>
        {IC.plus}
      </div>
      <span style={{ fontFamily: T.fontSans, fontSize: 13, fontWeight: 600, color: hovered ? T.ember : T.textSecondary, transition: T.transition }}>
        Criar nova area
      </span>
      <span style={{ fontFamily: T.fontSans, fontSize: 11, color: T.textDim, marginTop: 4 }}>
        Curso, comunidade ou assinatura
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════
   STEP COMPONENTS
   ════════════════════════════════════════════ */

function StepTipo({ selected, onSelect }: { selected: string; onSelect: (v: string) => void }) {
  return (
    <div>
      <h2 style={{ fontFamily: T.fontSans, fontSize: 18, fontWeight: 600, color: T.textPrimary, marginBottom: 6, marginTop: 0 }}>
        Tipo da Area
      </h2>
      <p style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textDim, marginBottom: 24, marginTop: 0 }}>
        Escolha o formato que melhor se adapta ao seu conteudo
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {AREA_TYPES.map(t => {
          const active = selected === t.id;
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{
                background: active ? T.emberBg : T.surface,
                border: `1px solid ${active ? T.ember : T.border}`,
                borderRadius: T.radius,
                padding: 18, cursor: 'pointer',
                transition: T.transition,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ color: active ? T.ember : T.textSecondary }}>{t.icon}</div>
                <span style={{ fontFamily: T.fontSans, fontSize: 14, fontWeight: 600, color: active ? T.textPrimary : T.textSecondary }}>{t.label}</span>
              </div>
              <p style={{ fontFamily: T.fontSans, fontSize: 12, color: T.textDim, margin: 0, lineHeight: 1.5 }}>{t.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepIdentidade({ name, slug, onNameChange, onSlugChange }: {
  name: string; slug: string; onNameChange: (v: string) => void; onSlugChange: (v: string) => void;
}) {
  const handleNameChange = (v: string) => {
    onNameChange(v);
    onSlugChange(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };
  return (
    <div>
      <h2 style={{ fontFamily: T.fontSans, fontSize: 18, fontWeight: 600, color: T.textPrimary, marginBottom: 6, marginTop: 0 }}>
        Identidade
      </h2>
      <p style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textDim, marginBottom: 24, marginTop: 0 }}>
        Nome e URL da sua area de membros
      </p>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontFamily: T.fontSans, fontSize: 12, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 8 }}>
          Nome da area
        </label>
        <Input value={name} onChange={handleNameChange} placeholder="Ex: Curso de Marketing Digital" />
      </div>
      <div>
        <label style={{ fontFamily: T.fontSans, fontSize: 12, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 8 }}>
          Slug (URL)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span style={{
            padding: '10px 12px', background: T.elevated,
            border: `1px solid ${T.border}`, borderRight: 'none',
            borderRadius: `${T.radius}px 0 0 ${T.radius}px`,
            fontFamily: T.fontMono, fontSize: 12, color: T.textDim,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {IC.globe} kloel.com/
          </span>
          <Input
            value={slug}
            onChange={onSlugChange}
            placeholder="curso-marketing"
            style={{ borderRadius: `0 ${T.radius}px ${T.radius}px 0` }}
          />
        </div>
      </div>
    </div>
  );
}

function StepEstrutura({ modules, setModules, areaType, generating, onGenerate }: {
  modules: any[]; setModules: (m: any[]) => void; areaType: string; generating: boolean; onGenerate: () => void;
}) {
  const addModule = () => {
    setModules([...modules, { name: '', lessons: [{ name: '' }] }]);
  };
  const removeModule = (idx: number) => {
    setModules(modules.filter((_, i) => i !== idx));
  };
  const updateModuleName = (idx: number, name: string) => {
    const updated = [...modules];
    updated[idx] = { ...updated[idx], name };
    setModules(updated);
  };
  const addLesson = (modIdx: number) => {
    const updated = [...modules];
    updated[modIdx] = { ...updated[modIdx], lessons: [...updated[modIdx].lessons, { name: '' }] };
    setModules(updated);
  };
  const removeLesson = (modIdx: number, lesIdx: number) => {
    const updated = [...modules];
    updated[modIdx] = { ...updated[modIdx], lessons: updated[modIdx].lessons.filter((_: any, i: number) => i !== lesIdx) };
    setModules(updated);
  };
  const updateLessonName = (modIdx: number, lesIdx: number, name: string) => {
    const updated = [...modules];
    updated[modIdx] = {
      ...updated[modIdx],
      lessons: updated[modIdx].lessons.map((l: any, i: number) => i === lesIdx ? { ...l, name } : l),
    };
    setModules(updated);
  };

  return (
    <div>
      <h2 style={{ fontFamily: T.fontSans, fontSize: 18, fontWeight: 600, color: T.textPrimary, marginBottom: 6, marginTop: 0 }}>
        Estrutura
      </h2>
      <p style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textDim, marginBottom: 20, marginTop: 0 }}>
        Monte os modulos e aulas da sua area de membros
      </p>

      {/* AI Generate Button */}
      <div
        onClick={generating ? undefined : onGenerate}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', marginBottom: 20,
          background: T.emberBg, border: `1px solid ${T.border}`,
          borderRadius: T.radius, cursor: generating ? 'wait' : 'pointer',
          transition: T.transition,
        }}
      >
        <div style={{ color: T.ember, display: 'flex', alignItems: 'center' }}>{IC.sparkle}</div>
        <div>
          <span style={{ fontFamily: T.fontSans, fontSize: 13, fontWeight: 600, color: T.textPrimary }}>
            {generating ? 'Gerando estrutura com IA...' : 'Gerar estrutura com IA'}
          </span>
          <span style={{ fontFamily: T.fontSans, fontSize: 11, color: T.textDim, display: 'block', marginTop: 2 }}>
            Crie modulos e aulas automaticamente baseado no nome da area
          </span>
        </div>
        {generating && (
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ width: 16, height: 16, border: `2px solid ${T.border}`, borderTop: `2px solid ${T.ember}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        )}
      </div>

      {/* Module List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {modules.map((mod, modIdx) => (
          <div key={modIdx} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ color: T.ember, display: 'flex', alignItems: 'center' }}>{IC.module}</div>
              <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textDim, fontWeight: 600 }}>MODULO {modIdx + 1}</span>
              <div style={{ flex: 1 }}>
                <Input value={mod.name} onChange={v => updateModuleName(modIdx, v)} placeholder={`Nome do modulo ${modIdx + 1}`} style={{ padding: '6px 10px', fontSize: 13 }} />
              </div>
              <div onClick={() => removeModule(modIdx)} style={{ cursor: 'pointer', color: T.textDim, padding: 4 }}>{IC.trash}</div>
            </div>
            <div style={{ paddingLeft: 28, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mod.lessons.map((les: any, lesIdx: number) => (
                <div key={lesIdx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ color: T.textDim, display: 'flex', alignItems: 'center' }}>{IC.lesson}</div>
                    <div style={{ flex: 1 }}>
                      <Input value={les.name} onChange={v => updateLessonName(modIdx, lesIdx, v)} placeholder={`Aula ${lesIdx + 1}`} style={{ padding: '6px 10px', fontSize: 12 }} />
                    </div>
                    <div onClick={() => removeLesson(modIdx, lesIdx)} style={{ cursor: 'pointer', color: T.textDim, padding: 2 }}>{IC.trash}</div>
                  </div>
                  <div style={{ paddingLeft: 22, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: T.textDim }}>{IC.play}</span>
                    <span style={{ fontFamily: T.fontSans, fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
                      Upload de video disponivel em breve. Configure a URL do video manualmente.
                    </span>
                  </div>
                </div>
              ))}
              <div
                onClick={() => addLesson(modIdx)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0', color: T.textDim, transition: T.transition }}
              >
                <span style={{ color: T.textDim }}>{IC.plus}</span>
                <span style={{ fontFamily: T.fontSans, fontSize: 11, fontWeight: 500 }}>Adicionar aula</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        onClick={addModule}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', marginTop: 12,
          background: 'transparent', border: `1px dashed ${T.border}`,
          borderRadius: T.radius, cursor: 'pointer',
          color: T.textSecondary, transition: T.transition,
        }}
      >
        <span>{IC.plus}</span>
        <span style={{ fontFamily: T.fontSans, fontSize: 13, fontWeight: 500 }}>Adicionar modulo</span>
      </div>
    </div>
  );
}

function StepRecursos({ features, setFeatures }: { features: Record<string, boolean>; setFeatures: (f: Record<string, boolean>) => void }) {
  return (
    <div>
      <h2 style={{ fontFamily: T.fontSans, fontSize: 18, fontWeight: 600, color: T.textPrimary, marginBottom: 6, marginTop: 0 }}>
        Recursos
      </h2>
      <p style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textDim, marginBottom: 24, marginTop: 0 }}>
        Ative ou desative funcionalidades da sua area
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {FEATURES.map(f => {
          const active = !!features[f.id];
          return (
            <div
              key={f.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                background: active ? T.emberBg : T.surface,
                border: `1px solid ${active ? T.ember : T.border}`,
                borderRadius: T.radius,
                transition: T.transition,
              }}
            >
              <div>
                <div style={{ fontFamily: T.fontSans, fontSize: 13, fontWeight: 600, color: active ? T.textPrimary : T.textSecondary }}>{f.label}</div>
                <div style={{ fontFamily: T.fontSans, fontSize: 11, color: T.textDim, marginTop: 2 }}>{f.desc}</div>
              </div>
              <Toggle active={active} onToggle={() => setFeatures({ ...features, [f.id]: !active })} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepVisual({ template, setTemplate, accentColor, setAccentColor }: {
  template: string; setTemplate: (v: string) => void; accentColor: string; setAccentColor: (v: string) => void;
}) {
  return (
    <div>
      <h2 style={{ fontFamily: T.fontSans, fontSize: 18, fontWeight: 600, color: T.textPrimary, marginBottom: 6, marginTop: 0 }}>
        Visual
      </h2>
      <p style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textDim, marginBottom: 24, marginTop: 0 }}>
        Escolha o template e a cor principal da sua area
      </p>

      {/* Templates */}
      <label style={{ fontFamily: T.fontSans, fontSize: 12, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 12 }}>
        Template
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 28 }}>
        {TEMPLATES.map(t => {
          const active = template === t.id;
          return (
            <div
              key={t.id}
              onClick={() => setTemplate(t.id)}
              style={{
                padding: 16,
                background: active ? T.emberBg : T.surface,
                border: `1px solid ${active ? T.ember : T.border}`,
                borderRadius: T.radius, cursor: 'pointer',
                transition: T.transition,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ color: active ? T.ember : T.textSecondary }}>{IC.layout}</div>
                <span style={{ fontFamily: T.fontSans, fontSize: 13, fontWeight: 600, color: active ? T.textPrimary : T.textSecondary }}>{t.label}</span>
              </div>
              <p style={{ fontFamily: T.fontSans, fontSize: 11, color: T.textDim, margin: 0 }}>{t.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Accent color */}
      <label style={{ fontFamily: T.fontSans, fontSize: 12, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 12 }}>
        Cor principal
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {ACCENT_COLORS.map(c => (
          <div
            key={c}
            onClick={() => setAccentColor(c)}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: c, cursor: 'pointer',
              border: accentColor === c ? '3px solid #fff' : '3px solid transparent',
              outline: accentColor === c ? `2px solid ${c}` : 'none',
              transition: T.transition,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StepPublicar({ data }: { data: any }) {
  const typeLabel = AREA_TYPES.find(t => t.id === data.type)?.label || data.type;
  const templateLabel = TEMPLATES.find(t => t.id === data.template)?.label || data.template;
  const activeFeatures = FEATURES.filter(f => data.features[f.id]);

  return (
    <div>
      <h2 style={{ fontFamily: T.fontSans, fontSize: 18, fontWeight: 600, color: T.textPrimary, marginBottom: 6, marginTop: 0 }}>
        Revisao e Publicacao
      </h2>
      <p style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textDim, marginBottom: 24, marginTop: 0 }}>
        Confira os dados antes de publicar sua area de membros
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary cards */}
        {[
          { label: 'Nome', value: data.name || '--' },
          { label: 'Slug', value: `/${data.slug || '--'}` },
          { label: 'Tipo', value: typeLabel },
          { label: 'Template', value: templateLabel },
          { label: 'Modulos', value: `${data.modules.length} modulo${data.modules.length !== 1 ? 's' : ''}` },
          { label: 'Aulas', value: `${data.modules.reduce((s: number, m: any) => s + m.lessons.length, 0)} aula${data.modules.reduce((s: number, m: any) => s + m.lessons.length, 0) !== 1 ? 's' : ''}` },
          { label: 'Recursos', value: activeFeatures.length > 0 ? activeFeatures.map(f => f.label).join(', ') : 'Nenhum ativado' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius }}>
            <span style={{ fontFamily: T.fontSans, fontSize: 12, fontWeight: 600, color: T.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{item.label}</span>
            <span style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textPrimary, fontWeight: 500 }}>{item.value}</span>
          </div>
        ))}

        {/* Accent color preview */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius }}>
          <span style={{ fontFamily: T.fontSans, fontSize: 12, fontWeight: 600, color: T.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Cor</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: data.accentColor }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textPrimary }}>{data.accentColor}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ════════════════════════════════════════════════════════════════ */
export default function AreaMembrosPage() {
  const { areas: rawAreas, isLoading, error, mutate } = useMemberAreas();
  const { stats } = useMemberAreaStats();

  // Graceful error handling: show empty state when API fails (e.g. tables don't exist yet)
  const areas = error ? [] : rawAreas;

  // View state: 'list' | 'create'
  const [view, setView] = useState<'list' | 'create'>('list');

  // Create wizard state
  const [step, setStep] = useState(0);
  const [areaType, setAreaType] = useState('COURSE');
  const [areaName, setAreaName] = useState('');
  const [areaSlug, setAreaSlug] = useState('');
  const [modules, setModules] = useState<any[]>([
    { name: '', lessons: [{ name: '' }] },
  ]);
  const [features, setFeatures] = useState<Record<string, boolean>>({
    certificates: true,
    comments: true,
    downloads: true,
  });
  const [template, setTemplate] = useState('minimal');
  const [accentColor, setAccentColor] = useState(T.ember);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const STEP_LABELS = ['Tipo', 'Identidade', 'Estrutura', 'Recursos', 'Visual', 'Publicar'];

  const resetWizard = () => {
    setStep(0);
    setAreaType('COURSE');
    setAreaName('');
    setAreaSlug('');
    setModules([{ name: '', lessons: [{ name: '' }] }]);
    setFeatures({ certificates: true, comments: true, downloads: true });
    setTemplate('minimal');
    setAccentColor(T.ember);
    setView('list');
  };

  const canNext = useCallback(() => {
    if (step === 0) return !!areaType;
    if (step === 1) return areaName.trim().length > 0;
    if (step === 2) return modules.length > 0;
    return true;
  }, [step, areaType, areaName, modules]);

  const handleGenerate = async () => {
    if (!areaName.trim()) return;
    setGenerating(true);
    try {
      // First create a temporary area to generate structure
      const res = await memberAreaApi.create({ name: areaName, slug: areaSlug, type: areaType });
      const areaId = res?.data?.id || res?.data?._id;
      if (areaId) {
        const structRes = await memberAreaApi.generateStructure(areaId);
        const generated = structRes?.data?.modules || structRes?.data?.structure?.modules;
        if (generated && generated.length > 0) {
          setModules(generated.map((m: any) => ({
            name: m.name || m.title || '',
            lessons: (m.lessons || m.items || []).map((l: any) => ({ name: l.name || l.title || '' })),
          })));
        }
        // Clean up temp area
        try { await memberAreaApi.remove(areaId); } catch {}
      }
    } catch (err) {
      // Fallback: generate a simple structure based on area name
      const fallback = [
        { name: 'Introducao', lessons: [{ name: 'Boas-vindas' }, { name: 'Visao geral do curso' }] },
        { name: 'Fundamentos', lessons: [{ name: 'Conceitos basicos' }, { name: 'Primeiros passos' }] },
        { name: 'Pratica', lessons: [{ name: 'Exercicio guiado' }, { name: 'Projeto pratico' }] },
        { name: 'Conclusao', lessons: [{ name: 'Revisao final' }, { name: 'Proximos passos' }] },
      ];
      setModules(fallback);
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await memberAreaApi.create({
        name: areaName,
        slug: areaSlug,
        type: areaType,
        modules: modules.map((m, i) => ({
          name: m.name,
          order: i,
          lessons: m.lessons.map((l: any, j: number) => ({
            name: l.name,
            order: j,
          })),
        })),
        features,
        template,
        accentColor,
        status: 'active',
      });
      await mutate();
      resetWizard();
    } catch (err) {
      console.error('Failed to publish area:', err);
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await memberAreaApi.remove(id);
      await mutate();
    } catch (err) {
      console.error('Failed to delete area:', err);
    }
  };

  if (isLoading && !error) return <Spinner />;

  /* ── CREATE VIEW ── */
  if (view === 'create') {
    return (
      <div style={{ padding: 32, minHeight: '100vh', background: T.bg }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* Back + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div onClick={resetWizard} style={{ cursor: 'pointer', color: T.textSecondary, display: 'flex', alignItems: 'center', padding: 4 }}>
              {IC.chevLeft}
            </div>
            <h1 style={{ fontFamily: T.fontSans, fontSize: 20, fontWeight: 600, color: T.textPrimary, margin: 0 }}>
              Criar Area de Membros
            </h1>
          </div>

          {/* Step Indicator */}
          <StepIndicator current={step} total={6} labels={STEP_LABELS} />

          {/* Step Content */}
          <div style={{ marginBottom: 32 }}>
            {step === 0 && <StepTipo selected={areaType} onSelect={setAreaType} />}
            {step === 1 && <StepIdentidade name={areaName} slug={areaSlug} onNameChange={setAreaName} onSlugChange={setAreaSlug} />}
            {step === 2 && <StepEstrutura modules={modules} setModules={setModules} areaType={areaType} generating={generating} onGenerate={handleGenerate} />}
            {step === 3 && <StepRecursos features={features} setFeatures={setFeatures} />}
            {step === 4 && <StepVisual template={template} setTemplate={setTemplate} accentColor={accentColor} setAccentColor={setAccentColor} />}
            {step === 5 && <StepPublicar data={{ name: areaName, slug: areaSlug, type: areaType, modules, features, template, accentColor }} />}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
            <Btn
              variant="outline"
              onClick={() => step > 0 ? setStep(step - 1) : resetWizard()}
            >
              {IC.chevLeft} {step > 0 ? 'Voltar' : 'Cancelar'}
            </Btn>
            {step < 5 ? (
              <Btn
                variant="primary"
                disabled={!canNext()}
                onClick={() => setStep(step + 1)}
              >
                Proximo {IC.chevRight}
              </Btn>
            ) : (
              <Btn
                variant="primary"
                disabled={publishing}
                onClick={handlePublish}
              >
                {publishing ? (
                  <>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Publicando...
                  </>
                ) : (
                  <>{IC.rocket} Publicar</>
                )}
              </Btn>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── LIST VIEW ── */
  return (
    <div style={{ padding: 32, minHeight: '100vh', background: T.bg }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ maxWidth: 960, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: T.fontSans, fontSize: 20, fontWeight: 600, color: T.textPrimary, margin: 0, letterSpacing: '-0.01em' }}>
              Area de Membros
            </h1>
            <p style={{ fontFamily: T.fontSans, fontSize: 13, color: T.textDim, margin: '4px 0 0 0' }}>
              Crie e gerencie suas areas de membros, cursos e comunidades
            </p>
          </div>
          <Btn variant="primary" onClick={() => setView('create')}>
            {IC.plus} Criar area
          </Btn>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
          <StatCard icon={IC.areas} label="Areas" value={stats.totalAreas || areas.length} sub="areas criadas" />
          <StatCard icon={IC.students} label="Alunos" value={stats.totalStudents} sub="matriculados" />
          <StatCard icon={IC.chart} label="Conclusao" value={`${stats.avgCompletion || 0}%`} sub="media geral" />
          <StatCard icon={IC.star} label="NPS" value={stats.avgRating || 0} sub="satisfacao media" />
        </div>

        {/* Section Header */}
        <h2 style={{ fontFamily: T.fontSans, fontSize: 16, fontWeight: 600, color: T.textPrimary, marginBottom: 16 }}>
          Suas Areas
        </h2>

        {/* Grid */}
        {areas.length === 0 ? (
          /* Empty state with ghost card only */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            <CreateGhostCard onClick={() => setView('create')} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {areas.map((area: any, i: number) => (
              <AreaCard
                key={area.id || area._id || i}
                area={area}
                onEdit={() => {}}
                onDelete={() => handleDelete(area.id || area._id)}
              />
            ))}
            <CreateGhostCard onClick={() => setView('create')} />
          </div>
        )}
      </div>
    </div>
  );
}
