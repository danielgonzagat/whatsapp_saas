'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { buildMemberAreaPreviewPath } from '@/lib/member-area-preview';
import { NP, SORA, MONO, PURPLE, BG_CARD, BG_ELEVATED, BORDER, btnGhost, iconBtn } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type { DisplayArea, DisplayModule } from './ProdutosView.types';

export default function AreaMembrosListPanel({
  displayAreas, expandedAreas, toggleArea, onEditArea, onDeleteArea, onOpenStudents,
  generatingAreaId, onGenerateStructure,
}: {
  displayAreas: DisplayArea[];
  expandedAreas: Record<string, boolean>;
  toggleArea: (id: string) => void;
  onEditArea: (area: DisplayArea) => void;
  onDeleteArea: (id: string) => void;
  onOpenStudents: (areaId: string, areaName: string) => void;
  generatingAreaId: string | null;
  onGenerateStructure: (areaId: string) => void;
}) {
  if (displayAreas.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}` }}>
        <span style={{ color: PURPLE, display: 'block', marginBottom: 12 }}>{IC.users(32)}</span>
        <div style={{ fontFamily: SORA, fontSize: 14, fontWeight: 600, color: 'var(--app-text-primary)', marginBottom: 6 }}>
          {kloelT('Nenhuma area de membros cadastrada.')}
        </div>
        <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
          {kloelT('Crie sua primeira area na aba Editor.')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {displayAreas.map((a) => {
        const isExpanded = expandedAreas[a.id];
        const modules: DisplayModule[] = a.modules_list || a.modulesList || [];
        const areaAccent = a.primaryColor || PURPLE;
        const previewHref = buildMemberAreaPreviewPath(a.id);

        return (
          <div key={a.id} style={{ background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: areaAccent }} />
              <button type="button" onClick={() => toggleArea(a.id)}
                style={{ ...iconBtn, color: areaAccent, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms ease' }}>
                {IC.chevRight(18)}
              </button>
              <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', background: `${areaAccent}15`, border: `1px solid ${areaAccent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {a.logoUrl ? (
                  <img src={a.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ color: areaAccent }}>{IC.users(18)}</span>
                )}
              </div>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggleArea(a.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}>
                <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)' }}>{a.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-tertiary)', marginTop: 2 }}>
                  {a.type === 'COURSE' ? 'Curso' : a.type === 'COMMUNITY' ? 'Comunidade' : a.type} {kloelT('&middot;')} {modules.length} modulos
                </div>
                {a.slug && <div style={{ fontFamily: MONO, fontSize: 10, color: areaAccent, marginTop: 4 }}>/{a.slug}</div>}
              </div>
              <NP w={100} h={22} color={areaAccent} />
              <div style={{ textAlign: 'right', minWidth: 80 }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)' }}>{a.students} alunos</div>
                {a.completion > 0 && <div style={{ fontFamily: MONO, fontSize: 10, color: areaAccent, marginTop: 2 }}>{a.completion}%</div>}
              </div>
              <button type="button" onClick={() => onOpenStudents(a.id, a.name)}
                style={{ ...iconBtn, color: 'colors.ember.primary' }} title={kloelT('Gerenciar alunos')}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d={kloelT('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2')} />
                  <circle cx="9" cy="7" r="4" />
                  <path d={kloelT('M23 21v-2a4 4 0 0 0-3-3.87')} />
                  <path d={kloelT('M16 3.13a4 4 0 0 1 0 7.75')} />
                </svg>
              </button>
              <a href={previewHref || undefined} target="_blank" rel="noopener noreferrer"
                onClick={(e) => { if (!previewHref) {e.preventDefault();} }} aria-disabled={!previewHref}
                style={{ ...iconBtn, color: 'colors.ember.primary', opacity: previewHref ? 1 : 0.45, textDecoration: 'none' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d={kloelT('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z')} />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </a>
              <button type="button" onClick={() => onEditArea(a)}
                style={{ ...iconBtn, color: 'var(--app-text-secondary)' }} title={kloelT('Editar area')}>
                {IC.edit(16)}
              </button>
              <button type="button" onClick={() => onDeleteArea(a.id)}
                style={{ ...iconBtn, color: colors.semantic.error }} title={kloelT('Excluir area')}>
                {IC.trash(16)}
              </button>
            </div>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 16px 16px 40px' }}>
                <div style={{ background: BG_ELEVATED, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: 'var(--app-text-primary)' }}>{kloelT('Configuracao')}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)', marginTop: 2 }}>
                        {a.template || 'academy'} &middot; {a.productName || 'Sem produto vinculado'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => onGenerateStructure(a.id)}
                        disabled={generatingAreaId === a.id || modules.length > 0}
                        style={{ ...btnGhost, color: areaAccent, borderColor: areaAccent, opacity: generatingAreaId === a.id || modules.length > 0 ? 0.5 : 1 }}>
                        {generatingAreaId === a.id ? 'Gerando...' : modules.length > 0 ? 'Estrutura pronta' : 'Gerar estrutura IA'}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.6 }}>
                    {a.description || 'Sem descricao.'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {[a.certificates !== false ? 'Certificados' : null, a.quizzes !== false ? 'Quizzes' : null,
                      a.community === true ? 'Comunidade' : null].filter(Boolean).map((label) => (
                      <span key={label} style={{ padding: '4px 8px', borderRadius: 16, background: `${areaAccent}15`, border: `1px solid ${areaAccent}30`, color: areaAccent, fontSize: 10, fontWeight: 600, fontFamily: SORA }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  {modules.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontFamily: SORA, fontSize: 11, fontWeight: 600, color: 'var(--app-text-primary)', marginBottom: 6 }}>
                        {kloelT('Modulos')} ({modules.length})
                      </div>
                      {modules.map((mod) => (
                        <div key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                          <span style={{ color: PURPLE }}>{IC.book(14)}</span>
                          <span style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-primary)', flex: 1 }}>{mod.name}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)' }}>{(mod.lessons || []).length} aulas</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
