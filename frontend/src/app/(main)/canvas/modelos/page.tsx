'use client';

// PULSE:OK — AI generate POST navigates to editor on success; no SWR reads to invalidate.

import { IC } from '@/components/canvas/CanvasIcons';
import { FormatCard } from '@/components/canvas/FormatCard';
import { apiFetch } from '@/lib/api';
import {
  FORMAT_DATA,
  type FormatItem,
  PRODUCT_TEMPLATES,
  type ProductTemplate,
  TEMPLATE_TAGS,
} from '@/lib/canvas-formats';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from 'swr';

const S = "var(--font-sora), 'Sora', sans-serif";

export default function CanvasModelos() {
  const router = useRouter();

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!aiPrompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res: any = await apiFetch('/canvas/generate', {
        method: 'POST',
        body: { prompt: aiPrompt, width: 1080, height: 1080 },
      });
      const imageUrl = res?.data?.imageUrl;
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/canvas'));
      if (imageUrl) {
        router.push(
          `/canvas/editor?w=1080&h=1080&name=${encodeURIComponent(aiPrompt.slice(0, 40))}&aiImage=${encodeURIComponent(imageUrl)}`,
        );
        return;
      }
    } catch {}
    router.push(`/canvas/editor?w=1080&h=1080&name=${encodeURIComponent(aiPrompt.slice(0, 40))}`);
    setGenerating(false);
  };

  const openEditor = (fmt: FormatItem) => {
    router.push(`/canvas/editor?w=${fmt.w}&h=${fmt.h}&name=${encodeURIComponent(fmt.l)}`);
  };

  const openTemplate = (tpl: ProductTemplate) => {
    router.push(
      `/canvas/editor?w=${tpl.w}&h=${tpl.h}&name=${encodeURIComponent(tpl.name)}&tpl=${tpl.id}`,
    );
  };

  const filteredTemplates = activeTag
    ? PRODUCT_TEMPLATES.filter((t) => t.cat === activeTag)
    : PRODUCT_TEMPLATES;

  return (
    <div style={{ padding: '24px', maxWidth: 1060, margin: '0 auto', animation: 'fu 0.4s ease' }}>
      {/* AI prompt bar */}
      <div style={{ maxWidth: 580, margin: '0 auto 20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--app-bg-card)',
            border: '1px solid #1C1C1F',
            borderRadius: 6,
            padding: '10px 16px',
          }}
        >
          <span style={{ color: '#E85D30' }}>{IC.spark(18)}</span>
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="Descreva o modelo que voce precisa... A IA cria pra voce"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 13,
              fontFamily: S,
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !aiPrompt.trim()}
            style={{
              padding: '5px 12px',
              background: generating ? '#6E6E73' : '#E85D30',
              border: 'none',
              borderRadius: 4,
              color: 'var(--app-text-on-accent)',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: S,
              cursor: generating ? 'wait' : 'pointer',
              opacity: !aiPrompt.trim() ? 0.5 : 1,
            }}
          >
            {generating ? 'Gerando...' : 'Gerar'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTag(null)}
            style={{
              padding: '4px 10px',
              background: !activeTag ? '#E85D30' : '#E85D3010',
              border: `1px solid ${!activeTag ? '#E85D30' : '#E85D3020'}`,
              borderRadius: 4,
              color: !activeTag ? '#0A0A0C' : '#E85D30',
              fontSize: 10,
              fontWeight: !activeTag ? 600 : 400,
              fontFamily: S,
              cursor: 'pointer',
            }}
          >
            Todos
          </button>
          {TEMPLATE_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
              style={{
                padding: '4px 10px',
                background: activeTag === t ? '#E85D30' : '#E85D3010',
                border: `1px solid ${activeTag === t ? '#E85D30' : '#E85D3020'}`,
                borderRadius: 4,
                color: activeTag === t ? '#0A0A0C' : '#E85D30',
                fontSize: 10,
                fontWeight: activeTag === t ? 600 : 400,
                fontFamily: S,
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Product Templates ── */}
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          marginBottom: 14,
        }}
      >
        Modelos KLOEL
      </h3>
      {filteredTemplates.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: 'var(--app-text-tertiary)',
            fontFamily: S,
            marginBottom: 24,
          }}
        >
          Nenhum modelo encontrado para esse filtro.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))',
            gap: 10,
            marginBottom: 32,
          }}
        >
          {filteredTemplates.map((tpl) => (
            <TemplateCard key={tpl.id} tpl={tpl} onClick={openTemplate} />
          ))}
        </div>
      )}

      {/* ── Generic Formats ── */}
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          marginBottom: 14,
        }}
      >
        Explorar modelos
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(145px,1fr))',
          gap: 10,
        }}
      >
        {(FORMAT_DATA['para-voce'] || []).map((f, i) => (
          <FormatCard key={f.l + i} item={f} onClick={openEditor} />
        ))}
      </div>
    </div>
  );
}

/* ── Template Card ── */
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

function TemplateCard({
  tpl,
  onClick,
}: {
  tpl: ProductTemplate;
  onClick: (t: ProductTemplate) => void;
}) {
  const [h, setH] = useState(false);
  const [c1] = tpl.colors;
  const isStory = tpl.h > tpl.w;

  return (
    <button
      onClick={() => onClick(tpl)}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? '#151517' : '#111113',
        border: `1px solid ${h ? c1 + '35' : '#1C1C1F'}`,
        borderRadius: 6,
        padding: 0,
        cursor: 'pointer',
        transition: 'all 0.25s',
        overflow: 'hidden',
        textAlign: 'left',
        boxShadow: h ? `0 6px 20px ${c1}12` : 'none',
        transform: h ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Preview area */}
      <div
        style={{
          height: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0D0D0F',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Mini canvas preview */}
        <div
          style={{
            width: isStory ? 48 : 72,
            height: isStory ? 85 : 72,
            background: 'var(--app-bg-primary)',
            borderRadius: 3,
            position: 'relative',
            boxShadow: `0 2px 12px ${c1}20`,
            overflow: 'hidden',
          }}
        >
          {/* Accent line */}
          <div
            style={{
              position: 'absolute',
              left: '10%',
              top: '30%',
              width: '35%',
              height: 2,
              background: c1,
              borderRadius: 1,
            }}
          />
          {/* Text line 1 */}
          <div
            style={{
              position: 'absolute',
              left: '10%',
              top: '18%',
              width: '60%',
              height: 4,
              background: '#E0DDD8',
              borderRadius: 1,
              opacity: 0.8,
            }}
          />
          {/* Text line 2 */}
          <div
            style={{
              position: 'absolute',
              left: '10%',
              top: '25%',
              width: '40%',
              height: 2,
              background: '#6E6E73',
              borderRadius: 1,
              opacity: 0.5,
            }}
          />
          {/* CTA block */}
          <div
            style={{
              position: 'absolute',
              left: '10%',
              bottom: '10%',
              width: '30%',
              height: 5,
              background: c1,
              borderRadius: 1,
            }}
          />
        </div>
      </div>

      {/* Label */}
      <div style={{ padding: '7px 10px 9px' }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--app-text-primary)',
            fontFamily: S,
            marginBottom: 1,
          }}
        >
          {tpl.name}
        </p>
        <p style={{ fontSize: 9, color: 'var(--app-text-tertiary)', fontFamily: M }}>
          {tpl.w}x{tpl.h} &middot; {tpl.fmt}
        </p>
      </div>
    </button>
  );
}
