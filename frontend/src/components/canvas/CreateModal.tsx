'use client';

import {
  CATEGORIES,
  FORMAT_DATA,
  type FormatItem,
  QUICK_ACTIONS,
  RECENT_DIMENSIONS,
  SOCIAL_PLATFORMS,
} from '@/lib/canvas-formats';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IC, getIcon } from './CanvasIcons';
import { FormatCard } from './FormatCard';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateModal({ open, onClose }: CreateModalProps) {
  const router = useRouter();
  const [cat, setCat] = useState('para-voce');
  const [sf, setSf] = useState('Populares');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');

  if (!open) return null;

  const openEditor = (
    fmt: FormatItem | { l: string; w: number; h: number; c: [string, string]; m: string },
  ) => {
    onClose();
    router.push(`/canvas/editor?w=${fmt.w}&h=${fmt.h}&name=${encodeURIComponent(fmt.l)}`);
  };

  const fmts = (): FormatItem[] => {
    const a = FORMAT_DATA[cat] || [];
    if (cat === 'redes-sociais' && sf !== 'Populares') return a.filter((f) => f.p === sf);
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
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0A0A0C',
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
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
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
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E0DDD8', fontFamily: S }}>
            Criar um design
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              maxWidth: 340,
              marginLeft: 20,
              background: '#111113',
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '6px 10px',
            }}
          >
            {IC.search(14)}
            <input
              aria-label="O que voce gostaria de criar"
              placeholder="O que voce gostaria de criar?"
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#E0DDD8',
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
              color: '#3A3A3F',
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
                    e.currentTarget.style.background = '#151517';
                    e.currentTarget.style.color = '#E0DDD8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (cat !== c.id) {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.color = '#6E6E73';
                  }
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 14px',
                  background: cat === c.id ? '#E85D3008' : 'none',
                  border: 'none',
                  borderLeft: cat === c.id ? '2px solid #E85D30' : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: S,
                  fontSize: 12,
                  fontWeight: cat === c.id ? 600 : 400,
                  color: cat === c.id ? '#E85D30' : '#6E6E73',
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
  openEditor: (fmt: any) => void;
}) {
  return (
    <div>
      <h3
        style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: S, marginBottom: 16 }}
      >
        Tamanho personalizado
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#6E6E73',
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
          >
            Largura
          </label>
          <input
            aria-label="Largura em pixels"
            value={customW}
            onChange={(e) => setCustomW(e.target.value)}
            placeholder="1080"
            style={{
              width: '100%',
              background: '#111113',
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '10px 12px',
              color: '#E0DDD8',
              fontSize: 14,
              fontFamily: M,
              outline: 'none',
            }}
          />
        </div>
        <span style={{ color: '#3A3A3F', marginTop: 20, fontFamily: M, fontSize: 12 }}>x</span>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#6E6E73',
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
          >
            Altura
          </label>
          <input
            aria-label="Altura em pixels"
            value={customH}
            onChange={(e) => setCustomH(e.target.value)}
            placeholder="1080"
            style={{
              width: '100%',
              background: '#111113',
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '10px 12px',
              color: '#E0DDD8',
              fontSize: 14,
              fontFamily: M,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 0.6 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#6E6E73',
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
          >
            Unidades
          </label>
          <select
            style={{
              width: '100%',
              background: '#111113',
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              padding: '10px',
              color: '#E0DDD8',
              fontSize: 12,
              fontFamily: S,
              outline: 'none',
            }}
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
              w: Number.parseInt(customW) || 1080,
              h: Number.parseInt(customH) || 1080,
              c: ['#E85D30', '#F2784B'],
              m: 'square',
            })
          }
          style={{
            marginTop: 20,
            padding: '10px 18px',
            background: '#E85D30',
            border: 'none',
            borderRadius: 4,
            color: '#0A0A0C',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: S,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Criar
        </button>
      </div>
      <p
        style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', fontFamily: S, marginBottom: 10 }}
      >
        Dimensoes recentes
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {RECENT_DIMENSIONS.map((d, i) => (
          <button
            type="button"
            key={i}
            onClick={() =>
              openEditor({
                l: `${d.w}x${d.h}`,
                w: d.w,
                h: d.h,
                c: ['#6E6E73', '#3A3A3F'],
                m: 'square',
              })
            }
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E85D3040')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1C1C1F')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#111113',
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
              stroke="#3A3A3F"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            <span style={{ fontFamily: M, fontSize: 12, color: '#E0DDD8' }}>
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
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E85D3040')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1C1C1F')}
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
        <div style={{ color: '#E85D30', opacity: 0.5 }}>{IC.upload(40)}</div>
        <p
          style={{
            fontSize: 14,
            color: '#6E6E73',
            fontFamily: "var(--font-sora), 'Sora', sans-serif",
          }}
        >
          Arraste seu conteudo para ca ou
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              background: '#E85D30',
              border: 'none',
              borderRadius: 4,
              color: '#0A0A0C',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {IC.plus(12)} Fazer upload de arquivos
          </button>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              background: '#111113',
              border: '1px solid #1C1C1F',
              borderRadius: 4,
              color: '#E0DDD8',
              fontSize: 12,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              cursor: 'pointer',
            }}
          >
            Fazer upload de pasta
          </button>
        </div>
      </div>
      <p
        style={{
          fontSize: 11,
          color: '#3A3A3F',
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
        }}
      >
        Aceita imagens, videos, outros arquivos e pastas
      </p>
    </div>
  );
}

