'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IC } from '@/components/canvas/CanvasIcons';
import { FormatPills } from '@/components/canvas/FormatPills';
import { CreateModal } from '@/components/canvas/CreateModal';
import { useCanvasDesigns, type CanvasDesign } from '@/hooks/useCanvasDesigns';
import { apiFetch } from '@/lib/api';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export default function CanvasInicio() {
  const router = useRouter();
  const { designs, loading } = useCanvasDesigns();
  const [ai, setAi] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [mt, setMt] = useState(false);

  useEffect(() => { setTimeout(() => setMt(true), 30); }, []);

  const handleAiSubmit = async () => {
    if (!ai.trim()) return;
    try {
      const res: any = await apiFetch('/canvas/generate', { method: 'POST', body: { prompt: ai, width: 1080, height: 1080 } });
      if (res?.data?.imageUrl) {
        router.push(`/canvas/editor?w=1080&h=1080&name=${encodeURIComponent(ai.slice(0, 40))}&aiImage=${encodeURIComponent(res.data.imageUrl)}`);
        return;
      }
    } catch {}
    router.push(`/canvas/editor?w=1080&h=1080&name=${encodeURIComponent(ai.slice(0, 40))}`);
  };

  return (
    <div style={{ padding: '0 24px', maxWidth: 1060, margin: '0 auto', animation: mt ? 'fu 0.4s ease' : 'none' }}>
      {/* AI Conversation Bar */}
      <div style={{ maxWidth: 640, margin: '32px auto 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#111113', border: '1px solid #1C1C1F', borderRadius: 6, padding: '10px 16px',
        }}>
          <span style={{ color: '#E85D30' }}>{IC.spark(18)}</span>
          <input
            value={ai}
            onChange={e => setAi(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAiSubmit()}
            placeholder="Descreva o criativo que voce quer criar..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#E0DDD8', fontSize: 13, fontFamily: S,
            }}
          />
          {ai && (
            <button
              onClick={handleAiSubmit}
              style={{
                padding: '5px 12px', background: '#E85D30', border: 'none', borderRadius: 4,
                color: '#0A0A0C', fontSize: 11, fontWeight: 600, fontFamily: S, cursor: 'pointer',
              }}
            >
              Criar
            </button>
          )}
        </div>
      </div>

      {/* Format Pills */}
      <FormatPills onPillClick={() => setShowCreate(true)} />

      {/* Recentes */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#E0DDD8', fontFamily: S, marginBottom: 14 }}>
          Recentes
        </h2>
        {loading ? (
          <div style={{
            background: '#111113', border: '1px solid #1C1C1F', borderRadius: 6,
            padding: '48px 24px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 13, color: '#3A3A3F', fontFamily: S }}>Carregando...</p>
          </div>
        ) : designs.length === 0 ? (
          <div style={{
            background: '#111113', border: '1px dashed #1C1C1F', borderRadius: 6,
            padding: '48px 24px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 13, color: '#3A3A3F', fontFamily: S, marginBottom: 8 }}>
              Nenhum design criado ainda
            </p>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '8px 20px', background: '#E85D30', border: 'none', borderRadius: 4,
                color: '#0A0A0C', fontSize: 12, fontWeight: 600, fontFamily: S, cursor: 'pointer',
              }}
            >
              Criar primeiro design
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 }}>
            {designs.map((d: CanvasDesign) => (
              <DesignCard key={d.id} design={d} onClick={() => router.push(`/canvas/editor?id=${d.id}`)} />
            ))}
          </div>
        )}
      </div>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

function DesignCard({ design, onClick }: { design: CanvasDesign; onClick: () => void }) {
  const [h, setH] = useState(false);
  const date = new Date(design.updatedAt);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: '#111113', border: `1px solid ${h ? '#E85D3050' : '#1C1C1F'}`,
        borderRadius: 6, padding: 0, cursor: 'pointer', transition: 'all 0.25s',
        overflow: 'hidden', textAlign: 'left',
      }}
    >
      <div style={{
        height: 96, background: '#0A0A0C', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {design.thumbnailUrl ? (
          <img src={design.thumbnailUrl} alt="" style={{ maxHeight: 80, maxWidth: '90%', objectFit: 'contain' }} />
        ) : (
          <div style={{
            width: 52, height: 52, background: '#111113', borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 3,
              background: 'radial-gradient(circle, #E85D3040, transparent)',
            }} />
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <p style={{
          fontSize: 11, fontWeight: 600, color: '#E0DDD8',
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {design.name}
        </p>
        <p style={{
          fontSize: 9, color: '#3A3A3F',
          fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
        }}>
          {design.format} &middot; {dateStr}
        </p>
      </div>
    </button>
  );
}
