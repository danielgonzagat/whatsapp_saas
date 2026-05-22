'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { Component, type ReactNode } from 'react';

interface State {
  hasError: boolean;
  error: string;
}

/** Editor error boundary. */
export class EditorErrorBoundary extends Component<{ children: ReactNode }, State> {
  /** State property. */
  state: State = { hasError: false, error: '' };
  /** Get derived state from error. */
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  /** Render. */
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100vh',
            background: colors.background.void,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Sora', sans-serif",
            color: colors.text.silver,
            gap: 16,
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600 }}>{kloelT(`O editor encontrou um erro`)}</p>
          <p style={{ fontSize: 12, color: colors.text.muted, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error}
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/canvas/inicio';
            }}
            style={{
              padding: '8px 20px',
              background: colors.ember.primary,
              border: 'none',
              borderRadius: 4,
              color: colors.background.void,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Voltar ao Canvas`)}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
