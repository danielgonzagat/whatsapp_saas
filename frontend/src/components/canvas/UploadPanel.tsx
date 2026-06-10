'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { useRouter } from 'next/navigation';
import { type DragEvent, useCallback, useId, useRef, useState } from 'react';
import { IC } from './CanvasIcons';

const S = "var(--font-sora), 'Sora', sans-serif";

const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
const UPLOAD_STORAGE_KEY = 'canvas:upload-image';

/** Reads an image file to a data URL and resolves its natural dimensions. */
function readImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('Arquivo invalido'));
        return;
      }
      const img = new window.Image();
      img.onload = () =>
        resolve({
          dataUrl,
          width: img.naturalWidth || 1080,
          height: img.naturalHeight || 1080,
        });
      img.onerror = () => reject(new Error('Imagem invalida'));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export interface UploadPanelProps {
  /** Called after a successful file pick so the parent (modal) can close. */
  onUploaded?: () => void;
}

export function UploadPanel({ onUploaded }: UploadPanelProps = {}) {
  const router = useRouter();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) {
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError('Selecione um arquivo de imagem (PNG, JPG, WEBP, GIF ou SVG).');
        return;
      }
      setError(null);
      try {
        const { dataUrl, width, height } = await readImage(file);
        // Data URLs are too large for a query string, so hand off via
        // sessionStorage. The editor reads + clears this key on init.
        window.sessionStorage.setItem(UPLOAD_STORAGE_KEY, dataUrl);
        onUploaded?.();
        const name = file.name.replace(/\.[^.]+$/, '') || 'Upload';
        router.push(
          `/canvas/editor?w=${width}&h=${height}&name=${encodeURIComponent(
            name,
          )}&upload=${encodeURIComponent(UPLOAD_STORAGE_KEY)}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao processar a imagem';
        setError(msg);
        console.error('Canvas upload panel failed:', err);
      }
    },
    [onUploaded, router],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFile(e.target.files?.[0]);
      // Reset so picking the same file again still fires onChange.
      e.target.value = '';
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragOver(false);
      void handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile],
  );

  const openPicker = useCallback(() => fileInputRef.current?.click(), []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
      }}
    >
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept={ACCEPTED}
        onChange={onInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={openPicker}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label={kloelT('Selecionar imagem para enviar')}
        style={{
          width: '100%',
          maxWidth: 500,
          height: 280,
          border: `2px dashed ${dragOver ? colors.ember.primary : colors.canvas.border}`,
          background: dragOver ? colors.ember.bg : 'transparent',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ color: colors.ember.primary, opacity: 0.5 }}>{IC.upload(40)}</div>
        <p
          style={{
            fontSize: 14,
            color: colors.text.muted,
            fontFamily: S,
          }}
        >
          {kloelT(`Arraste seu conteudo para ca ou`)}
        </p>
        <span
          style={{
            padding: '8px 16px',
            background: colors.ember.primary,
            borderRadius: 4,
            color: colors.background.void,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: S,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {IC.plus(12)} {kloelT(`Fazer upload de arquivos`)}
        </span>
      </button>
      {error && <p style={{ fontSize: 12, color: colors.state.error, fontFamily: S }}>{error}</p>}
      <p
        style={{
          fontSize: 11,
          color: colors.text.dim,
          fontFamily: S,
        }}
      >
        {kloelT(`Aceita imagens (PNG, JPG, WEBP, GIF e SVG)`)}
      </p>
    </div>
  );
}
