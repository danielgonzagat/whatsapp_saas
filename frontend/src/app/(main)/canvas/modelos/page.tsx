'use client';

import { useRouter } from 'next/navigation';
import { IC } from '@/components/canvas/CanvasIcons';
import { FormatCard } from '@/components/canvas/FormatCard';
import { FORMAT_DATA, TEMPLATE_TAGS, type FormatItem } from '@/lib/canvas-formats';

const S = "var(--font-sora), 'Sora', sans-serif";

export default function CanvasModelos() {
  const router = useRouter();

  const openEditor = (fmt: FormatItem) => {
    router.push(`/canvas/editor?w=${fmt.w}&h=${fmt.h}&name=${encodeURIComponent(fmt.l)}`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1060, margin: '0 auto', animation: 'fu 0.4s ease' }}>
      {/* AI prompt bar */}
      <div style={{ maxWidth: 580, margin: '0 auto 20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#111113', border: '1px solid #1C1C1F', borderRadius: 6, padding: '10px 16px',
        }}>
          <span style={{ color: '#E85D30' }}>{IC.spark(18)}</span>
          <input
            placeholder="Descreva o modelo que voce precisa... A IA cria pra voce"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#E0DDD8', fontSize: 13, fontFamily: S,
            }}
          />
          <button style={{
            padding: '5px 12px', background: '#E85D30', border: 'none', borderRadius: 4,
            color: '#0A0A0C', fontSize: 11, fontWeight: 600, fontFamily: S, cursor: 'pointer',
          }}>
            Gerar
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {TEMPLATE_TAGS.map(t => (
            <button key={t} style={{
              padding: '4px 10px', background: '#E85D3010', border: '1px solid #E85D3020',
              borderRadius: 4, color: '#E85D30', fontSize: 10, fontFamily: S, cursor: 'pointer',
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', marginBottom: 14 }}>
        Explorar modelos
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(145px,1fr))', gap: 10 }}>
        {(FORMAT_DATA['para-voce'] || []).map((f, i) => (
          <FormatCard key={f.l + i} item={f} onClick={openEditor} />
        ))}
      </div>
    </div>
  );
}
