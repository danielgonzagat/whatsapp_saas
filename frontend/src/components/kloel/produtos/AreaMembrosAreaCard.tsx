'use client';

import type { DisplayArea, DisplayProduct } from './ProdutosView.types';
import {
  NP,
  fmt,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  PURPLE,
  inputStyle,
  selectStyle,
  btnPrimary,
  btnGhost,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import { kloelT } from '@/lib/i18n/t';
import { buildMemberAreaPreviewPath } from '@/lib/member-area-preview';
import { toSupportedEmbedUrl } from '@/lib/video-embed';

interface Props {
  area: DisplayArea;
  isExpanded: boolean;
  productOptions: DisplayProduct[];
  saving: boolean;
  generatingAreaId: string | null;
  editingArea: string | null;
  editAreaData: Record<string, boolean | string>;
  creatingModule: string | null;
  newModule: { name: string };
  editingModule: string | null;
  editModuleData: { name: string };
  creatingLesson: string | null;
  newLesson: { name: string; description: string; videoUrl: string };
  editingLesson: string | null;
  editLessonData: { name: string; description: string; videoUrl: string };
  onToggle: (id: string) => void;
  onOpenStudents: (areaId: string, areaName: string) => void;
  onEdit: (areaId: string) => void;
  onDelete: (id: string) => void;
  onGenerateStructure: (areaId: string) => void;
  onUpdateArea: (id: string) => void;
  onCancelEdit: () => void;
  onSetEditAreaData: React.Dispatch<
    React.SetStateAction<Record<string, boolean | string>>
  >;
  onCreateModule: (areaId: string) => void;
  onSetCreatingModule: (id: string | null) => void;
  onSetNewModule: (data: { name: string }) => void;
  onEditModule: (moduleId: string) => void;
  onSetEditingModule: (id: string | null) => void;
  onSetEditModuleData: (data: { name: string }) => void;
  onUpdateModule: (areaId: string, moduleId: string) => void;
  onDeleteModule: (areaId: string, moduleId: string) => void;
  onCreateLesson: (areaId: string, moduleId: string) => void;
  onSetCreatingLesson: (id: string | null) => void;
  onSetNewLesson: (data: {
    name: string;
    description: string;
    videoUrl: string;
  }) => void;
  onEditLesson: (lessonId: string) => void;
  onSetEditingLesson: (id: string | null) => void;
  onSetEditLessonData: (data: {
    name: string;
    description: string;
    videoUrl: string;
  }) => void;
  onUpdateLesson: (areaId: string, lessonId: string) => void;
  onDeleteLesson: (areaId: string, lessonId: string) => void;
}

const accentColor = (a: DisplayArea) => a.primaryColor || PURPLE;
const modules = (a: DisplayArea) => a.modules_list || a.modulesList || [];

export default function AreaMembrosAreaCard({
  area,
  isExpanded,
  productOptions: _po,
  saving,
  generatingAreaId,
  editingArea,
  editAreaData,
  creatingModule,
  newModule,
  editingModule,
  editModuleData,
  creatingLesson,
  newLesson,
  editingLesson,
  editLessonData,
  onToggle,
  onOpenStudents,
  onEdit,
  onDelete,
  onGenerateStructure,
  onUpdateArea,
  onCancelEdit,
  onSetEditAreaData,
  onCreateModule,
  onSetCreatingModule,
  onSetNewModule,
  onEditModule,
  onSetEditingModule,
  onSetEditModuleData,
  onUpdateModule,
  onDeleteModule,
  onCreateLesson,
  onSetCreatingLesson,
  onSetNewLesson,
  onEditLesson,
  onSetEditingLesson,
  onSetEditLessonData,
  onUpdateLesson,
  onDeleteLesson,
}: Props) {
  const isEditing = editingArea === area.id;
  const isGenerating = generatingAreaId === area.id;
  const c = accentColor(area);
  const previewPath = buildMemberAreaPreviewPath(area.id);

  return (
    <div
      style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Accent strip */}
      <div style={{ height: 3, background: c }} />

      <div style={{ padding: '14px 16px' }}>
        {/* Header Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            type="button"
            style={{
              ...iconBtn,
              transform: isExpanded ? 'rotate(90deg)' : undefined,
              transition: 'transform 0.2s',
              color: 'var(--app-text-secondary)',
            }}
            onClick={() => onToggle(area.id)}
          >
            {IC.chevRight(18)}
          </button>

          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {area.logoUrl ? (
              <img
                src={area.logoUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ color: c }}>{IC.users(18)}</span>
            )}
          </div>

          {isEditing ? (
            /* Inline edit header */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                flex: 1,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={String(editAreaData.name || '')}
                  onChange={(e) =>
                    onSetEditAreaData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={kloelT('Nome da area')}
                  style={{ ...inputStyle, maxWidth: 180 }}
                />
                <select
                  value={String(editAreaData.type || '')}
                  onChange={(e) =>
                    onSetEditAreaData((prev) => ({ ...prev, type: e.target.value }))
                  }
                  style={{ ...selectStyle, maxWidth: 120 }}
                >
                  <option value="COURSE">{kloelT('Curso')}</option>
                  <option value="COMMUNITY">{kloelT('Comunidade')}</option>
                  <option value="HYBRID">{kloelT('Hibrido')}</option>
                </select>
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  <button
                    type="button"
                    style={btnPrimary(c)}
                    disabled={saving}
                    onClick={() => onUpdateArea(area.id)}
                  >
                    {saving ? kloelT('Salvando...') : kloelT('Salvar')}
                  </button>
                  <button type="button" style={btnGhost} onClick={onCancelEdit}>
                    {kloelT('Cancelar')}
                  </button>
                </div>
              </div>
              <input
                value={String(editAreaData.slug || '')}
                onChange={(e) =>
                  onSetEditAreaData((prev) => ({ ...prev, slug: e.target.value }))
                }
                placeholder={kloelT('slug')}
                style={{ ...inputStyle, maxWidth: 200 }}
              />
            </div>
          ) : (
            /* Read-only header info */
            <>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontFamily: SORA,
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--app-text-primary)',
                    }}
                  >
                    {area.name}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: `${c}18`,
                      color: c,
                    }}
                  >
                    {area.type}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    fontFamily: MONO,
                    fontSize: 11,
                    color: 'var(--app-text-tertiary)',
                  }}
                >
                  <span>
                    {fmt(area.modulesCount || area.modules)} {kloelT('modulos')}
                  </span>
                  <span>/ {area.slug}</span>
                </div>
              </div>

              <NP w={100} h={22} color={c} />

              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                }}
              >
                {fmt(area.students)} {kloelT('alunos')}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: c }}>
                {Math.round(area.completion)}%
              </span>

              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button
                  type="button"
                  style={iconBtn}
                  title={kloelT('Alunos')}
                  onClick={() => onOpenStudents(area.id, area.name)}
                >
                  {IC.users(16)}
                </button>
                {previewPath && (
                  <a
                    href={previewPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...iconBtn, textDecoration: 'none' }}
                    title={kloelT('Preview')}
                  >
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </a>
                )}
                <button
                  type="button"
                  style={iconBtn}
                  onClick={() => onEdit(area.id)}
                >
                  {IC.edit(16)}
                </button>
                <button
                  type="button"
                  style={{ ...iconBtn, color: '#EF4444' }}
                  onClick={() => onDelete(area.id)}
                >
                  {IC.trash(16)}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Generate structure button (when not editing) */}
        {!isEditing && modules(area).length === 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              style={btnPrimary(c)}
              disabled={isGenerating}
              onClick={() => onGenerateStructure(area.id)}
            >
              {isGenerating
                ? kloelT('Gerando...')
                : kloelT('Gerar estrutura de modulos')}
            </button>
          </div>
        )}
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <div
          style={{
            padding: '0 16px 16px',
            borderTop: `1px solid ${BORDER}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Cover & Description */}
          {area.coverUrl && (
            <div style={{ marginTop: 12 }}>
              <img
                src={area.coverUrl}
                alt=""
                style={{
                  width: '100%',
                  maxHeight: 160,
                  objectFit: 'cover',
                  borderRadius: 8,
                }}
              />
            </div>
          )}
          {area.description && (
            <p
              style={{
                fontFamily: SORA,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {area.description}
            </p>
          )}

          {/* Feature Tags */}
          {[
            { key: 'certificates', label: kloelT('Certificados') },
            { key: 'quizzes', label: kloelT('Quizzes') },
            { key: 'community', label: kloelT('Comunidade') },
            { key: 'gamification', label: kloelT('Gamificacao') },
            { key: 'progressTrack', label: kloelT('Progresso') },
            { key: 'downloads', label: kloelT('Downloads') },
            { key: 'comments', label: kloelT('Comentarios') },
          ].filter((f) => (area as Record<string, unknown>)[f.key]).length >
            0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { key: 'certificates', label: kloelT('Certificados') },
                { key: 'quizzes', label: kloelT('Quizzes') },
                { key: 'community', label: kloelT('Comunidade') },
                { key: 'gamification', label: kloelT('Gamificacao') },
                { key: 'progressTrack', label: kloelT('Progresso') },
                { key: 'downloads', label: kloelT('Downloads') },
                { key: 'comments', label: kloelT('Comentarios') },
              ]
                .filter((f) => (area as Record<string, unknown>)[f.key])
                .map((f) => (
                  <span
                    key={f.key}
                    style={{
                      fontFamily: SORA,
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: `${c}10`,
                      color: c,
                      border: `1px solid ${c}30`,
                    }}
                  >
                    {f.label}
                  </span>
                ))}
            </div>
          )}

          {/* Modules & Lessons */}
          {modules(area).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--app-text-primary)',
                  }}
                >
                  {kloelT('Modulos')}
                </span>
                <button
                  type="button"
                  style={btnPrimary(c)}
                  onClick={() => {
                    onSetNewModule({ name: '' });
                    onSetCreatingModule(area.id);
                  }}
                >
                  + {kloelT('Modulo')}
                </button>
              </div>

              {creatingModule === area.id && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: 8,
                    background: `${c}08`,
                    borderRadius: 6,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <input
                    value={newModule.name}
                    onChange={(e) => onSetNewModule({ name: e.target.value })}
                    placeholder={kloelT('Nome do modulo')}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    style={btnPrimary(c)}
                    onClick={() => onCreateModule(area.id)}
                  >
                    {kloelT('Criar')}
                  </button>
                  <button
                    type="button"
                    style={btnGhost}
                    onClick={() => onSetCreatingModule(null)}
                  >
                    {kloelT('Cancelar')}
                  </button>
                </div>
              )}

              {modules(area).map((mod) => (
                <div
                  key={mod.id}
                  style={{
                    background: `${c}06`,
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {/* Module header */}
                  {editingModule === mod.id ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={editModuleData.name}
                        onChange={(e) =>
                          onSetEditModuleData({ name: e.target.value })
                        }
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        style={btnPrimary(c)}
                        onClick={() => onUpdateModule(area.id, mod.id)}
                      >
                        {kloelT('Salvar')}
                      </button>
                      <button
                        type="button"
                        style={btnGhost}
                        onClick={() => onSetEditingModule(null)}
                      >
                        {kloelT('Cancelar')}
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ color: c }}>{IC.book(14)}</span>
                      <span
                        style={{
                          fontFamily: SORA,
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--app-text-primary)',
                          flex: 1,
                        }}
                      >
                        {mod.name}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          color: 'var(--app-text-tertiary)',
                        }}
                      >
                        {mod.lessons?.length ?? 0} {kloelT('aulas')}
                      </span>
                      <button
                        type="button"
                        style={iconBtn}
                        onClick={() => onEditModule(mod.id)}
                      >
                        {IC.edit(14)}
                      </button>
                      <button
                        type="button"
                        style={{ ...iconBtn, color: '#EF4444' }}
                        onClick={() => onDeleteModule(area.id, mod.id)}
                      >
                        {IC.trash(14)}
                      </button>
                    </div>
                  )}

                  {/* Lessons */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      paddingLeft: 22,
                    }}
                  >
                    {mod.lessons?.map((lsn) => (
                      <div
                        key={lsn.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          padding: 8,
                          background: BG_CARD,
                          borderRadius: 6,
                          border: `1px solid ${BORDER}`,
                        }}
                      >
                        {editingLesson === lsn.id ? (
                          <>
                            <input
                              value={editLessonData.name}
                              onChange={(e) =>
                                onSetEditLessonData({
                                  ...editLessonData,
                                  name: e.target.value,
                                })
                              }
                              placeholder={kloelT('Nome da aula')}
                              style={inputStyle}
                            />
                            <input
                              value={editLessonData.description}
                              onChange={(e) =>
                                onSetEditLessonData({
                                  ...editLessonData,
                                  description: e.target.value,
                                })
                              }
                              placeholder={kloelT('Descricao')}
                              style={inputStyle}
                            />
                            <input
                              value={editLessonData.videoUrl}
                              onChange={(e) =>
                                onSetEditLessonData({
                                  ...editLessonData,
                                  videoUrl: e.target.value,
                                })
                              }
                              placeholder={kloelT('URL do video')}
                              style={inputStyle}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                style={btnPrimary(c)}
                                onClick={() =>
                                  onUpdateLesson(area.id, lsn.id)
                                }
                              >
                                {kloelT('Salvar')}
                              </button>
                              <button
                                type="button"
                                style={btnGhost}
                                onClick={() => onSetEditingLesson(null)}
                              >
                                {kloelT('Cancelar')}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <span style={{ color: c }}>{IC.play(12)}</span>
                              <span
                                style={{
                                  fontFamily: SORA,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: 'var(--app-text-primary)',
                                  flex: 1,
                                }}
                              >
                                {lsn.name}
                              </span>
                              <button
                                type="button"
                                style={iconBtn}
                                onClick={() => onEditLesson(lsn.id)}
                              >
                                {IC.edit(12)}
                              </button>
                              <button
                                type="button"
                                style={{ ...iconBtn, color: '#EF4444' }}
                                onClick={() =>
                                  onDeleteLesson(area.id, lsn.id)
                                }
                              >
                                {IC.trash(12)}
                              </button>
                            </div>
                            {lsn.description && (
                              <p
                                style={{
                                  fontFamily: SORA,
                                  fontSize: 11,
                                  color: 'var(--app-text-tertiary)',
                                  margin: 0,
                                  lineHeight: 1.4,
                                }}
                              >
                                {lsn.description}
                              </p>
                            )}
                            {lsn.videoUrl && (
                              (() => {
                                const embedUrl = toSupportedEmbedUrl(lsn.videoUrl);
                                return embedUrl ? (
                                  <iframe
                                    src={embedUrl}
                                    title={lsn.name}
                                    style={{
                                      width: '100%',
                                      height: 180,
                                      border: 'none',
                                      borderRadius: 6,
                                    }}
                                    allow="autoplay; fullscreen"
                                  />
                                ) : null;
                              })()
                            )}
                          </>
                        )}
                      </div>
                    ))}

                    {/* Add lesson to module */}
                    {creatingLesson === mod.id ? (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          padding: 8,
                          background: `${c}08`,
                          borderRadius: 6,
                          border: `1px solid ${BORDER}`,
                        }}
                      >
                        <input
                          value={newLesson.name}
                          onChange={(e) =>
                            onSetNewLesson({ ...newLesson, name: e.target.value })
                          }
                          placeholder={kloelT('Nome da aula')}
                          style={inputStyle}
                        />
                        <input
                          value={newLesson.description}
                          onChange={(e) =>
                            onSetNewLesson({
                              ...newLesson,
                              description: e.target.value,
                            })
                          }
                          placeholder={kloelT('Descricao')}
                          style={inputStyle}
                        />
                        <input
                          value={newLesson.videoUrl}
                          onChange={(e) =>
                            onSetNewLesson({
                              ...newLesson,
                              videoUrl: e.target.value,
                            })
                          }
                          placeholder={kloelT('URL do video')}
                          style={inputStyle}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            style={btnPrimary(c)}
                            onClick={() =>
                              onCreateLesson(area.id, mod.id)
                            }
                          >
                            {kloelT('Criar')}
                          </button>
                          <button
                            type="button"
                            style={btnGhost}
                            onClick={() => onSetCreatingLesson(null)}
                          >
                            {kloelT('Cancelar')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        style={{
                          ...btnGhost,
                          alignSelf: 'flex-start',
                          opacity: 0.7,
                        }}
                        onClick={() =>
                          onSetCreatingLesson(mod.id)
                        }
                      >
                        + {kloelT('Aula')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
