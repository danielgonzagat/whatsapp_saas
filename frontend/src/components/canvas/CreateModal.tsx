'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  CATEGORIES,
  FORMAT_DATA,
  type FormatItem,
  QUICK_ACTIONS,
  RECENT_DIMENSIONS,
  SOCIAL_PLATFORMS,
} from '@/lib/canvas-formats';
import { useRouter } from 'next/navigation';
import { useState, useId } from 'react';
import { IC, getIcon } from './CanvasIcons';
import { FormatCard } from './FormatCard';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
}

/** Create modal. */
export function CreateModal({ open, onClose }: CreateModalProps) {
  const router = useRouter();
  const [cat, setCat] = useState('para-voce');
  const [sf, setSf] = useState('Populares');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');

  if (!open) {
    return null;
  }

  const openEditor = (
    fmt: FormatItem | { l: string; w: number; h: number; c: [string, string]; m: string },
  ) => {
    onClose();
    router.push(`/canvas/editor?w=${fmt.w}&h=${fmt.h}&name=${encodeURIComponent(fmt.l)}`);
  };

  const fmts = (): FormatItem[] => {
    const a = FORMAT_DATA[cat] || [];
    if (cat === 'redes-sociais' && sf !== 'Populares') {
      return a.filter((f) => f.p === sf);
    }
    return a;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        animation: 'fi 0.15s ease',
      }}
    >
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: colors.background.void,
          border: '1px solid #1C1C1F',
          borderRadius: 6,
          width: '92vw',
          maxWidth: 920,
          height: '82vh',
          maxHeight: 640,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'mi 0.25s ease',
          boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid #1C1C1F',
            flexShrink: 0,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.text.silver, fontFamily: S }}>
            {kloelT(`Criar um design`)}
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              maxWidth: 340,
              marginLeft: 20,
              background: colors.background.surface,
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '6px 10px',
            }}
          >
            {IC.search(14)}
            <input
              aria-label="O que voce gostaria de criar"
              placeholder={kloelT(`O que voce gostaria de criar?`)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: colors.text.silver,
                fontSize: 12,
                fontFamily: S,
              }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: colors.text.dim,
              cursor: 'pointer',
              padding: 6,
              marginLeft: 12,
            }}
          >
            {IC.x(18)}
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Categories sidebar */}
          <div
            className="sb"
            style={{
              width: 190,
              borderRight: '1px solid #1C1C1F',
              overflowY: 'auto',
              padding: '6px 0',
              flexShrink: 0,
            }}
          >
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  setCat(c.id);
                  setSf('Populares');
                }}
                onMouseEnter={(e) => {
                  if (cat !== c.id) {
                    e.currentTarget.style.background =
                      '#151517' /* PULSE_VISUAL_OK: intermediate surface tone */;
                    e.currentTarget.style.color = colors.text.silver;
                  }
                }}
                onMouseLeave={(e) => {
                  if (cat !== c.id) {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.color = colors.text.muted;
                  }
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 14px',
                  background: cat === c.id ? 'colors.ember.bg' : 'none',
                  border: 'none',
                  borderLeft:
                    cat === c.id ? '2px solid colors.ember.primary' : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: S,
                  fontSize: 12,
                  fontWeight: cat === c.id ? 600 : 400,
                  color: cat === c.id ? colors.ember.primary : colors.text.muted,
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ opacity: cat === c.id ? 1 : 0.5, display: 'flex' }}>
                  {getIcon(c.icon)(15)}
                </span>
                {c.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="sb" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {cat === 'personalizado' ? (
              <CustomSizePanel
                customW={customW}
                customH={customH}
                setCustomW={setCustomW}
                setCustomH={setCustomH}
                openEditor={openEditor}
              />
            ) : cat === 'upload' ? (
              <UploadPanel />
            ) : (
              <FormatGrid cat={cat} sf={sf} setSf={setSf} fmts={fmts()} openEditor={openEditor} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Custom Size Panel ═══ */
function CustomSizePanel({
  customW,
  customH,
  setCustomW,
  setCustomH,
  openEditor,
}: {
  customW: string;
  customH: string;
  setCustomW: (v: string) => void;
  setCustomH: (v: string) => void;
  openEditor: (
    fmt: FormatItem | { l: string; w: number; h: number; c: [string, string]; m: string },
  ) => void;
}) {
  const fid = useId();
  return (
    <div>
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: colors.text.silver,
          fontFamily: S,
          marginBottom: 16,
        }}
      >
        {kloelT(`Tamanho personalizado`)}
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
            htmlFor={`${fid}-largura`}
          >
            {kloelT(`Largura`)}
          </label>
          <input
            aria-label="Largura em pixels"
            value={customW}
            onChange={(e) => setCustomW(e.target.value)}
            placeholder="1080"
            style={{
              width: '100%',
              background: colors.background.surface,
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '10px 12px',
              color: colors.text.silver,
              fontSize: 14,
              fontFamily: M,
              outline: 'none',
            }}
            id={`${fid}-largura`}
          />
        </div>
        <span style={{ color: colors.text.dim, marginTop: 20, fontFamily: M, fontSize: 12 }}>
          x
        </span>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
            htmlFor={`${fid}-altura`}
          >
            {kloelT(`Altura`)}
          </label>
          <input
            aria-label="Altura em pixels"
            value={customH}
            onChange={(e) => setCustomH(e.target.value)}
            placeholder="1080"
            style={{
              width: '100%',
              background: colors.background.surface,
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '10px 12px',
              color: colors.text.silver,
              fontSize: 14,
              fontFamily: M,
              outline: 'none',
            }}
            id={`${fid}-altura`}
          />
        </div>
        <div style={{ flex: 0.6 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
            htmlFor={`${fid}-unidades`}
          >
            {kloelT(`Unidades`)}
          </label>
          <select
            style={{
              width: '100%',
              background: colors.background.surface,
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '10px',
              color: colors.text.silver,
              fontSize: 12,
              fontFamily: S,
              outline: 'none',
            }}
            id={`${fid}-unidades`}
          >
            <option>px</option>
            <option>mm</option>
            <option>cm</option>
            <option>in</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() =>
            openEditor({
              l: 'Personalizado',
              w: Number.parseInt(customW, 10) || 1080,
              h: Number.parseInt(customH, 10) || 1080,
              c: [colors.ember.primary, '#F2784B'],
              m: 'square',
            })
          }
          style={{
            marginTop: 20,
            padding: '10px 18px',
            background: colors.ember.primary,
            border: 'none',
            borderRadius: 4,
            color: colors.background.void,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: S,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {kloelT(`Criar`)}
        </button>
      </div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: colors.text.muted,
          fontFamily: S,
          marginBottom: 10,
        }}
      >
        {kloelT(`Dimensoes recentes`)}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {RECENT_DIMENSIONS.map((d) => (
          <button
            type="button"
            key={`${d.w}x${d.h}`}
            onClick={() =>
              openEditor({
                l: `${d.w}x${d.h}`,
                w: d.w,
                h: d.h,
                c: [colors.text.muted, colors.text.dim],
                m: 'square',
              })
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'colors.ember.glow40';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor =
                '#1C1C1F' /* PULSE_VISUAL_OK: intermediate surface tone, near elevated */;
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: colors.background.surface,
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '10px 14px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: S,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.text.dim}
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            <span style={{ fontFamily: M, fontSize: 12, color: colors.text.silver }}>
              {d.w} x {d.h} px
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══ Upload Panel ═══ */
function UploadPanel() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          height: 280,
          border: '2px dashed #1C1C1F',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ color: colors.ember.primary, opacity: 0.5 }}>{IC.upload(40)}</div>
        <p
          style={{
            fontSize: 14,
            color: colors.text.muted,
            fontFamily: "var(--font-sora), 'Sora', sans-serif",
          }}
        >
          {kloelT(`Arraste seu conteudo para ca ou`)}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              background: colors.ember.primary,
              border: 'none',
              borderRadius: 4,
              color: colors.background.void,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {IC.plus(12)} {kloelT(`Fazer upload de arquivos`)}
          </button>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              background: colors.background.surface,
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              color: colors.text.silver,
              fontSize: 12,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              cursor: 'pointer',
            }}
          >
            {kloelT(`Fazer upload de pasta`)}
          </button>
        </div>
      </div>
      <p
        style={{
          fontSize: 11,
          color: colors.text.dim,
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
        }}
      >
        {kloelT(`Aceita imagens, videos, outros arquivos e pastas`)}
      </p>
    </div>
  );
}
import "../../__companions__/CreateModal.companion";