/* ═══ Format Grid (for most categories) ═══ */
function FormatGrid({
  cat,
  sf,
  setSf,
  fmts,
  openEditor,
}: {
  cat: string;
  sf: string;
  setSf: (v: string) => void;
  fmts: FormatItem[];
  openEditor: (fmt: FormatItem) => void;
}) {
  return (
    <div>
      {cat === 'redes-sociais' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SOCIAL_PLATFORMS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setSf(s)}
              style={{
                padding: '5px 12px',
                background: sf === s ? '#E85D3010' : 'none',
                border: `1px solid ${sf === s ? '#E85D3030' : '#1C1C1F'}`,
                borderRadius: 4,
                color: sf === s ? '#E85D30' : '#6E6E73',
                fontSize: 11,
                fontWeight: sf === s ? 600 : 400,
                fontFamily: "var(--font-sora), 'Sora', sans-serif",
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {cat === 'para-voce' && (
        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#6E6E73',
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Acoes rapidas
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {QUICK_ACTIONS.map((a) => (
              <button
                type="button"
                key={a.l}
                onClick={() =>
                  openEditor({
                    l: a.l,
                    w: 1080,
                    h: 1080,
                    c: a.c,
                    m: 'square',
                    s: '1080x1080',
                  } as FormatItem)
                }
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${a.c[0]}40`)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1C1C1F')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 12px',
                  background: '#111113',
                  border: '1px solid #1C1C1F',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  minWidth: 85,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    background: `linear-gradient(135deg,${a.c[0]},${a.c[1]})`,
                    opacity: 0.8,
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: '#6E6E73',
                    fontFamily: "var(--font-sora), 'Sora', sans-serif",
                    textAlign: 'center',
                  }}
                >
                  {a.l}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#6E6E73',
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          marginBottom: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {sf !== 'Populares'
          ? sf
          : cat === 'para-voce'
            ? 'Populares'
            : CATEGORIES.find((c) => c.id === cat)?.label}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(148px,1fr))',
          gap: 10,
        }}
      >
        {fmts.map((f, i) => (
          <FormatCard key={f.l + i} item={f} onClick={openEditor} />
        ))}
      </div>

      {fmts.length > 0 && cat !== 'redes-sociais' && (
        <div style={{ marginTop: 20 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#6E6E73',
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Outras formas de comecar
          </p>
          <button
            type="button"
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E85D3040')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1C1C1F')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#111113',
              border: '1px solid #1C1C1F',
              borderRadius: 6,
              padding: '12px 16px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 4,
                background: 'linear-gradient(135deg,#E85D3020,#E85D3008)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: '#E85D30' }}>{IC.grid(15)}</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#E0DDD8',
                  fontFamily: "var(--font-sora), 'Sora', sans-serif",
                }}
              >
                Explorar modelos
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: '#3A3A3F',
                  fontFamily: "var(--font-sora), 'Sora', sans-serif",
                }}
              >
                Templates prontos pra usar
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
