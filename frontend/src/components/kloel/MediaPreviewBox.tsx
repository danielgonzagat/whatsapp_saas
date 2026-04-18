'use client';

import { PulseLoader } from '@/components/kloel/PulseLoader';
import { Upload, X } from 'lucide-react';
import { type CSSProperties, type ReactNode, useId, useRef, useState } from 'react';

type Theme = {
  accentColor?: string;
  borderColor?: string;
  frameBackground?: string;
  labelColor?: string;
  mutedColor?: string;
  textColor?: string;
};

type Layout = {
  borderRadius?: number;
  imageMaxHeight?: number | string;
  imageMaxWidth?: number | string;
  minHeight?: number | string;
  padding?: number | string;
};

interface MediaPreviewBoxProps {
  accept?: string;
  alt?: string;
  emptyContent?: ReactNode;
  emptySubtitle?: string;
  emptyTitle?: string;
  fallbackUrl?: string | null;
  hint?: string;
  inputAriaLabel?: string;
  label?: string;
  layout?: Layout;
  onClear?: () => void;
  onSelectFile: (file: File) => void;
  previewFit?: 'contain' | 'cover';
  previewUrl?: string | null;
  removeButtonAriaLabel?: string;
  showRemoveButton?: boolean;
  theme?: Theme;
  uploading?: boolean;
}

const defaultTheme: Required<Theme> = {
  accentColor: '#E85D30',
  borderColor: '#222226',
  frameBackground: 'rgba(255,255,255,0.04)',
  labelColor: '#6E6E73',
  mutedColor: '#3A3A3F',
  textColor: '#E0DDD8',
};

const defaultLayout: Required<Layout> = {
  borderRadius: 6,
  imageMaxHeight: 160,
  imageMaxWidth: '75%',
  minHeight: 160,
  padding: 16,
};

export function MediaPreviewBox({
  accept = 'image/*',
  alt = '',
  emptyContent,
  emptySubtitle = 'JPG, PNG ou WebP',
  emptyTitle = 'Arraste ou clique para enviar',
  fallbackUrl,
  hint,
  inputAriaLabel,
  label,
  layout,
  onClear,
  onSelectFile,
  previewFit = 'contain',
  previewUrl,
  removeButtonAriaLabel = 'Remover arquivo',
  showRemoveButton = true,
  theme,
  uploading = false,
}: MediaPreviewBoxProps) {
  const autoId = useId();
  const fileInputId = `${autoId}-file`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const mergedTheme = { ...defaultTheme, ...theme };
  const mergedLayout = { ...defaultLayout, ...layout };
  const displayUrl = previewUrl || fallbackUrl || '';

  const frameStyle: CSSProperties = {
    position: 'relative',
    borderRadius: mergedLayout.borderRadius,
    background: mergedTheme.frameBackground,
    border: `1px solid ${uploading || dragActive ? mergedTheme.accentColor : mergedTheme.borderColor}`,
    padding: mergedLayout.padding,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: mergedLayout.minHeight,
    cursor: uploading ? 'default' : 'pointer',
    overflow: 'hidden',
    transition: 'border-color 150ms ease, background 150ms ease',
  };

  return (
    <div>
      {label ? (
        <label
          htmlFor={fileInputId}
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            color: mergedTheme.labelColor,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      ) : null}

      <div
        aria-busy={uploading}
        role="button"
        tabIndex={0}
        aria-label="Selecionar arquivo de mídia"
        onClick={() => {
          if (!uploading) inputRef.current?.click();
        }}
        onDragOver={(event) => {
          if (uploading) return;
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          if (uploading) return;
          event.preventDefault();
          setDragActive(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onSelectFile(file);
        }}
        style={frameStyle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        {displayUrl ? (
          <>
            {/* biome-ignore lint/performance/noImgElement: user-selected preview blob URL or arbitrary CDN, sized by container layout */}
            <img
              src={displayUrl}
              alt={alt}
              width={320}
              height={240}
              style={{
                maxWidth: mergedLayout.imageMaxWidth,
                maxHeight: mergedLayout.imageMaxHeight,
                objectFit: previewFit,
                borderRadius: mergedLayout.borderRadius - 2,
                display: 'block',
              }}
            />

            {showRemoveButton && onClear && !uploading ? (
              <button
                type="button"
                aria-label={removeButtonAriaLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onClear();
                }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 8,
            }}
          >
            {uploading ? (
              <PulseLoader width={94} height={20} />
            ) : (
              emptyContent || (
                <Upload
                  style={{
                    width: 32,
                    height: 32,
                    color: dragActive ? mergedTheme.accentColor : mergedTheme.mutedColor,
                  }}
                  aria-hidden="true"
                />
              )
            )}
            <div>
              {!uploading ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: mergedTheme.textColor,
                  }}
                >
                  {emptyTitle}
                </p>
              ) : null}
              {emptySubtitle && !uploading ? (
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 12,
                    color: mergedTheme.labelColor,
                  }}
                >
                  {emptySubtitle}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {uploading && displayUrl ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(10,10,12,0.78)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <PulseLoader width={104} height={20} />
          </div>
        ) : null}
      </div>

      {hint ? (
        <p
          style={{
            marginTop: 4,
            fontSize: 11,
            color: mergedTheme.labelColor,
          }}
        >
          {hint}
        </p>
      ) : null}

      <input
        id={fileInputId}
        aria-label={inputAriaLabel || label || 'Selecionar arquivo'}
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={uploading}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelectFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
