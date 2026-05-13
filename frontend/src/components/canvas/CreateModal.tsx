'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  CATEGORIES,
  FORMAT_DATA,
  type FormatItem,
} from '@/lib/canvas-formats';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IC, getIcon } from './CanvasIcons';
import { CustomSizePanel } from './CustomSizePanel';
import { UploadPanel } from './UploadPanel';
import { FormatGrid } from './FormatGrid';

const S = "var(--font-sora), 'Sora', sans-serif";

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
        aria-label={kloelT('Fechar modal')}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: colors.background.void,
          border: `1px solid ${colors.canvas.border}`,
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
            borderBottom: `1px solid ${colors.canvas.border}`,
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
              border: `1px solid ${colors.canvas.border}`,
              borderRadius: 4,
              padding: '6px 10px',
            }}
          >
            {IC.search(14)}
            <input
              aria-label={kloelT('O que voce gostaria de criar')}
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
              borderRight: `1px solid ${colors.canvas.border}`,
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
                      colors.canvas.surfaceAlt;
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

