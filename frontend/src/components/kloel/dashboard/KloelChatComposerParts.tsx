'use client';

import { PulseLoader } from '@/components/kloel/PulseLoader';
import { PopoverAction } from '@/components/kloel/dashboard/KloelChatComposerSurfaceParts';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  KLOEL_CHAT_CAPABILITY_LABELS,
  type KloelChatCapability,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  Globe,
  LayoutTemplate,
  Link2,
  Paperclip,
  Search,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { type RefObject } from 'react';

const SURFACE = KLOEL_THEME.bgCard;
const SURFACE_ALT = KLOEL_THEME.bgSecondary;
const SURFACE_ELEVATED = KLOEL_THEME.bgElevated;
const DIVIDER = KLOEL_THEME.borderPrimary;
const EMBER = KLOEL_THEME.accent;
const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const POPOVER_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

export function capabilityIcon(capability: KloelChatCapability, size = 14) {
  const common = { size, strokeWidth: 1.9 };
  if (capability === 'create_image') {
    return <Sparkles {...common} />;
  }
  if (capability === 'create_site') {
    return <LayoutTemplate {...common} />;
  }
  return <Globe {...common} />;
}

function statusColor(status: KloelLinkedProduct['status']) {
  if (status === 'published') return KLOEL_THEME.success;
  if (status === 'affiliate') return KLOEL_THEME.info;
  return KLOEL_THEME.warning;
}

interface ComposerPopoverProps {
  isOpen: boolean;
  isProductMenuOpen: boolean;
  popoverRef: RefObject<HTMLDivElement | null>;
  productsLoading: boolean;
  selectableProducts: KloelLinkedProduct[];
  linkedProduct: KloelLinkedProduct | null;
  activeCapability: KloelChatCapability | null;
  placement?: 'above' | 'below';
  onOpenFilePicker: () => void;
  onSelectProduct: (product: KloelLinkedProduct) => void;
  onCapabilityChange: (capability: KloelChatCapability | null) => void;
  onProductMenuOpenChange: (isOpen: boolean) => void;
  onClose: () => void;
}

export function ComposerPopover({
  isOpen,
  isProductMenuOpen,
  popoverRef,
  productsLoading,
  selectableProducts,
  linkedProduct,
  activeCapability,
  placement = 'above',
  onOpenFilePicker,
  onSelectProduct,
  onCapabilityChange,
  onProductMenuOpenChange,
  onClose,
}: ComposerPopoverProps) {
  const openBelow = placement === 'below';

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: openBelow ? -10 : 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: openBelow ? -8 : 8, scale: 0.985 }}
          transition={POPOVER_TRANSITION}
          style={{
            position: 'absolute',
            left: 0,
            ...(openBelow ? { top: 'calc(100% + 12px)' } : { bottom: 'calc(100% + 12px)' }),
            width: 308,
            padding: 8,
            borderRadius: 14,
            border: `1px solid ${DIVIDER}`,
            background: SURFACE_ELEVATED,
            boxShadow: KLOEL_THEME.shadowXl,
            backdropFilter: 'blur(18px)',
            transformOrigin: openBelow ? 'top left' : 'bottom left',
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
                onClose();
              }}
            />

            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => onProductMenuOpenChange(true)}
              onMouseLeave={() => onProductMenuOpenChange(false)}
            >
              <PopoverAction
                icon={<Link2 size={15} strokeWidth={1.9} />}
                label="Vincular Produto"
                onClick={() => onProductMenuOpenChange(!isProductMenuOpen)}
                trailing={<ChevronRight size={14} strokeWidth={1.8} />}
              />

              <AnimatePresence>
                {isProductMenuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, x: -8, y: openBelow ? 6 : 0, scale: 0.985 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, y: openBelow ? 6 : 0, scale: 0.985 }}
                    transition={POPOVER_TRANSITION}
                    style={{
                      position: 'absolute',
                      left: 'calc(100% + 10px)',
                      ...(openBelow ? { top: -6 } : { bottom: -6 }),
                      width: 292,
                      maxHeight: 320,
                      overflowY: 'auto',
                      padding: 8,
                      borderRadius: 14,
                      border: `1px solid ${DIVIDER}`,
                      background: SURFACE_ELEVATED,
                      boxShadow: KLOEL_THEME.shadowXl,
                      backdropFilter: 'blur(18px)',
                      transformOrigin: openBelow ? 'left top' : 'left bottom',
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
                              onClose();
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
                                  ? `color-mix(in srgb, ${EMBER} 12%, ${SURFACE})`
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
                onClose();
              }}
              trailing={
                activeCapability === 'create_image' ? <Check size={14} strokeWidth={2.2} /> : null
              }
            />

            <PopoverAction
              icon={<LayoutTemplate size={15} strokeWidth={1.9} />}
              label="Criar site"
              onClick={() => {
                onCapabilityChange(activeCapability === 'create_site' ? null : 'create_site');
                onClose();
              }}
              trailing={
                activeCapability === 'create_site' ? <Check size={14} strokeWidth={2.2} /> : null
              }
            />

            <PopoverAction
              icon={<Search size={15} strokeWidth={1.9} />}
              label="Buscar"
              onClick={() => {
                onCapabilityChange(activeCapability === 'search_web' ? null : 'search_web');
                onClose();
              }}
              trailing={
                activeCapability === 'search_web' ? <Check size={14} strokeWidth={2.2} /> : null
              }
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function capabilityLabel(capability: KloelChatCapability) {
  return KLOEL_CHAT_CAPABILITY_LABELS[capability];
}
