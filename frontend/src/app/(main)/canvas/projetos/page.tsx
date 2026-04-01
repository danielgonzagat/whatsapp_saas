'use client';

import { useState } from 'react';
import NextImage from 'next/image';
import { useRouter } from 'next/navigation';
import { IC } from '@/components/canvas/CanvasIcons';
import { useCanvasDesigns, type CanvasDesign } from '@/hooks/useCanvasDesigns';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export default function CanvasProjetos() {
  const router = useRouter();
  const { designs, loading, deleteDesign } = useCanvasDesigns();
  const [search, setSearch] = useState('');

  const filtered = designs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', maxWidth: 1060, margin: '0 auto', animation: 'fu 0.4s ease' }}>
      {/* Search bar */}
      <div style={{ maxWidth: 580, margin: '0 auto 20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#111113', border: '1px solid #1C1C1F', borderRadius: 6, padding: '10px 16px',
        }}>
          {IC.search(16)}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar entre todos os projetos..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#E0DDD8', fontSize: 13, fontFamily: S,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {['Tipo', 'Categoria', 'Data'].map(f => (
            <button key={f} style={{
              padding: '5px 12px', background: 'none', border: '1px solid #1C1C1F',
              borderRadius: 4, color: '#6E6E73', fontSize: 11, fontFamily: S, cursor: 'pointer',
            }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Design list */}
      {loading ? (
        <div style={{
          background: '#111113', border: '1px solid #1C1C1F', borderRadius: 6,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: '#3A3A3F', fontFamily: S }}>Carregando...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: '#111113', border: '1px dashed #1C1C1F', borderRadius: 6,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: '#3A3A3F', fontFamily: S }}>
            {search ? 'Nenhum projeto encontrado' : 'Nenhum projeto salvo ainda'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 }}>
          {filtered.map(d => (
            <ProjectCard
              key={d.id}
              design={d}
              onClick={() => router.push(`/canvas/editor?id=${d.id}`)}
              onDelete={() => deleteDesign(d.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ design, onClick, onDelete }: {
  design: CanvasDesign; onClick: () => void; onDelete: () => void;
}) {
  const [h, setH] = useState(false);
  const date = new Date(design.updatedAt);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: '#111113', border: `1px solid ${h ? '#E85D3050' : '#1C1C1F'}`,
        borderRadius: 6, overflow: 'hidden', textAlign: 'left',
        transition: 'all 0.25s', position: 'relative', cursor: 'pointer',
      }}
    >
      <div onClick={onClick} style={{
        height: 96, background: '#0A0A0C', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {design.thumbnailUrl ? (
          <NextImage src={design.thumbnailUrl} alt="Design thumbnail" width={80} height={80} style={{ maxHeight: 80, maxWidth: '90%', objectFit: 'contain' }} unoptimized />
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
      <div onClick={onClick} style={{ padding: '8px 10px' }}>
        <p style={{
          fontSize: 11, fontWeight: 600, color: '#E0DDD8', fontFamily: S,
          marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {design.name}
        </p>
        <p style={{ fontSize: 9, color: '#3A3A3F', fontFamily: M }}>
          {design.format} &middot; {dateStr}
        </p>
      </div>
      {h && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            position: 'absolute', top: 6, right: 6,
            background: '#111113', border: '1px solid #1C1C1F', borderRadius: 4,
            padding: 4, cursor: 'pointer', color: '#6E6E73', display: 'flex',
          }}
        >
          {IC.trash(12)}
        </button>
      )}
    </div>
  );
}
