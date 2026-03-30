'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { EditorErrorBoundary } from '@/components/canvas/EditorErrorBoundary';

const CanvasEditor = dynamic(
  () => import('@/components/canvas/CanvasEditor'),
  { ssr: false }
);

function EditorSkeleton() {
  return (
    <div style={{
      height: '100vh', background: '#0A0A0C', display: 'flex',
      flexDirection: 'column', fontFamily: "var(--font-sora), 'Sora', sans-serif",
    }}>
      {/* Top bar skeleton */}
      <div style={{
        height: 42, background: '#111113', borderBottom: '1px solid #1C1C1F',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
      }}>
        <div style={{ width: 16, height: 16, borderRadius: 3, background: '#1C1C1F' }} />
        <div style={{ width: 50, height: 12, borderRadius: 3, background: '#1C1C1F' }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 100, height: 24, borderRadius: 4, background: '#E85D30', opacity: 0.3 }} />
      </div>

      {/* Body skeleton */}
      <div style={{ flex: 1, display: 'flex' }}>
        {/* Sidebar icon rail skeleton */}
        <div style={{ width: 56, borderRight: '1px solid #1C1C1F', padding: '8px 0' }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{
              width: 36, height: 36, margin: '4px auto', borderRadius: 6, background: '#1C1C1F',
            }} />
          ))}
        </div>
        {/* Sidebar panel skeleton */}
        <div style={{ width: 280, borderRight: '1px solid #1C1C1F', padding: 16 }}>
          <div style={{ width: 80, height: 10, borderRadius: 3, background: '#1C1C1F', marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 80, borderRadius: 6, background: '#111113' }} />
            ))}
          </div>
        </div>
        {/* Canvas area skeleton */}
        <div style={{
          flex: 1, background: '#19191C', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 300, height: 300, background: '#fff', borderRadius: 2, opacity: 0.05,
            boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
          }} />
        </div>
      </div>

      {/* Bottom bar skeleton */}
      <div style={{
        height: 40, borderTop: '1px solid #1C1C1F',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        background: '#0A0A0C',
      }}>
        <div style={{ width: 40, height: 8, borderRadius: 3, background: '#1C1C1F' }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 30, height: 8, borderRadius: 3, background: '#1C1C1F' }} />
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <EditorErrorBoundary>
      <Suspense fallback={<EditorSkeleton />}>
        <CanvasEditor />
      </Suspense>
    </EditorErrorBoundary>
  );
}
