'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function EmBreveContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tool = params.get('tool') || 'Ferramenta';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, background: '#0A0A0C', padding: 40, minHeight: '60vh' }}>
      <div style={{ width: 48, height: 48, borderRadius: 6, background: '#111113', border: '1px solid #222226', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#E85D30" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 600, color: '#E0DDD8', marginBottom: 8 }}>{tool}</h2>
      <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6E6E73', textAlign: 'center', maxWidth: 400, lineHeight: 1.6, marginBottom: 32 }}>
        Esta ferramenta esta em desenvolvimento e sera lancada em breve. Estamos trabalhando para trazer a melhor experiencia possivel.
      </p>
      <button onClick={() => router.back()} style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600, padding: '10px 24px', borderRadius: 6, border: '1px solid #222226', background: 'transparent', color: '#E0DDD8', cursor: 'pointer' }}>
        Voltar
      </button>
    </div>
  );
}

export default function EmBrevePage() {
  return (
    <Suspense fallback={<div style={{ flex: 1, background: '#0A0A0C' }} />}>
      <EmBreveContent />
    </Suspense>
  );
}
