'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { secureRandomFloat } from '@/lib/secure-random';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const E = 'UI.accent';
const G = 'UI.success';
const S = KLOEL_THEME.textSecondary;
const F = "'Sora', system-ui, sans-serif";
const M = "'JetBrains Mono', monospace";

/** Qr code pane. */
export function QRCodePane({
  qrCode,
  progress,
  connected,
  loading,
  onRefresh,
}: {
  qrCode: string;
  progress: number;
  connected: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [dots, setDots] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    const generated: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < 25; y += 1) {
      for (let x = 0; x < 25; x += 1) {
        if (
          secureRandomFloat() > 0.45 ||
          (x < 7 && y < 7) ||
          (x > 17 && y < 7) ||
          (x < 7 && y > 17)
        ) {
          generated.push({ x, y });
        }
      }
    }
    setDots(generated);
  }, []);

  const showGeneratingOverlay = !qrCode && (loading || progress > 0) && !connected;
  const showConnectedOverlay = connected;
  const showOverlay = showGeneratingOverlay || showConnectedOverlay;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div
        style={{
          position: 'relative',
          background: UI.bg,
          borderRadius: UI.radiusMd,
          padding: 12,
          width: 220,
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {qrCode ? (
          <Image
            src={qrCode}
            alt="QR Code do WhatsApp"
            width={196}
            height={196}
            style={{ objectFit: 'contain' }}
            unoptimized
          />
        ) : (
          <svg viewBox="0 0 250 250" width="196" height="196" aria-hidden="true">
            {dots.map((dot) => (
              <rect
                key={`${dot.x}-${dot.y}`}
                x={dot.x * 10}
                y={dot.y * 10}
                width="8"
                height="8"
                rx="1"
                fill={KLOEL_THEME.bgPrimary}
                opacity={loading ? 0.3 : 1}
                style={{ transition: `opacity ${0.2 + secureRandomFloat() * 0.3}s` }}
              />
            ))}
          </svg>
        )}

        {showOverlay ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.85)',
              borderRadius: UI.radiusMd,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                {progress >= 100 ? 'OK' : 'WA'}
              </div>
              <div
                style={{
                  fontFamily: M,
                  fontSize: 14,
                  fontWeight: 700,
                  color: showConnectedOverlay ? G : E,
                }}
              >
                {showConnectedOverlay ? '100%' : `${Math.min(100, Math.round(progress))}%`}
              </div>
              <div style={{ fontSize: 11, color: S, marginTop: 4 }}>
                {showConnectedOverlay ? 'Conectado!' : 'Gerando QR Code...'}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {!connected ? (
        <>
          <p
            style={{
              fontSize: 13,
              color: S,
              textAlign: 'center',
              maxWidth: 300,
              lineHeight: 1.6,
            }}
          >
            {kloelT(`Abra o`)}{' '}
            <span style={{ color: UI.success, fontWeight: 600 }}>{kloelT(`WhatsApp`)}</span>{' '}
            {kloelT(`no celular →
            Menu (⋮) → Dispositivos conectados → Conectar dispositivo → Escaneie o QR Code`)}
          </p>
          {qrCode ? (
            <p
              style={{
                marginTop: -10,
                fontSize: 12,
                color: G,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {kloelT(`QR Code pronto para leitura.`)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            style={{
              background: UI.success,
              color: UI.bg,
              border: 'none',
              borderRadius: UI.radiusMd,
              padding: '12px 32px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: F,
            }}
          >
            {loading ? 'Atualizando...' : qrCode ? 'Gerar novo QR Code' : 'Atualizar QR Code'}
          </button>
        </>
      ) : progress < 100 ? (
        <p style={{ fontSize: 12, color: S }}>
          {kloelT(`Aguardando confirmação do dispositivo...`)}
        </p>
      ) : null}
    </div>
  );
}
