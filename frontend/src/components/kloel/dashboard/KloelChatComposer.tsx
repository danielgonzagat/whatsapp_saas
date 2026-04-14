'use client';

import { PulseLoader } from '@/components/kloel/PulseLoader';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  KLOEL_CHAT_CAPABILITY_LABELS,
  type KloelChatAttachment,
  type KloelChatCapability,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  FileText,
  Globe,
  ImagePlus,
  LayoutTemplate,
  Link2,
  Music4,
  Paperclip,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

const F = "'Sora', sans-serif";
const SURFACE = KLOEL_THEME.bgCard;
const SURFACE_ALT = KLOEL_THEME.bgSecondary;
const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const DIVIDER = KLOEL_THEME.borderPrimary;
const SUCCESS = KLOEL_THEME.success;
const INFO = KLOEL_THEME.info;
const WARNING = KLOEL_THEME.warning;
const ERROR = KLOEL_THEME.error;
const ERROR_BG = KLOEL_THEME.errorBg;
const EMBER = KLOEL_THEME.accent;
const LINE_HEIGHT = 26;
const MAX_LINES = 8;
const MIN_HEIGHT = LINE_HEIGHT;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;
const POPOVER_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

export type KloelChatSelectableProduct = KloelLinkedProduct;

interface KloelChatComposerProps {
  input: string;
  placeholder: string;
  disabled: boolean;
  activeCapability: KloelChatCapability | null;
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  selectableProducts: KloelChatSelectableProduct[];
  productsLoading?: boolean;
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

function capabilityIcon(capability: KloelChatCapability, size = 14) {
  const common = { size, strokeWidth: 1.9 };
  if (capability === 'create_image') {
    return <Sparkles {...common} />;
  }
  if (capability === 'create_site') {
    return <LayoutTemplate {...common} />;
  }
  return <Globe {...common} />;
}

function attachmentIcon(kind: KloelChatAttachment['kind']) {
  if (kind === 'image') return <ImagePlus size={14} strokeWidth={1.8} />;
  if (kind === 'audio') return <Music4 size={14} strokeWidth={1.8} />;
  return <FileText size={14} strokeWidth={1.8} />;
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 KB';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function statusColor(status: KloelLinkedProduct['status']) {
  if (status === 'published') {
    return SUCCESS;
  }
  if (status === 'affiliate') {
    return INFO;
  }
  return WARNING;
}

function baseIconButtonStyle(disabled = false): CSSProperties {
  return {
    width: 40,
    height: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    border: `1px solid ${DIVIDER}`,
    background: SURFACE_ALT,
    color: disabled ? MUTED_2 : TEXT,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
    flexShrink: 0,
  };
}

export function KloelChatComposer({
  input,
  placeholder,
  disabled,
  activeCapability,
  attachments,
  linkedProduct,
  selectableProducts,
  productsLoading = false,
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
    if (!textarea) return;

    textarea.style.height = `${MIN_HEIGHT}px`;
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${Math.max(MIN_HEIGHT, nextHeight)}px`;
    setHasVerticalOverflow(textarea.scrollHeight > MAX_HEIGHT + 1);
  }, [input, inputRef]);

  useEffect(() => {
    if (!isPopoverOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (composerRef.current?.contains(target)) return;
      setIsPopoverOpen(false);
      setIsProductMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
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
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.18)',
        backdropFilter: 'blur(22px)',
      }}
    >
      <AnimatePresence>
        {isPopoverOpen ? (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={POPOVER_TRANSITION}
            style={{
              position: 'absolute',
              left: 0,
              bottom: 'calc(100% + 12px)',
              width: 308,
              padding: 8,
              borderRadius: 14,
              border: `1px solid ${DIVIDER}`,
              background: 'rgba(18, 18, 20, 0.96)',
              boxShadow: '0 18px 42px rgba(0, 0, 0, 0.32)',
              backdropFilter: 'blur(18px)',
              transformOrigin: 'bottom left',
              zIndex: 30,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <PopoverAction
                icon={<Paperclip size={15} strokeWidth={1.9} />}
                label="Adicionar fotos e arquivos"
                meta="⌘/Ctrl U"
                onClick={() => {
                  onOpenFilePicker();
                  closeMenus();
                }}
              />

              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => setIsProductMenuOpen(true)}
                onMouseLeave={() => setIsProductMenuOpen(false)}
              >
                <PopoverAction
                  icon={<Link2 size={15} strokeWidth={1.9} />}
                  label="Vincular Produto"
                  onClick={() => setIsProductMenuOpen((current) => !current)}
                  trailing={<ChevronRight size={14} strokeWidth={1.8} />}
                />

                <AnimatePresence>
                  {isProductMenuOpen ? (
                    <motion.div
                      initial={{ opacity: 0, x: -8, scale: 0.985 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -8, scale: 0.985 }}
                      transition={POPOVER_TRANSITION}
                      style={{
                        position: 'absolute',
                        left: 'calc(100% + 10px)',
                        bottom: -6,
                        width: 292,
                        maxHeight: 320,
                        overflowY: 'auto',
                        padding: 8,
                        borderRadius: 14,
                        border: `1px solid ${DIVIDER}`,
                        background: 'rgba(18, 18, 20, 0.98)',
                        boxShadow: '0 18px 42px rgba(0, 0, 0, 0.32)',
                        backdropFilter: 'blur(18px)',
                        transformOrigin: 'left bottom',
                        zIndex: 31,
                      }}
                    >
                      {productsLoading ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '14px 12px',
                            color: MUTED,
                            fontSize: 13,
                          }}
                        >
                          <PulseLoader width={18} height={18} />
                          Carregando produtos...
                        </div>
                      ) : selectableProducts.length === 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            padding: '14px 12px',
                          }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1.5, color: MUTED }}>
                            Nenhum produto encontrado. Crie seu primeiro produto para vincular.
                          </span>
                          <Link
                            href="/produtos"
                            style={{
                              color: EMBER,
                              fontSize: 13,
                              fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            Abrir produtos
                          </Link>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {selectableProducts.map((product) => (
                            <button
                              key={`${product.source}:${product.id}`}
                              type="button"
                              onClick={() => {
                                onSelectProduct(product);
                                closeMenus();
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                width: '100%',
                                border: 'none',
                                borderRadius: 8,
                                background:
                                  linkedProduct?.id === product.id &&
                                  linkedProduct?.source === product.source
                                    ? `color-mix(in srgb, ${EMBER} 12%, rgba(18, 18, 20, 1))`
                                    : 'transparent',
                                padding: '10px 12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                              }}
                            >
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt=""
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    objectFit: 'cover',
                                    flexShrink: 0,
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: `color-mix(in srgb, ${EMBER} 12%, ${SURFACE_ALT})`,
                                    color: EMBER,
                                    flexShrink: 0,
                                  }}
                                >
                                  <Link2 size={14} strokeWidth={1.9} />
                                </div>
                              )}

                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    lineHeight: 1.35,
                                    fontWeight: 600,
                                    color: TEXT,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  title={product.name}
                                >
                                  {product.name}
                                </div>
                                <div
                                  style={{
                                    marginTop: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    minWidth: 0,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 11,
                                      lineHeight: 1.2,
                                      fontWeight: 700,
                                      color: statusColor(product.status),
                                      letterSpacing: '0.03em',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {product.status === 'published'
                                      ? 'Publicado'
                                      : product.status === 'affiliate'
                                        ? 'Afiliado'
                                        : 'Rascunho'}
                                  </span>
                                  {product.subtitle ? (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        lineHeight: 1.2,
                                        color: MUTED_2,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                      title={product.subtitle}
                                    >
                                      {product.subtitle}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div
                style={{
                  height: 1,
                  margin: '6px 4px',
                  background: `color-mix(in srgb, ${DIVIDER} 92%, transparent)`,
                }}
              />

              <PopoverAction
                icon={<Sparkles size={15} strokeWidth={1.9} />}
                label="Criar imagem"
                onClick={() => {
                  onCapabilityChange(activeCapability === 'create_image' ? null : 'create_image');
                  closeMenus();
                }}
                trailing={
                  activeCapability === 'create_image' ? (
                    <Check size={14} strokeWidth={2.2} />
                  ) : undefined
                }
              />

              <PopoverAction
                icon={<LayoutTemplate size={15} strokeWidth={1.9} />}
                label="Criar site"
                onClick={() => {
                  onCapabilityChange(activeCapability === 'create_site' ? null : 'create_site');
                  closeMenus();
                }}
                trailing={
                  activeCapability === 'create_site' ? (
                    <Check size={14} strokeWidth={2.2} />
                  ) : undefined
                }
              />

              <PopoverAction
                icon={<Search size={15} strokeWidth={1.9} />}
                label="Buscar"
                onClick={() => {
                  onCapabilityChange(activeCapability === 'search_web' ? null : 'search_web');
                  closeMenus();
                }}
                trailing={
                  activeCapability === 'search_web' ? (
                    <Check size={14} strokeWidth={2.2} />
                  ) : undefined
                }
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {hasTopRail ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            paddingBottom: 10,
            marginBottom: 12,
            borderBottom: `1px solid ${DIVIDER}`,
          }}
        >
          {attachments.map((attachment) =>
            attachment.kind === 'image' ? (
              <div
                key={attachment.id}
                style={{
                  position: 'relative',
                  width: 72,
                  height: 72,
                  padding: 0,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: `1px solid ${DIVIDER}`,
                  background: SURFACE_ALT,
                }}
              >
                <button
                  type="button"
                  aria-label={`Abrir prévia de ${attachment.name}`}
                  disabled={attachment.status !== 'ready' || !attachment.previewUrl}
                  onClick={() => {
                    if (attachment.status === 'ready' && attachment.previewUrl) {
                      window.open(attachment.previewUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: attachment.status === 'ready' ? 'pointer' : 'default',
                  }}
                >
                  {attachment.previewUrl ? (
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: MUTED,
                      }}
                    >
                      <ImagePlus size={18} strokeWidth={1.8} />
                    </div>
                  )}
                </button>

                <OverlayStatus attachment={attachment} />
                <RemoveIconButton
                  label={`Remover ${attachment.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveAttachment(attachment.id);
                  }}
                />
              </div>
            ) : (
              <div
                key={attachment.id}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  maxWidth: 240,
                  minHeight: 58,
                  padding: '10px 40px 10px 12px',
                  borderRadius: 12,
                  border: `1px solid ${DIVIDER}`,
                  background: SURFACE_ALT,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `color-mix(in srgb, ${EMBER} 10%, ${SURFACE})`,
                    color: EMBER,
                    flexShrink: 0,
                  }}
                >
                  {attachmentIcon(attachment.kind)}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: 1.35,
                      color: TEXT,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={attachment.name}
                  >
                    {attachment.name}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.2, color: MUTED_2 }}>
                    {attachment.status === 'error'
                      ? attachment.error || 'Falha no upload'
                      : attachment.status === 'uploading'
                        ? 'Enviando arquivo...'
                        : `${formatFileSize(attachment.size)} · pronto`}
                  </div>
                  {attachment.status === 'error' ? (
                    <button
                      type="button"
                      onClick={() => onRetryAttachment(attachment.id)}
                      style={{
                        marginTop: 8,
                        border: 'none',
                        background: 'transparent',
                        color: EMBER,
                        padding: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: F,
                        cursor: 'pointer',
                      }}
                    >
                      Tentar novamente
                    </button>
                  ) : null}
                </div>

                <InlineStatus attachment={attachment} />
                <RemoveIconButton
                  label={`Remover ${attachment.name}`}
                  onClick={() => onRemoveAttachment(attachment.id)}
                />
              </div>
            ),
          )}

          {linkedProduct ? (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                maxWidth: 280,
                minHeight: 58,
                padding: '10px 40px 10px 12px',
                borderRadius: 12,
                border: `1px solid color-mix(in srgb, ${EMBER} 18%, ${DIVIDER})`,
                background: `color-mix(in srgb, ${EMBER} 10%, ${SURFACE})`,
              }}
            >
              {linkedProduct.imageUrl ? (
                <img
                  src={linkedProduct.imageUrl}
                  alt=""
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `color-mix(in srgb, ${EMBER} 22%, ${SURFACE_ALT})`,
                    color: EMBER,
                    flexShrink: 0,
                  }}
                >
                  <Link2 size={15} strokeWidth={2} />
                </div>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: 1.35,
                      color: TEXT,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={linkedProduct.name}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: `color-mix(in srgb, ${EMBER} 18%, ${SURFACE_ALT})`,
                        color: EMBER,
                        flexShrink: 0,
                      }}
                    >
                      <Link2 size={10} strokeWidth={2.1} />
                    </span>
                    {linkedProduct.name}
                  </span>
                </div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: 1.2,
                      fontWeight: 700,
                      color: statusColor(linkedProduct.status),
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {linkedProduct.status === 'published'
                      ? 'Publicado'
                      : linkedProduct.status === 'affiliate'
                        ? 'Afiliado'
                        : 'Rascunho'}
                  </span>
                  {linkedProduct.subtitle ? (
                    <span
                      style={{
                        fontSize: 11,
                        lineHeight: 1.2,
                        color: MUTED_2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={linkedProduct.subtitle}
                    >
                      {linkedProduct.subtitle}
                    </span>
                  ) : null}
                </div>
              </div>

              <RemoveIconButton
                label={`Remover vínculo com ${linkedProduct.name}`}
                onClick={onRemoveLinkedProduct}
              />
            </div>
          ) : null}
        </div>
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
              <Plus size={18} strokeWidth={2} />
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
                {KLOEL_CHAT_CAPABILITY_LABELS[activeCapability]}
                <X size={12} strokeWidth={2.2} />
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
            <SendHorizontal size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PopoverAction({
  icon,
  label,
  meta,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  meta?: string;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        border: 'none',
        borderRadius: 8,
        background: isHovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
        color: TEXT,
        padding: '11px 12px',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: F,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 140ms ease, color 140ms ease',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: MUTED }}>{icon}</span>
        {label}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: MUTED }}>
        {meta ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: MUTED_2,
            }}
          >
            {meta}
          </span>
        ) : null}
        {trailing ? <span style={{ color: MUTED }}>{trailing}</span> : null}
      </span>
    </button>
  );
}

