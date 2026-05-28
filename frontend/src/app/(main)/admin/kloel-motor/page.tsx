'use client';

import { apiFetch } from '@/lib/api';
import { colors, typography, radius } from '@/lib/design-tokens';
import { useEffect, useState, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

interface MotorStatus {
  status: 'healthy' | 'degraded';
  provider: 'deepseek' | 'generic' | 'openai' | null;
  hasPrimaryKey: boolean;
  hasAnthropicFallback: boolean;
  notes: string[];
}

interface FullDiag {
  deploy?: { gitSha?: string; buildTimestamp?: string; nodeEnv?: string };
  database?: { connected: boolean; latencyMs: number };
}// ============================================
// DESIGN CONSTANTS
// ============================================

const MONO = typography.fontFamily.mono;
const SANS = typography.fontFamily.sans;
const TEXT = colors.text;
const BG = colors.background;
const BORDER = colors.border;
const SEMANTIC = colors.semantic;

const pageStyle: React.CSSProperties = {
  padding: '24px 32px',
  maxWidth: 720,
  fontFamily: SANS,
  color: TEXT.silver,
};

const titleStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: '1.2',
  marginBottom: 24,
  color: TEXT.silver,
};

const cardStyle: React.CSSProperties = {
  background: BG.elevated,
  border: `1px solid ${BORDER.void}`,
  borderRadius: radius.md,
  padding: '16px 20px',
  marginBottom: 12,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: TEXT.muted,
  letterSpacing: '0.01em',
};

const valueStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  fontFamily: MONO,
  color: TEXT.silver,
};

const notesListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '8px 0 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const noteItemStyle: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '1.5',
  color: TEXT.faint,
  padding: '8px 12px',
  background: BG.surface,
  borderRadius: radius.sm,
};

const loadingStyle: React.CSSProperties = {
  fontSize: '15px',
  color: TEXT.muted,
};

const errorStyle: React.CSSProperties = {
  fontSize: '15px',
  color: SEMANTIC.error,
};// ============================================
// HELPERS
// ============================================

function StatusBadge({ status }: { status: MotorStatus['status'] }) {
  const isHealthy = status === 'healthy';
  const bg = isHealthy ? SEMANTIC.successBg : SEMANTIC.errorBg;
  const fg = isHealthy ? SEMANTIC.successText : SEMANTIC.errorText;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: radius.sm,
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: MONO,
        letterSpacing: '0.02em',
        background: bg,
        color: fg,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: fg,
        }}
      />
      {isHealthy ? 'HEALTHY' : 'DEGRADED'}
    </span>
  );
}

function BoolDot({ value }: { value: boolean }) {
  const fg = value ? SEMANTIC.successText : SEMANTIC.errorSoft;
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: fg,
        marginRight: 8,
        verticalAlign: 'middle',
      }}
    />
  );
}// ============================================
// PAGE
// ============================================

export default function KloelMotorPage() {
  const [motor, setMotor] = useState<MotorStatus | null>(null);
  const [fullDiag, setFullDiag] = useState<FullDiag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [motorRes, fullRes] = await Promise.all([
        apiFetch<MotorStatus>('/diag/kloel-motor'),
        apiFetch<FullDiag>('/diag/full'),
      ]);
      if (motorRes.error) {
        setError(motorRes.error);
      } else {
        setMotor(motorRes.data ?? null);
      }
      if (!fullRes.error && fullRes.data) {
        setFullDiag(fullRes.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao buscar diagnostico do motor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchData();
    });
  }, [fetchData]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <h1 style={titleStyle}>Kloel Motor</h1>
        <p style={loadingStyle}>Carregando...</p>
      </div>
    );
  }

  if (error && !motor) {
    return (
      <div style={pageStyle}>
        <h1 style={titleStyle}>Kloel Motor</h1>
        <p style={errorStyle}>{error}</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>Kloel Motor</h1>

      <div style={cardStyle}>
        <div style={rowStyle}>
          <span style={labelStyle}>Status</span>
          {motor ? <StatusBadge status={motor.status} /> : <span style={valueStyle}>--</span>}
        </div>
        {motor && (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>Provider</span>
              <span style={valueStyle}>{motor.provider ?? 'none'}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Primary Key</span>
              <span style={valueStyle}>
                <BoolDot value={motor.hasPrimaryKey} />
                {motor.hasPrimaryKey ? 'yes' : 'no'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Anthropic Fallback</span>
              <span style={valueStyle}>
                <BoolDot value={motor.hasAnthropicFallback} />
                {motor.hasAnthropicFallback ? 'yes' : 'no'}
              </span>
            </div>
          </>
        )}
      </div>

      {motor && motor.notes.length > 0 && (
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Notes</div>
          <ul style={notesListStyle}>
            {motor.notes.map((note, i) => (
              <li key={i} style={noteItemStyle}>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fullDiag?.deploy && (
        <div style={cardStyle}>
          <div style={rowStyle}>
            <span style={labelStyle}>Git SHA</span>
            <span style={valueStyle}>{fullDiag.deploy.gitSha ?? '--'}</span>
          </div>
          {fullDiag.deploy.buildTimestamp && fullDiag.deploy.buildTimestamp !== 'unknown' && (
            <div style={rowStyle}>
              <span style={labelStyle}>Build</span>
              <span style={valueStyle}>{fullDiag.deploy.buildTimestamp}</span>
            </div>
          )}
          {fullDiag.deploy.nodeEnv && (
            <div style={rowStyle}>
              <span style={labelStyle}>Environment</span>
              <span style={valueStyle}>{fullDiag.deploy.nodeEnv}</span>
            </div>
          )}
          {fullDiag.database && (
            <div style={rowStyle}>
              <span style={labelStyle}>Database</span>
              <span style={valueStyle}>
                {fullDiag.database.connected
                  ? `connected (${fullDiag.database.latencyMs}ms)`
                  : 'disconnected'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
