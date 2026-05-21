'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { SORA, MONO, PURPLE, BG_CARD, BG_ELEVATED, BORDER, inputStyle, btnPrimary, btnGhost, iconBtn, focusPrimaryInput } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type React from 'react';
import type { DisplayArea, DisplayModule, DisplayLesson, DisplayProduct } from './ProdutosView.types';

type EditorPanelProps = {
  displayAreas: DisplayArea[];
  productOptions: DisplayProduct[];
  saving: boolean;
  showCreateArea: boolean;
  setShowCreateArea: (v: boolean) => void;
  newArea: Record<string, unknown>;
  setNewArea: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  handleCreateArea: () => Promise<void>;
  emptyAreaForm: Record<string, unknown>;
  editingArea: string | null;
  setEditingArea: React.Dispatch<React.SetStateAction<string | null>>;
  editAreaData: Record<string, unknown>;
  setEditAreaData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  handleUpdateArea: (id: string) => Promise<void>;
  handleDeleteArea: (id: string) => Promise<void>;
  editingModule: string | null;
  setEditingModule: (id: string | null) => void;
  editModuleData: { name: string };
  setEditModuleData: React.Dispatch<React.SetStateAction<{ name: string }>>;
  handleUpdateModule: (areaId: string, moduleId: string) => Promise<void>;
  handleDeleteModule: (areaId: string, moduleId: string) => Promise<void>;
  creatingModule: string | null;
  setCreatingModule: (id: string | null) => void;
  newModule: { name: string };
  setNewModule: React.Dispatch<React.SetStateAction<{ name: string }>>;
  handleCreateModule: (areaId: string) => Promise<void>;
  editingLesson: string | null;
  setEditingLesson: (id: string | null) => void;
  editLessonData: { name: string; description: string; videoUrl: string };
  setEditLessonData: React.Dispatch<React.SetStateAction<{ name: string; description: string; videoUrl: string }>>;
  handleUpdateLesson: (areaId: string, lessonId: string) => Promise<void>;
  handleDeleteLesson: (areaId: string, lessonId: string) => Promise<void>;
  creatingLesson: string | null;
  setCreatingLesson: (id: string | null) => void;
  newLesson: { name: string; description: string; videoUrl: string };
  setNewLesson: React.Dispatch<React.SetStateAction<{ name: string; description: string; videoUrl: string }>>;
  handleCreateLesson: (areaId: string, moduleId: string) => Promise<void>;
};

