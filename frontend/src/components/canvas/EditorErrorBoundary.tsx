'use client';
import { Component, type ReactNode } from 'react';

interface State {
  hasError: boolean;
  error: string;
}

export class EditorErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100vh',
            background: '#0A0A0C',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Sora', sans-serif",
            color: '#E0DDD8',
            gap: 16,
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600 }}>O editor encontrou um erro</p>
          <p style={{ fontSize: 12, color: '#6E6E73', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error}
          </p>
          <button
            type="button"
            onClick={() => (window.location.href = '/canvas/inicio')}
            style={{
              padding: '8px 20px',
              background: '#E85D30',
              border: 'none',
              borderRadius: 4,
              color: '#0A0A0C',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Voltar ao Canvas
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
