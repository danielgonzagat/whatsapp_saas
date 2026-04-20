'use client';

import { findCapabilityByTitle, getCapabilityHref } from '@/lib/frontend-capabilities';
import { type MachineShellKey, getMachineRail } from '@/lib/machine-rails';
import { useRouter } from 'next/navigation';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export function MachineRail({
  shell,
  compact = false,
}: {
  shell: MachineShellKey;
  compact?: boolean;
}) {
  const router = useRouter();
  const rail = getMachineRail(shell);
  const capabilityCards = rail.capabilities
    .map((title) => findCapabilityByTitle(title))
    .filter((capability): capability is NonNullable<typeof capability> => Boolean(capability));

  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 8,
        padding: compact ? '16px 18px' : '20px 22px',
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: 'var(--app-text-secondary)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {rail.label}
      </div>

      <div
        style={{
          fontFamily: SORA,
          fontSize: compact ? 16 : 18,
          lineHeight: 1.25,
          color: 'var(--app-text-primary)',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {rail.title}
      </div>

      <div
        style={{
          fontFamily: SORA,
          fontSize: 12,
          lineHeight: 1.65,
          color: 'var(--app-text-secondary)',
          marginBottom: 16,
          maxWidth: 780,
        }}
      >
        {rail.summary}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact
            ? 'repeat(auto-fit, minmax(180px, 1fr))'
            : 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          marginBottom: capabilityCards.length > 0 ? 16 : 0,
        }}
      >
        {rail.links.map((link) => (
          <button
            type="button"
            key={link.href}
            onClick={() => router.push(link.href)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 6,
              border: '1px solid var(--app-border-primary)',
              background: 'var(--app-bg-primary)',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 4,
              }}
            >
              {link.label}
            </div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 11,
                lineHeight: 1.55,
                color: 'var(--app-text-secondary)',
              }}
            >
              {link.hint}
            </div>
          </button>
        ))}
      </div>

      {capabilityCards.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact
              ? 'repeat(auto-fit, minmax(150px, 1fr))'
              : 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
          }}
        >
          {capabilityCards.map((capability) => {
            const href = getCapabilityHref(capability);
            return (
              <button
                type="button"
                key={capability.title}
                onClick={() => {
                  if (href) {
                    router.push(href);
                  }
                }}
                disabled={!href}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--app-border-primary)',
                  background: 'rgba(232,93,48,0.04)',
                  cursor: href ? 'pointer' : 'default',
                  opacity: href ? 1 : 0.7,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{capability.icon}</span>
                  <span
                    style={{
                      fontFamily: SORA,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--app-text-primary)',
                    }}
                  >
                    {capability.title}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: SORA,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: 'var(--app-text-secondary)',
                  }}
                >
                  {capability.desc}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MachineRail;
