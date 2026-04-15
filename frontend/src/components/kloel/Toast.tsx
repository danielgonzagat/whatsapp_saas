'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

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
// COLORS — Monitor palette
// ============================================

const TOAST_COLORS: Record<ToastType, string> = {
  success: '#E0DDD8',
  error: '#E85D30',
  info: '#6E6E73',
  warning: '#6E6E73',
};

const TOAST_LABELS: Record<ToastType, string> = {
  success: 'Sucesso',
  error: 'Erro',
  info: 'Info',
  warning: 'Atencao',
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
        background: 'var(--app-bg-card)',
        border: `1px solid #222226`,
        borderRadius: 6,
        padding: '14px 18px',
        minWidth: 280,
        maxWidth: 400,
        boxShadow: 'none',
        animation: toast.exiting
          ? 'toastFadeOut 150ms ease forwards'
          : 'toastFadeIn 150ms ease forwards',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
      onClick={() => onRemove(toast.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      {/* Color indicator dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          flexShrink: 0,
          marginTop: 5,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'Sora', sans-serif",
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
            fontFamily: "'Sora', sans-serif",
            fontSize: 13,
            color: 'var(--app-text-primary)',
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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 150);
    timersRef.current.push(t);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

      // Auto-dismiss after 3s
      const t = setTimeout(() => {
        removeToast(id);
      }, 3000);
      timersRef.current.push(t);
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
        @keyframes toastFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
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
            transform: translateY(-8px);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
