'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

// ============================================
// TYPES
// ============================================

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

// ============================================
// COLORS
// ============================================

const TOAST_COLORS: Record<ToastType, string> = {
  success: '#2DD4A0',
  error: '#E05252',
  info: '#4E7AE0',
  warning: '#E0A84E',
};

const TOAST_LABELS: Record<ToastType, string> = {
  success: 'Sucesso',
  error: 'Erro',
  info: 'Info',
  warning: 'Atenção',
};

// ============================================
// CONTEXT
// ============================================

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// ============================================
// TOAST ITEM
// ============================================

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const color = TOAST_COLORS[toast.type];
  const label = TOAST_LABELS[toast.type];

  return (
    <div
      style={{
        background: '#0A0A14',
        border: `1px solid ${color}`,
        borderRadius: 12,
        padding: '14px 18px',
        minWidth: 280,
        maxWidth: 400,
        boxShadow: `0 4px 24px rgba(0, 0, 0, 0.4), 0 0 20px ${color}15`,
        animation: toast.exiting
          ? 'toastFadeOut 300ms ease forwards'
          : 'toastFadeSlideUp 300ms ease forwards',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
      onClick={() => onRemove(toast.id)}
    >
      {/* Color indicator dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
          marginTop: 5,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: '#E8E6F0',
            margin: '4px 0 0',
            lineHeight: 1.4,
          }}
        >
          {toast.message}
        </p>
      </div>
    </div>
  );
}

// ============================================
// PROVIDER + CONTAINER
// ============================================

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

      // Auto-dismiss after 3s
      setTimeout(() => {
        removeToast(id);
      }, 3000);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container — fixed top-right */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          {toasts.map((toast) => (
            <div key={toast.id} style={{ pointerEvents: 'auto' }}>
              <ToastItem toast={toast} onRemove={removeToast} />
            </div>
          ))}
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes toastFadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes toastFadeOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-12px);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
