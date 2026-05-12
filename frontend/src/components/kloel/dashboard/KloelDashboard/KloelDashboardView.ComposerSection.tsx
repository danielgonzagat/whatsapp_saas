'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { KloelChatComposer } from '@/components/kloel/dashboard/KloelChatComposer';
import {
  CHAT_INLINE_PADDING,
  CHAT_MAX_WIDTH,
  DIVIDER,
  EMBER,
  SURFACE,
  V,
  TEXT,
  MUTED,
  ChatDisclaimer,
  DashboardEmptyGreeting,
  QuickActionIcon,
} from '../KloelDashboard.subcomponents';
import {
  KLOEL_CHAT_QUICK_ACTIONS,
  type KloelChatCapability,
  type KloelChatAttachment,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import type { KloelDashboardQuickAction } from './KloelDashboardView';
import type { MutableRefObject } from 'react';

interface ComposerSectionProps {
  hasMessages: boolean;
  greetingLine: string;
  input: string;
  composerPlaceholder: string;
  isReplyInFlight: boolean;
  activeCapability: KloelChatCapability | null;
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  selectableProducts: KloelLinkedProduct[];
  selectableProductsLoading: boolean;
  composerNotice: string | null;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  onQuickAction: (action: KloelDashboardQuickAction) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  onSelectProduct: (product: KloelLinkedProduct) => void;
  onRemoveLinkedProduct: () => void;
  onCapabilityChange: (capability: KloelChatCapability | null) => void;
}

export function ComposerSection({
  hasMessages,
  greetingLine,
  input,
  composerPlaceholder,
  isReplyInFlight,
  activeCapability,
  attachments,
  linkedProduct,
  selectableProducts,
  selectableProductsLoading,
  composerNotice,
  fileInputRef,
  inputRef,
  onQuickAction,
  onInputChange,
  onSend,
  onRemoveAttachment,
  onRetryAttachment,
  onSelectProduct,
  onRemoveLinkedProduct,
  onCapabilityChange,
}: ComposerSectionProps) {
  return (
    <motion.div
      layout
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{
        width: '100%',
        maxWidth: CHAT_MAX_WIDTH,
        margin: '0 auto',
        padding: `0 ${CHAT_INLINE_PADDING}`,
        boxSizing: 'border-box',
      }}
    >
      <AnimatePresence initial={false}>
        {!hasMessages ? <DashboardEmptyGreeting greetingLine={greetingLine} /> : null}
      </AnimatePresence>

      {!hasMessages ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 10,
            margin: '0 auto 16px',
            maxWidth: CHAT_MAX_WIDTH,
          }}
        >
          {KLOEL_CHAT_QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onQuickAction(action)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 8,
                border: `1px solid color-mix(in srgb, ${DIVIDER} 74%, ${EMBER} 14%)`,
                background: `color-mix(in srgb, ${SURFACE} 94%, ${V})`,
                color: TEXT,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.12)',
              }}
            >
              <QuickActionIcon icon={action.icon} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <motion.div layout transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
        <KloelChatComposer
          input={input}
          placeholder={composerPlaceholder}
          disabled={isReplyInFlight}
          activeCapability={activeCapability}
          attachments={attachments}
          linkedProduct={linkedProduct}
          selectableProducts={selectableProducts}
          productsLoading={selectableProductsLoading}
          popoverPlacement={hasMessages ? 'above' : 'below'}
          inputRef={inputRef}
          onInputChange={onInputChange}
          onSend={onSend}
          onOpenFilePicker={() => fileInputRef.current?.click()}
          onRemoveAttachment={onRemoveAttachment}
          onRetryAttachment={(attachmentId) => {
            void onRetryAttachment(attachmentId);
          }}
          onSelectProduct={onSelectProduct}
          onRemoveLinkedProduct={onRemoveLinkedProduct}
          onCapabilityChange={onCapabilityChange}
        />
      </motion.div>

      <AnimatePresence initial={false}>
        {hasMessages ? <ChatDisclaimer /> : null}
      </AnimatePresence>

      {composerNotice ? (
        <p
          style={{
            margin: hasMessages ? '10px auto 0' : '14px auto 0',
            fontSize: 12,
            lineHeight: 1.45,
            color: MUTED,
            textAlign: 'center',
          }}
        >
          {composerNotice}
        </p>
      ) : null}
    </motion.div>
  );
}
