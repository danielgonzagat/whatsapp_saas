'use client';

import React, { Component, type ReactNode, type ErrorInfo } from 'react';

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
              background: '#0A0A14',
              border: '1px solid #E05252',
              borderRadius: 16,
              padding: 40,
              maxWidth: 480,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 0 40px rgba(224, 82, 82, 0.1), 0 4px 24px rgba(0, 0, 0, 0.4)',
            }}
          >
            {/* Error icon */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(224, 82, 82, 0.12)',
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
                stroke="#E05252"
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
                fontFamily: "'Outfit', sans-serif",
                fontSize: 20,
                fontWeight: 600,
                color: '#E8E6F0',
                margin: '0 0 8px',
              }}
            >
              Algo deu errado
            </h2>

            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                color: '#9896A8',
                margin: '0 0 24px',
                lineHeight: 1.6,
              }}
            >
              {this.state.error?.message || 'Ocorreu um erro inesperado ao renderizar esta seção.'}
            </p>

            <button
              onClick={this.handleReset}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: '#FFFFFF',
                backgroundColor: '#E05252',
                border: 'none',
                borderRadius: 10,
                padding: '10px 28px',
                cursor: 'pointer',
                transition: 'opacity 150ms ease',
              }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = '0.85'; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = '1'; }}
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