function RemoveIconButton({
  label,
  onClick,
}: {
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 999,
        background: 'rgba(12, 12, 14, 0.74)',
        color: KLOEL_THEME.textInverse,
        cursor: 'pointer',
      }}
    >
      <X size={12} strokeWidth={2.2} />
    </button>
  );
}

function OverlayStatus({ attachment }: { attachment: KloelChatAttachment }) {
  if (attachment.status === 'ready') return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          attachment.status === 'error'
            ? `color-mix(in srgb, ${ERROR_BG} 82%, rgba(10, 10, 12, 0.56))`
            : 'rgba(10, 10, 12, 0.56)',
        color: KLOEL_THEME.textInverse,
      }}
    >
      {attachment.status === 'uploading' ? (
        <PulseLoader width={28} height={18} />
      ) : (
        <X size={18} strokeWidth={2.2} />
      )}
    </div>
  );
}

function InlineStatus({ attachment }: { attachment: KloelChatAttachment }) {
  if (attachment.status === 'ready') return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 40,
        color: attachment.status === 'error' ? ERROR : MUTED,
      }}
    >
      {attachment.status === 'uploading' ? (
        <PulseLoader width={18} height={14} />
      ) : (
        <X size={14} strokeWidth={2.2} />
      )}
    </div>
  );
}
