'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Upload, X } from 'lucide-react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const mergedTheme = { ...defaultTheme, ...theme };
  const mergedLayout = { ...defaultLayout, ...layout };
  const displayUrl = previewUrl || fallbackUrl || '';

  const frameStyle: CSSProperties = {
    position: 'relative',
    borderRadius: mergedLayout.borderRadius,
    background: mergedTheme.frameBackground,
    border: `1px solid ${dragActive ? mergedTheme.accentColor : mergedTheme.borderColor}`,
    padding: mergedLayout.padding,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: mergedLayout.minHeight,
    cursor: 'pointer',
    transition: 'border-color 150ms ease',
  };

  return (
    <div>
      {label ? (
        <label
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
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onSelectFile(file);
        }}
        style={frameStyle}
      >
        {displayUrl ? (
          <>
            <img
              src={displayUrl}
              alt={alt}
              style={{
                maxWidth: mergedLayout.imageMaxWidth,
                maxHeight: mergedLayout.imageMaxHeight,
                objectFit: previewFit,
                borderRadius: mergedLayout.borderRadius - 2,
                display: 'block',
              }}
            />

            {showRemoveButton && onClear ? (
              <button
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
                <X className="h-4 w-4" />
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
            {emptyContent || (
              <Upload
                style={{
                  width: 32,
                  height: 32,
                  color: dragActive
                    ? mergedTheme.accentColor
                    : mergedTheme.mutedColor,
                }}
              />
            )}
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: mergedTheme.textColor,
                }}
              >
                {uploading ? 'Enviando...' : emptyTitle}
              </p>
              {emptySubtitle ? (
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

        {uploading ? (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: mergedTheme.accentColor,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Enviando...
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
        aria-label={inputAriaLabel || label || 'Selecionar arquivo'}
        ref={inputRef}
        type="file"
        accept={accept}
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
