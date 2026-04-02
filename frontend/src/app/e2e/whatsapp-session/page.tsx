'use client';

import { useWhatsAppSession } from '@/hooks/useWhatsAppSession';

export default function E2EWhatsAppSessionPage() {
  const {
    connect,
    connecting,
    error,
    loading,
    qrCode,
    statusMessage,
  } = useWhatsAppSession({ enabled: true });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-8">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">E2E WhatsApp Session</h1>
        <p className="mt-2 text-sm text-slate-500">
          Harness leve para validar a renderização do QR Code.
        </p>

        <button
          onClick={connect}
          disabled={loading}
          className="mt-6 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {connecting ? 'Aguardando leitura' : 'Conectar WhatsApp'}
        </button>

        {statusMessage ? (
          <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-3xl bg-slate-50 p-4">
          {qrCode ? (
            <img
              src={qrCode}
              alt="QR Code E2E WhatsApp"
              className="mx-auto h-56 w-56 rounded-2xl bg-white p-3 shadow-sm"
            />
          ) : (
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
              Aguardando QR Code...
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