const cardBox = { background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16 };
const sectionLabel = { fontFamily: SORA, fontSize: 11, fontWeight: 600 as const, color: 'var(--app-text-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: 10 };
const fieldLabel = { fontFamily: SORA, fontSize: 10, color: 'var(--app-text-secondary)', display: 'block' as const, marginBottom: 4 };

export default function AreaMembrosEditorPanel(props: EditorPanelProps) {
  const selectedArea = props.displayAreas.find((a) => a.id === props.editingArea);
  const modules: DisplayModule[] = selectedArea ? selectedArea.modules_list || selectedArea.modulesList || [] : [];

  return (
    <div style={{ opacity: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)' }}>{kloelT('Editor de Areas')}</div>
        <button type="button" onClick={() => props.setShowCreateArea(!props.showCreateArea)}
          style={{ ...btnPrimary(PURPLE), display: 'flex', alignItems: 'center', gap: 6, opacity: props.saving ? 0.6 : 1 }} disabled={props.saving}>
          <span style={{ color: colors.text.silver }}>{IC.plus(14)}</span> {kloelT('Criar area')}
        </button>
      </div>

      {props.showCreateArea && (
        <div style={cardBox}>
          <div style={sectionLabel}>{kloelT('Nova Area')}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <label style={fieldLabel}>{kloelT('Nome')}</label>
              <input value={(props.newArea.name as string) || ''} onChange={(e) => props.setNewArea((p) => ({ ...p, name: e.target.value }))}
                placeholder={kloelT('Nome da area...')} style={inputStyle} />
            </div>
            <div style={{ width: 160 }}>
              <label style={fieldLabel}>{kloelT('Tipo')}</label>
              <select value={(props.newArea.type as string) || 'COURSE'} onChange={(e) => props.setNewArea((p) => ({ ...p, type: e.target.value }))}
                style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                <option value="COURSE">Curso</option>
                <option value="COMMUNITY">Comunidade</option>
                <option value="HYBRID">Hibrido</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>{kloelT('Produto')}</label>
              <select value={(props.newArea.productId as string) || ''} onChange={(e) => props.setNewArea((p) => ({ ...p, productId: e.target.value }))}
                style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                <option value="">Sem vinculo</option>
                {props.productOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
            <button type="button" onClick={props.handleCreateArea} disabled={props.saving}
              style={{ ...btnPrimary(PURPLE), opacity: props.saving ? 0.6 : 1 }}>
              {props.saving ? 'Salvando...' : 'Criar'}
            </button>
            <button type="button" onClick={() => { props.setShowCreateArea(false); props.setNewArea(props.emptyAreaForm); }}
              style={btnGhost}>{kloelT('Cancelar')}</button>
          </div>
        </div>
      )}

      <div style={cardBox}>
        <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: 'var(--app-text-primary)', marginBottom: 10 }}>
          {kloelT('Editar area existente')}
        </div>
        <select value={props.editingArea || ''} onChange={(e) => props.setEditingArea(e.target.value || null)}
          style={{ ...inputStyle, width: '100%', cursor: 'pointer', marginBottom: 12 }}
          aria-label={kloelT('Selecionar area para editar')}>
          <option value="">{kloelT('Selecionar uma area...')}</option>
          {props.displayAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {selectedArea && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1.5fr 1fr 1fr' }}>
              <input aria-label={kloelT('Nome da area')} value={(props.editAreaData.name as string) || ''}
                onChange={(e) => props.setEditAreaData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nome" style={inputStyle} ref={focusPrimaryInput} />
              <select value={(props.editAreaData.type as string) || 'COURSE'}
                onChange={(e) => props.setEditAreaData((p) => ({ ...p, type: e.target.value }))}
                style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                <option value="COURSE">Curso</option>
                <option value="COMMUNITY">Comunidade</option>
                <option value="HYBRID">Hibrido</option>
                <option value="MEMBERSHIP">Membership</option>
              </select>
              <select value={(props.editAreaData.productId as string) || ''}
                onChange={(e) => props.setEditAreaData((p) => ({ ...p, productId: e.target.value }))}
                style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                <option value="">Sem vinculo</option>
                {props.productOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <input aria-label="Slug" value={(props.editAreaData.slug as string) || ''}
                onChange={(e) => props.setEditAreaData((p) => ({ ...p, slug: e.target.value }))}
                placeholder="Slug" style={inputStyle} />
              <input aria-label="Descricao" value={(props.editAreaData.description as string) || ''}
                onChange={(e) => props.setEditAreaData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descricao" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => props.handleUpdateArea(selectedArea.id)} disabled={props.saving}
                style={{ ...btnPrimary(PURPLE), fontSize: 11, padding: '6px 12px', opacity: props.saving ? 0.6 : 1 }}>
                {kloelT('Salvar area')}
              </button>
              <button type="button" onClick={() => props.handleDeleteArea(selectedArea.id)} disabled={props.saving}
                style={{ ...btnGhost, fontSize: 11, padding: '6px 12px', color: colors.semantic.error }}>
                {kloelT('Excluir area')}
              </button>
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: 'var(--app-text-primary)' }}>
                  {kloelT('Modulos')} ({modules.length})
                </span>
                <button type="button" onClick={() => { props.setCreatingModule(selectedArea.id); props.setNewModule({ name: '' }); }}
                  style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '4px 10px' }}>
                  + {kloelT('Modulo')}
                </button>
              </div>

              {props.creatingModule === selectedArea.id && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input aria-label={kloelT('Nome do modulo')} value={props.newModule.name}
                    onChange={(e) => props.setNewModule({ name: e.target.value })}
                    placeholder={kloelT('Nome do modulo')} style={{ ...inputStyle, flex: 1, fontSize: 11 }} ref={focusPrimaryInput} />
                  <button type="button" onClick={() => props.handleCreateModule(selectedArea.id)} disabled={props.saving}
                    style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '5px 10px' }}>Criar</button>
                  <button type="button" onClick={() => { props.setCreatingModule(null); props.setNewModule({ name: '' }); }}
                    style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}>Cancelar</button>
                </div>
              )}

              {modules.map((mod) => {
                const lessons: DisplayLesson[] = mod.lessons || [];
                const isEditingMod = props.editingModule === mod.id;
                return (
                  <div key={mod.id} style={{ background: BG_ELEVATED, borderRadius: 6, border: `1px solid ${BORDER}`, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isEditingMod ? (
                        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input aria-label={kloelT('Nome do modulo')} value={props.editModuleData.name}
                            onChange={(e) => props.setEditModuleData({ name: e.target.value })}
                            style={{ ...inputStyle, flex: 1, fontSize: 11 }} ref={focusPrimaryInput} />
                          <button type="button" onClick={() => props.handleUpdateModule(selectedArea.id, mod.id)} disabled={props.saving}
                            style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '4px 8px' }}>Salvar</button>
                          <button type="button" onClick={() => props.setEditingModule(null)}
                            style={{ ...btnGhost, fontSize: 10, padding: '4px 8px' }}>Cancelar</button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: 'var(--app-text-primary)', flex: 1 }}>{mod.name}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)' }}>{lessons.length} aulas</span>
                          <button type="button" onClick={() => { props.setEditingModule(mod.id); props.setEditModuleData({ name: mod.name }); }}
                            style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}>{IC.edit(14)}</button>
                          <button type="button" onClick={() => props.handleDeleteModule(selectedArea.id, mod.id)}
                            style={{ ...iconBtn, color: colors.semantic.error }}>{IC.trash(14)}</button>
                        </>
                      )}
                    </div>

                    {lessons.map((lesson) => {
                      const isEditingLes = props.editingLesson === lesson.id;
                      return (
                        <div key={lesson.id} style={{ marginLeft: 16, padding: '6px 8px', borderLeft: `2px solid ${BORDER}`, marginTop: 4 }}>
                          {isEditingLes ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <input value={props.editLessonData.name}
                                onChange={(e) => props.setEditLessonData((p) => ({ ...p, name: e.target.value }))}
                                placeholder="Nome" style={{ ...inputStyle, fontSize: 11 }} />
                              <input value={props.editLessonData.videoUrl}
                                onChange={(e) => props.setEditLessonData((p) => ({ ...p, videoUrl: e.target.value }))}
                                placeholder="YouTube URL" style={{ ...inputStyle, fontSize: 11 }} />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="button" onClick={() => props.handleUpdateLesson(selectedArea.id, lesson.id)} disabled={props.saving}
                                  style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '4px 8px' }}>Salvar</button>
                                <button type="button" onClick={() => props.setEditingLesson(null)}
                                  style={{ ...btnGhost, fontSize: 10, padding: '4px 8px' }}>Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: PURPLE, flexShrink: 0 }}>{IC.play(12)}</span>
                              <span style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-primary)', flex: 1 }}>{lesson.name}</span>
                              <button type="button" onClick={() => { props.setEditingLesson(lesson.id); props.setEditLessonData({ name: lesson.name, description: lesson.description || '', videoUrl: lesson.videoUrl || '' }); }}
                                style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}>{IC.edit(12)}</button>
                              <button type="button" onClick={() => props.handleDeleteLesson(selectedArea.id, lesson.id)}
                                style={{ ...iconBtn, color: colors.semantic.error }}>{IC.trash(12)}</button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {props.creatingLesson === mod.id ? (
                      <div style={{ marginLeft: 16, marginTop: 6, padding: 8, background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input value={props.newLesson.name}
                            onChange={(e) => props.setNewLesson((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Nome da aula" style={{ ...inputStyle, fontSize: 11 }} ref={focusPrimaryInput} />
                          <input value={props.newLesson.videoUrl}
                            onChange={(e) => props.setNewLesson((p) => ({ ...p, videoUrl: e.target.value }))}
                            placeholder="YouTube URL" style={{ ...inputStyle, fontSize: 11 }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => props.handleCreateLesson(selectedArea.id, mod.id)} disabled={props.saving}
                              style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '4px 8px' }}>Adicionar</button>
                            <button type="button" onClick={() => { props.setCreatingLesson(null); props.setNewLesson({ name: '', description: '', videoUrl: '' }); }}
                              style={{ ...btnGhost, fontSize: 10, padding: '4px 8px' }}>Cancelar</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { props.setCreatingLesson(mod.id); props.setNewLesson({ name: '', description: '', videoUrl: '' }); }}
                        style={{ ...iconBtn, color: PURPLE, fontFamily: SORA, fontSize: 10, gap: 3, marginLeft: 16, marginTop: 4 }}>
                        {IC.plus(12)} <span>+ Aula</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
