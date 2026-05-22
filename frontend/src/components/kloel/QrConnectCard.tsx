'use client';

import { kloelT } from '@/lib/i18n/t';
import { RotateCcw, Smartphone } from 'lucide-react';
import Image from 'next/image';
import { KloelMushroomVisual } from './KloelBrand';
import { colors } from '@/lib/design-tokens';

interface QrConnectCardProps {
  qrCode: string | null;
  connecting: boolean;
  loading: boolean;
  error: string | null;
  statusMessage: string | null;
  onConnect: () => void;
  onReset: () => void;
}

export function QrConnectCard({
  qrCode,
  connecting,
  loading,
  error,
  statusMessage,
  onConnect,
  onReset,
}: QrConnectCardProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-md bg-emerald-50 p-2">
            <Smartphone className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {kloelT(`Escaneie seu QR Code`)}
            </div>
            <div className="text-xs text-slate-500">
              {kloelT(`Toda a conexão do WhatsApp acontece neste painel.`)}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-slate-50 px-4 py-4">
          {qrCode ? (
            <Image
              src={qrCode}
              alt="QR Code do WhatsApp"
              width={224}
              height={224}
              unoptimized
              className="mx-auto h-56 w-56 rounded-md bg-white p-3 shadow-sm"
            />
          ) : (
            <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed border-[colors.border.default] bg-[colors.background.elevated] text-center">
              <div className="mb-3">
                <KloelMushroomVisual
                  size={44}
                  traceColor={colors.text.silver}
                  animated={connecting}
                  spores={connecting ? 'animated' : 'none'}
                />
              </div>
              <div className="text-sm font-medium text-slate-700">
                {connecting ? 'Gerando QR Code...' : 'Nenhum QR Code disponível'}
              </div>
              <div className="mt-1 max-w-[180px] text-xs leading-relaxed text-slate-500">
                {kloelT(`Inicie a sessão para escanear pelo celular.`)}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2 text-sm text-slate-500">
          <div>{kloelT(`1. Abra o WhatsApp no celular.`)}</div>
          <div>{kloelT(`2. Vá em aparelhos conectados.`)}</div>
          <div>{kloelT(`3. Escaneie o QR Code deste painel.`)}</div>
        </div>

        {statusMessage ? (
          <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConnect}
            disabled={loading}
            className="flex-1 rounded-md bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {connecting ? 'Aguardando leitura' : 'Conectar WhatsApp'}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
