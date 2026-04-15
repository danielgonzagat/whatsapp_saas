'use client';

import { IC } from '@/components/canvas/CanvasIcons';
import { type CanvasDesign, useCanvasDesigns } from '@/hooks/useCanvasDesigns';
import NextImage from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

function ProjectSkeletonGrid() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))',
        gap: 12,
      }}
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid #1C1C1F',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 96,
              background: 'linear-gradient(135deg, #161618 0%, #1C1C1F 50%, #161618 100%)',
            }}
          />
          <div style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
            <div style={{ width: '74%', height: 10, borderRadius: 999, background: '#1C1C1F' }} />
            <div
              style={{
                width: '46%',
                height: 9,
                borderRadius: 999,
                background: 'var(--app-bg-secondary)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CanvasProjetos() {
  const router = useRouter();
  const { designs, loading, deleteDesign } = useCanvasDesigns();
  const [search, setSearch] = useState('');

  const filtered = designs.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ padding: '24px', maxWidth: 1060, margin: '0 auto', animation: 'fu 0.4s ease' }}>
      {/* Search bar */}
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
          {IC.search(16)}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar entre todos os projetos..."
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
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {['Tipo', 'Categoria', 'Data'].map((f) => (
            <button
              type="button"
              key={f}
              style={{
                padding: '5px 12px',
                background: 'none',
                border: '1px solid #1C1C1F',
                borderRadius: 4,
                color: 'var(--app-text-secondary)',
                fontSize: 11,
                fontFamily: S,
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Design list */}
      {loading ? (
        <ProjectSkeletonGrid />
      ) : filtered.length === 0 ? (
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px dashed #1C1C1F',
            borderRadius: 6,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--app-text-tertiary)', fontFamily: S }}>
            {search ? 'Nenhum projeto encontrado' : 'Nenhum projeto salvo ainda'}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))',
            gap: 12,
          }}
        >
          {filtered.map((d) => (
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

function ProjectCard({
  design,
  onClick,
  onDelete,
}: {
  design: CanvasDesign;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [h, setH] = useState(false);
  const date = new Date(design.updatedAt);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: 'var(--app-bg-card)',
        border: `1px solid ${h ? '#E85D3050' : '#1C1C1F'}`,
        borderRadius: 6,
        overflow: 'hidden',
        textAlign: 'left',
        transition: 'all 0.25s',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={onClick}
        style={{
          height: 96,
          background: 'var(--app-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {design.thumbnailUrl ? (
          <NextImage
            src={design.thumbnailUrl}
            alt="Design thumbnail"
            width={80}
            height={80}
            style={{ maxHeight: 80, maxWidth: '90%', objectFit: 'contain' }}
            unoptimized
          />
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              background: 'var(--app-bg-card)',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 3,
                background: 'radial-gradient(circle, #E85D3040, transparent)',
              }}
            />
          </div>
        )}
      </div>
      <div onClick={onClick} style={{ padding: '8px 10px' }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: S,
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {design.name}
        </p>
        <p style={{ fontSize: 9, color: 'var(--app-text-tertiary)', fontFamily: M }}>
          {design.format} &middot; {dateStr}
        </p>
      </div>
      {h && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            background: 'var(--app-bg-card)',
            border: '1px solid #1C1C1F',
            borderRadius: 4,
            padding: 4,
            cursor: 'pointer',
            color: 'var(--app-text-secondary)',
            display: 'flex',
          }}
        >
          {IC.trash(12)}
        </button>
      )}
    </div>
  );
}
