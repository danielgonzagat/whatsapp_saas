'use client';

import { useState } from 'react';
import { kloelT } from '@/lib/i18n/t';

interface WhatsAppSessionHarnessProps {
  mode: 'session' | 'console';
}

/** Whats app session harness. */
export function WhatsAppSessionHarness({ mode }: WhatsAppSessionHarnessProps) {
  const [drawerOpen, setDrawerOpen] = useState(mode === 'session');
  const [connecting, setConnecting] = useState(false);

  if (mode === 'session') {
    return (
      <main className="min-h-screen bg-black px-6 py-12 text-white">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 rounded border border-white/10 bg-white/5 p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">{kloelT('E2E Harness')}</p>
          <h1 className="text-2xl font-semibold">{kloelT('WhatsApp session harness')}</h1>
          <p className="text-sm text-white/70">
            {kloelT('Dedicated route used by Playwright to validate the Meta embedded-signup fallback without rendering a QR image.')}
          </p>
          <button
            type="button"
            className="w-fit rounded border border-amber-500 bg-amber-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setConnecting(true)}
          >
            {kloelT('Conectar WhatsApp')}
          </button>
          {connecting ? (
            <div className="rounded border border-white/10 bg-black/30 p-4">
              <p className="text-sm font-medium">{kloelT('Aguardando leitura')}</p>
              <p className="mt-2 text-sm text-white/70">{kloelT('Aguardando QR Code...')}</p>
              <p className="mt-2 text-sm text-white/70">
                {kloelT('Use o fluxo guiado para concluir a conexao.')}
              </p>
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded border border-white/10 bg-white/5 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">{kloelT('E2E Harness')}</p>
        <h1 className="text-2xl font-semibold">{kloelT('WhatsApp console harness')}</h1>
        <p className="text-sm text-white/70">
          {kloelT('Drawer-style WhatsApp surface used by Playwright to validate the current QR guidance contract.')}
        </p>
        <button
          type="button"
          className="w-fit rounded border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white"
          onClick={() => setDrawerOpen(true)}
        >
          {kloelT('QR Code')}
        </button>
        {drawerOpen ? (
          <section className="rounded border border-white/10 bg-black/30 p-4">
            <p className="text-sm font-medium">{kloelT('Escaneie seu QR Code')}</p>
            <p className="mt-2 text-sm text-white/70">
              {kloelT('Use o fluxo guiado para conectar sua conta sem expor um QR no DOM.')}
            </p>
            <button
              type="button"
              className="mt-4 w-fit rounded border border-amber-500 bg-amber-600 px-4 py-2 text-sm font-medium text-white"
              onClick={() => setConnecting(true)}
            >
              {kloelT('Conectar WhatsApp')}
            </button>
            {connecting ? <p className="mt-4 text-sm text-white/70">{kloelT('Gerando QR Code...')}</p> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
