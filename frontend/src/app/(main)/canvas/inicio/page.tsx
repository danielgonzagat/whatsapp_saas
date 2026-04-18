'use client';

// PULSE:OK — AI generate POST navigates to editor on success; deleteDesign uses useCanvasDesigns hook which calls mutate internally.

import { IC } from '@/components/canvas/CanvasIcons';
import { CreateModal } from '@/components/canvas/CreateModal';
import { FormatPills } from '@/components/canvas/FormatPills';
import { type CanvasDesign, useCanvasDesigns } from '@/hooks/useCanvasDesigns';
import { apiFetch } from '@/lib/api';
import NextImage from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { mutate } from 'swr';

const S = "var(--font-sora), 'Sora', sans-serif";
const _M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

const SKELETON_SLOTS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'] as const;

function RecentSkeletonGrid() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))',
        gap: 12,
      }}
    >
      {SKELETON_SLOTS.map((slot) => (
        <div
          key={`canvas-skeleton-${slot}`}
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid #1C1C1F',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 112,
              background: 'linear-gradient(135deg, #161618 0%, #1C1C1F 50%, #161618 100%)',
            }}
          />
          <div style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
            <div style={{ width: '70%', height: 10, borderRadius: 999, background: '#1C1C1F' }} />
            <div
              style={{
                width: '42%',
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

export default function CanvasInicio() {
  const router = useRouter();
  const { designs, loading, deleteDesign } = useCanvasDesigns();
  const [ai, setAi] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [mt, setMt] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMt(true), 30);
    return () => clearTimeout(t);
  }, []);

  const handleAiSubmit = async () => {
    if (!ai.trim()) return;
    try {
      const res: any = await apiFetch('/canvas/generate', {
        method: 'POST',
        body: { prompt: ai, width: 1080, height: 1080 },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/canvas'));
      if (res?.data?.imageUrl) {
        router.push(
          `/canvas/editor?w=1080&h=1080&name=${encodeURIComponent(ai.slice(0, 40))}&aiImage=${encodeURIComponent(res.data.imageUrl)}`,
        );
        return;
      }
    } catch {}
    router.push(`/canvas/editor?w=1080&h=1080&name=${encodeURIComponent(ai.slice(0, 40))}`);
  };

  return (
    <div
      style={{
        padding: '0 24px',
        maxWidth: 1060,
        margin: '0 auto',
        animation: mt ? 'fu 0.4s ease' : 'none',
      }}
    >
      {/* AI Conversation Bar */}
      <div style={{ maxWidth: 640, margin: '32px auto 24px' }}>
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
            value={ai}
            onChange={(e) => setAi(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
            placeholder="Descreva o criativo que voce quer criar..."
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
          {ai && (
            <button
              type="button"
              onClick={handleAiSubmit}
              style={{
                padding: '5px 12px',
                background: '#E85D30',
                border: 'none',
                borderRadius: 4,
                color: 'var(--app-text-on-accent)',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: S,
                cursor: 'pointer',
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
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: S,
            marginBottom: 14,
          }}
        >
          Recentes
        </h2>
        {loading ? (
          <RecentSkeletonGrid />
        ) : designs.length === 0 ? (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px dashed #1C1C1F',
              borderRadius: 6,
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: 'var(--app-text-tertiary)',
                fontFamily: S,
                marginBottom: 8,
              }}
            >
              Nenhum design criado ainda
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              style={{
                padding: '8px 20px',
                background: '#E85D30',
                border: 'none',
                borderRadius: 4,
                color: 'var(--app-text-on-accent)',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: S,
                cursor: 'pointer',
              }}
            >
              Criar primeiro design
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))',
              gap: 12,
            }}
          >
            {designs.map((d: CanvasDesign) => (
              <DesignCard
                key={d.id}
                design={d}
                onClick={() => router.push(`/canvas/editor?id=${d.id}`)}
                onDelete={() => {
                  if (confirm(`Excluir "${d.name}"?`)) deleteDesign(d.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

function DesignCard({
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
  const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: 'var(--app-bg-card)',
        border: `1px solid ${h ? '#E85D3050' : '#1C1C1F'}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.25s',
        overflow: 'hidden',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      {/* Delete button — shows on hover */}
      {h && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Excluir design"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            zIndex: 2,
            width: 22,
            height: 22,
            borderRadius: 4,
            background: 'var(--app-bg-primary)',
            border: '1px solid #2A2A2E',
            color: '#FF6B6B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          <svg
            aria-hidden="true"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label="Abrir template"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        <div
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
        <div style={{ padding: '8px 10px' }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {design.name}
          </p>
          <p
            style={{
              fontSize: 9,
              color: 'var(--app-text-tertiary)',
              fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
            }}
          >
            {design.format} &middot; {dateStr}
          </p>
        </div>
      </div>
    </div>
  );
}
