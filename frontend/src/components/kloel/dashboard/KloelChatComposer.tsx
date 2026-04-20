'use client';

import {
  ComposerPopover,
  capabilityIcon,
  capabilityLabel,
} from '@/components/kloel/dashboard/KloelChatComposerParts';
import { ComposerTopRail } from '@/components/kloel/dashboard/KloelChatComposerTopRail';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  type KloelChatAttachment,
  type KloelChatCapability,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import { Plus, SendHorizontal, X } from 'lucide-react';
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';

const F = "'Sora', sans-serif";
const SURFACE = KLOEL_THEME.bgCard;
const SURFACE_ALT = KLOEL_THEME.bgSecondary;
const TEXT = KLOEL_THEME.textPrimary;
const _MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const DIVIDER = KLOEL_THEME.borderPrimary;
const EMBER = KLOEL_THEME.accent;
const LINE_HEIGHT = 26;
const MAX_LINES = 8;
const MIN_HEIGHT = LINE_HEIGHT;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

/** Kloel chat selectable product type. */
export type KloelChatSelectableProduct = KloelLinkedProduct;
type ComposerPopoverPlacement = 'above' | 'below';

interface KloelChatComposerProps {
  input: string;
  placeholder: string;
  disabled: boolean;
  activeCapability: KloelChatCapability | null;
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  selectableProducts: KloelChatSelectableProduct[];
  productsLoading?: boolean;
  popoverPlacement?: ComposerPopoverPlacement;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onOpenFilePicker: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  onSelectProduct: (product: KloelChatSelectableProduct) => void;
  onRemoveLinkedProduct: () => void;
  onCapabilityChange: (capability: KloelChatCapability | null) => void;
}

function baseIconButtonStyle(disabled = false): CSSProperties {
  return {
    width: 40,
    height: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: disabled ? MUTED_2 : TEXT,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'background 140ms ease, color 140ms ease',
    flexShrink: 0,
  };
}

/** Kloel chat composer. */
export function KloelChatComposer({
  input,
  placeholder,
  disabled,
  activeCapability,
  attachments,
  linkedProduct,
  selectableProducts,
  productsLoading = false,
  popoverPlacement = 'above',
  inputRef,
  onInputChange,
  onSend,
  onOpenFilePicker,
  onRemoveAttachment,
  onRetryAttachment,
  onSelectProduct,
  onRemoveLinkedProduct,
  onCapabilityChange,
}: KloelChatComposerProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [hasVerticalOverflow, setHasVerticalOverflow] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = `${MIN_HEIGHT}px`;
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${Math.max(MIN_HEIGHT, nextHeight)}px`;
    setHasVerticalOverflow(textarea.scrollHeight > MAX_HEIGHT + 1);
  }, [input, inputRef]);

  useEffect(() => {
    if (!isPopoverOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (popoverRef.current?.contains(target)) {
        return;
      }
      if (composerRef.current?.contains(target)) {
        return;
      }
      setIsPopoverOpen(false);
      setIsProductMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      setIsPopoverOpen(false);
      setIsProductMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPopoverOpen]);

  const canSend = input.trim().length > 0 && !disabled;
  const hasPendingUploads = attachments.some((attachment) => attachment.status === 'uploading');
  const hasTopRail = attachments.length > 0 || Boolean(linkedProduct);

  const closeMenus = () => {
    setIsPopoverOpen(false);
    setIsProductMenuOpen(false);
  };

  return (
    <div
      ref={composerRef}
      style={{
        position: 'relative',
        background: SURFACE,
        border: `1px solid ${DIVIDER}`,
        borderRadius: 16,
        padding: hasTopRail ? '10px 12px 12px' : '14px 12px 12px',
        boxSizing: 'border-box',
        boxShadow: KLOEL_THEME.shadowXl,
        backdropFilter: 'blur(22px)',
      }}
    >
      <ComposerPopover
        isOpen={isPopoverOpen}
        isProductMenuOpen={isProductMenuOpen}
        popoverRef={popoverRef}
        productsLoading={productsLoading}
        selectableProducts={selectableProducts}
        linkedProduct={linkedProduct}
        activeCapability={activeCapability}
        placement={popoverPlacement}
        onOpenFilePicker={onOpenFilePicker}
        onSelectProduct={onSelectProduct}
        onCapabilityChange={onCapabilityChange}
        onProductMenuOpenChange={setIsProductMenuOpen}
        onClose={closeMenus}
      />

      {hasTopRail ? (
        <ComposerTopRail
          attachments={attachments}
          linkedProduct={linkedProduct}
          onRemoveAttachment={onRemoveAttachment}
          onRetryAttachment={onRetryAttachment}
          onRemoveLinkedProduct={onRemoveLinkedProduct}
        />
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={placeholder}
          style={{
            width: '100%',
            minHeight: MIN_HEIGHT,
            maxHeight: MAX_HEIGHT,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: TEXT,
            fontSize: 17,
            fontFamily: F,
            lineHeight: `${LINE_HEIGHT}px`,
            resize: 'none',
            overflowX: 'hidden',
            overflowY: hasVerticalOverflow ? 'auto' : 'hidden',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            padding: 0,
            margin: 0,
            boxSizing: 'border-box',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              aria-label="Abrir capacidades do prompt"
              aria-haspopup="menu"
              disabled={disabled}
              onClick={() => {
                setIsPopoverOpen((current) => !current);
                setIsProductMenuOpen(false);
              }}
              style={baseIconButtonStyle(disabled)}
            >
              <Plus size={18} strokeWidth={2} aria-hidden="true" />
            </button>

            {activeCapability ? (
              <button
                type="button"
                onClick={() => onCapabilityChange(null)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 36,
                  border: `1px solid color-mix(in srgb, ${EMBER} 28%, ${DIVIDER})`,
                  borderRadius: 999,
                  padding: '0 12px',
                  background: `color-mix(in srgb, ${EMBER} 12%, ${SURFACE_ALT})`,
                  color: EMBER,
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: F,
                  cursor: 'pointer',
                }}
              >
                {capabilityIcon(activeCapability)}
                {capabilityLabel(activeCapability)}
                <X size={12} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || hasPendingUploads}
            aria-label="Enviar mensagem"
            style={{
              ...baseIconButtonStyle(!canSend || hasPendingUploads),
              background: canSend && !hasPendingUploads ? EMBER : SURFACE_ALT,
              borderColor: canSend && !hasPendingUploads ? EMBER : DIVIDER,
              color: canSend && !hasPendingUploads ? KLOEL_THEME.textOnAccent : MUTED_2,
            }}
          >
            <SendHorizontal size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
