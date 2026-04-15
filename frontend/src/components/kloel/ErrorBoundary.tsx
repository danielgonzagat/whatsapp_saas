'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: '100%',
            padding: 32,
          }}
        >
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid #E85D30',
              borderRadius: 6,
              padding: 40,
              maxWidth: 480,
              width: '100%',
              textAlign: 'center',
              boxShadow: 'none',
            }}
          >
            {/* Error icon */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                background: 'rgba(232, 93, 48, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#E85D30"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <h2
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                margin: '0 0 8px',
              }}
            >
              Algo deu errado
            </h2>

            <p
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 14,
                color: 'var(--app-text-secondary)',
                margin: '0 0 24px',
                lineHeight: 1.6,
              }}
            >
              {this.state.error?.message || 'Ocorreu um erro inesperado ao renderizar esta secao.'}
            </p>

            <button
              type="button"
              onClick={this.handleReset}
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--app-text-on-accent)',
                backgroundColor: '#E0DDD8',
                border: 'none',
                borderRadius: 6,
                padding: '10px 28px',
                cursor: 'pointer',
                transition: 'opacity 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '0.85';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '1';
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
