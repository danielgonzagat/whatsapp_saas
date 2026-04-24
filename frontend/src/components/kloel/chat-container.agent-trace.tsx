'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { KloelMushroomVisual } from './KloelBrand';
import type { AgentTraceEntry } from './chat-container.types';

const SEPARATOR_G_RE = /[_-]+/g;
const WHITESPACE_G_RE = /\s+/g;
const WORD_BOUNDARY_RE = /\b\w/g;
const SENTENCE_END_RE = /[.!?]/;

function formatAgentPhaseLabel(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'streaming_token') return '';
  return raw
    .replace(SEPARATOR_G_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ')
    .trim()
    .replace(WORD_BOUNDARY_RE, (char) => char.toUpperCase());
}

function traceLabel(entry: Pick<AgentTraceEntry, 'phase' | 'type' | 'message'>): string {
  return (
    formatAgentPhaseLabel(entry.phase) ||
    String(entry.message || '')
      .split(SENTENCE_END_RE)[0]
      .trim()
      .slice(0, 48) ||
    formatAgentPhaseLabel(entry.type) ||
    'Atividade'
  );
}

interface ReasoningTraceBarProps {
  latestThought: string;
  entries: AgentTraceEntry[];
  expanded: boolean;
  onToggle: () => void;
  isThinking: boolean;
}

export function ReasoningTraceBar({
  latestThought,
  entries,
  expanded,
  onToggle,
  isThinking,
}: ReasoningTraceBarProps) {
  if (!latestThought && entries.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        borderRadius: UI.radiusMd,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        background: `color-mix(in srgb, ${KLOEL_THEME.bgCard} 85%, transparent)`,
        padding: 16,
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: KLOEL_THEME.textSecondary,
            }}
          >
            <KloelMushroomVisual
              size={18}
              traceColor={KLOEL_THEME.textPrimary}
              animated={isThinking}
              spores={isThinking ? 'animated' : 'none'}
              ariaHidden
            />
            <span>{kloelT(`Rastro interpretável ao vivo`)}</span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.65,
              color: KLOEL_THEME.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {latestThought || 'Aguardando novos pensamentos e ações do agente.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            flexShrink: 0,
            borderRadius: UI.radiusMd,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            padding: '8px 12px',
            background: 'transparent',
            color: KLOEL_THEME.textSecondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Ocultar' : 'Expandir'}
        </button>
      </div>

      {expanded ? (
        <div
          style={{
            marginTop: 16,
            maxHeight: 256,
            overflowY: 'auto',
            borderRadius: UI.radiusMd,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgPrimary,
            padding: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.length > 0 ? (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    borderRadius: UI.radiusMd,
                    background: KLOEL_THEME.bgCard,
                    border: `1px solid ${KLOEL_THEME.borderSubtle}`,
                    padding: '10px 12px',
                  }}
                >
                  <div
                    style={{
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: KLOEL_THEME.textSecondary,
                    }}
                  >
                    <span>{traceLabel(entry)}</span>
                    <span>
                      {entry.timestamp.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.65,
                      color: KLOEL_THEME.textSecondary,
                    }}
                  >
                    {entry.message}
                  </p>
                </div>
              ))
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: KLOEL_THEME.textSecondary }}>
                {kloelT(`Nenhum evento do agente foi registrado hoje.`)}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
