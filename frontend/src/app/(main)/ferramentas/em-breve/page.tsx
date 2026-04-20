'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  CAPABILITY_CATEGORY_META,
  findCapabilityByTitle,
  getCapabilityHref,
  getCapabilityRoadmapActions,
  getRelatedActiveCapabilities,
} from '@/lib/frontend-capabilities';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function EmBreveContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tool = params.get('tool') || 'Ferramenta';
  const capability = findCapabilityByTitle(tool);
  const categoryMeta = capability ? CAPABILITY_CATEGORY_META[capability.category] : null;
  const alternatives = capability ? getRelatedActiveCapabilities(capability, 4) : [];
  const roadmapActions = getCapabilityRoadmapActions(capability);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        background: 'var(--app-bg-primary)',
        padding: 40,
        minHeight: '60vh',
      }}
    >
      <div style={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 6,
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#E85D30"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          {categoryMeta ? (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: categoryMeta.color,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {categoryMeta.title}
            </span>
          ) : null}
          <span
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              color: '#E85D30',
              background: 'rgba(232,93,48,0.1)',
              padding: '3px 8px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            
            {kloelT(`Planejado`)}
          </span>
        </div>

        <h2
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 26,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 10,
          }}
        >
          {tool}
        </h2>
        <p
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 14,
            color: 'var(--app-text-secondary)',
            maxWidth: 720,
            lineHeight: 1.7,
            marginBottom: 24,
          }}
        >
          {capability?.desc ||
            'Esta capacidade faz parte do roadmap do Kloel, mas ainda nao foi publicada como superficie operacional.'}
        </p>

        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '18px 20px',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              marginBottom: 8,
            }}
          >
            
            {kloelT(`O que isso significa agora`)}
          </div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.7,
            }}
          >
            {capability?.roadmapNote ||
              'Essa capacidade continua no mapa do produto, mas ainda nao deve ser tratada como operacao pronta dentro do app. Enquanto ela nao vira shell oficial, o Kloel te leva para os fluxos ativos mais proximos para manter a operacao andando.'}
          </div>
        </div>

        {roadmapActions.length > 0 ? (
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              
              {kloelT(`Fluxos publicados para operar agora`)}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {roadmapActions.map((action) => (
                <button
                  type="button"
                  key={`${tool}-${action.href}`}
                  onClick={() => router.push(action.href)}
                  style={{
                    textAlign: 'left',
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: '16px 18px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--app-text-primary)',
                      marginBottom: 8,
                    }}
                  >
                    {action.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 11,
                      color: 'var(--app-text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {action.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {alternatives.length > 0 ? (
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              
              {kloelT(`O que ja pode usar agora`)}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {alternatives.map((item) => (
                <button
                  type="button"
                  key={item.title}
                  onClick={() => {
                    const href = getCapabilityHref(item);
                    if (href) {
                      router.push(href);
                    }
                  }}
                  style={{
                    textAlign: 'left',
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: '16px 18px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span
                      style={{
                        fontFamily: "'Sora', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--app-text-primary)',
                      }}
                    >
                      {item.title}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 11,
                      color: 'var(--app-text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => router.push('/ferramentas/ver-todas')}
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 18px',
              borderRadius: 6,
              border: '1px solid var(--app-border-primary)',
              background: 'var(--app-bg-card)',
              color: 'var(--app-text-primary)',
              cursor: 'pointer',
            }}
          >
            
            {kloelT(`Ver catalogo completo`)}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 18px',
              borderRadius: 6,
              border: '1px solid var(--app-border-primary)',
              background: 'transparent',
              color: 'var(--app-text-primary)',
              cursor: 'pointer',
            }}
          >
            
            {kloelT(`Voltar`)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Em breve page. */
export default function EmBrevePage() {
  return (
    <Suspense fallback={<div style={{ flex: 1, background: 'var(--app-bg-primary)' }} />}>
      <EmBreveContent />
    </Suspense>
  );
}
