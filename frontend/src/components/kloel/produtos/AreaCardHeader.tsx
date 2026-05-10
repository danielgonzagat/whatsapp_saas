'use client';
import { colors } from '@/lib/design-tokens';

import type { DisplayArea } from './ProdutosView.types';
import {
  NP,
  fmt,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  inputStyle,
  selectStyle,
  btnPrimary,
  btnGhost,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import { kloelT } from '@/lib/i18n/t';

interface Props {
  area: DisplayArea;
  isExpanded: boolean;
  isEditing: boolean;
  saving: boolean;
  editAreaData: Record<string, boolean | string>;
  accentColor: string;
  previewPath: string | null;
  onToggle: (id: string) => void;
  onOpenStudents: (areaId: string, areaName: string) => void;
  onEdit: (areaId: string) => void;
  onDelete: (id: string) => void;
  onUpdateArea: (id: string) => void;
  onCancelEdit: () => void;
  onSetEditAreaData: React.Dispatch<React.SetStateAction<Record<string, boolean | string>>>;
}

export default function AreaCardHeader({
  area,
  isExpanded,
  isEditing,
  saving,
  editAreaData,
  accentColor: c,
  previewPath,
  onToggle,
  onOpenStudents,
  onEdit,
  onDelete,
  onUpdateArea,
  onCancelEdit,
  onSetEditAreaData,
}: Props) {
  return (
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
              style={{ ...iconBtn, color: colors.semantic.error }}
              onClick={() => onDelete(area.id)}
            >
              {IC.trash(16)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
