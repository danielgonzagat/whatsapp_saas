'use client';

import { kloelT } from '@/lib/i18n/t';
import { KloelChatComposer } from '@/components/kloel/dashboard/KloelChatComposer';
import type { KloelApprovalDecision, KloelApprovalRequest } from '@/lib/api/kloel';
import {
  type KloelChatAttachment,
  type KloelChatCapability,
  KLOEL_CHAT_QUICK_ACTIONS,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import { AnimatePresence, motion } from 'framer-motion';
import type { DragEvent as ReactDragEvent, MutableRefObject } from 'react';
import { type DashboardMessage, MessageBlock } from '../KloelDashboard.message';
import {
  CHAT_INLINE_PADDING,
  CHAT_MAX_WIDTH,
  CHAT_SAFE_BOTTOM,
  CHAT_SCROLL_BOTTOM_SPACE,
  F,
  MUTED,
  TEXT,
  V,
  ChatDisclaimer,
  ConversationHeaderBar,
  DashboardEmptyGreeting,
  DashboardGlobalStyles,
  DropOverlay,
} from '../KloelDashboard.subcomponents';
import { PendingApprovalsStrip } from './KloelDashboardView.ApprovalStrip';

export type KloelDashboardQuickAction = (typeof KLOEL_CHAT_QUICK_ACTIONS)[number];

interface KloelDashboardViewProps {
  isDragActive: boolean;
  hasMessages: boolean;
  messages: DashboardMessage[];
  conversationTitle: string;
  onTitle: (title: string) => void;
  streamingMessageId: string | null;
  isThinking: boolean;
  isReplyInFlight: boolean;
  showSlowHint: boolean;
  greetingLine: string;
  input: string;
  composerPlaceholder: string;
  activeCapability: KloelChatCapability | null;
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  selectableProducts: KloelLinkedProduct[];
  selectableProductsLoading: boolean;
  composerNotice: string | null;
  pendingApprovals: KloelApprovalRequest[];
  pendingApprovalsLoading: boolean;
  approvalActionInFlight: string | null;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  onDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  onDropFiles: (event: ReactDragEvent<HTMLElement>) => Promise<void>;
  onQueueFilesForUpload: (selectedFiles: FileList | File[] | null) => Promise<void>;
  onQuickAction: (action: KloelDashboardQuickAction) => void;
  onUserEdit: (messageId: string, nextText: string) => Promise<void>;
  onUserRetry: (messageId: string) => Promise<void>;
  onAssistantFeedback: (messageId: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate: (messageId: string) => Promise<void>;
  onCancelActiveReply: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  onSelectProduct: (product: KloelLinkedProduct) => void;
  onRemoveLinkedProduct: () => void;
  onCapabilityChange: (capability: KloelChatCapability | null) => void;
  onApprovalDecision: (approvalRequestId: string, decision: KloelApprovalDecision) => Promise<void>;
}

export function KloelDashboardView({
  isDragActive,
  hasMessages,
  messages,
  conversationTitle,
  onTitle,
  streamingMessageId,
  isThinking,
  isReplyInFlight,
  showSlowHint,
  greetingLine,
  input,
  composerPlaceholder,
  activeCapability,
  attachments,
  linkedProduct,
  selectableProducts,
  selectableProductsLoading,
  composerNotice,
  pendingApprovals,
  pendingApprovalsLoading,
  approvalActionInFlight,
  fileInputRef,
  inputRef,
  messagesEndRef,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDropFiles,
  onQueueFilesForUpload,
  onUserEdit,
  onUserRetry,
  onAssistantFeedback,
  onAssistantRegenerate,
  onCancelActiveReply,
  onInputChange,
  onSend,
  onRemoveAttachment,
  onRetryAttachment,
  onSelectProduct,
  onRemoveLinkedProduct,
  onCapabilityChange,
  onApprovalDecision,
}: KloelDashboardViewProps) {
  return (
    <section
      aria-label="Área de chat"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        void onDropFiles(event);
      }}
      style={{
        position: 'relative',
        background: V,
        flex: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: F,
        color: TEXT,
        overflow: 'hidden',
      }}
    >
      <AnimatePresence initial={false}>{isDragActive ? <DropOverlay /> : null}</AnimatePresence>
      <DashboardGlobalStyles />
      <input
        ref={fileInputRef}
        data-testid="kloel-chat-file-input"
        type="file"
        hidden
        multiple
        accept={kloelT(
          `image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,audio/mpeg,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/x-m4a`,
        )}
        onChange={(event) => {
          void onQueueFilesForUpload(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {hasMessages ? (
          <>
            <ConversationHeaderBar title={conversationTitle} onTitle={onTitle} />
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: CHAT_MAX_WIDTH,
                  margin: '0 auto',
                  padding: `28px ${CHAT_INLINE_PADDING} ${CHAT_SCROLL_BOTTOM_SPACE}px`,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 28,
                  minHeight: '100%',
                }}
              >
                {messages.map((message) => (
                  <MessageBlock
                    key={message.id}
                    message={message}
                    isStreaming={message.id === streamingMessageId && !isThinking}
                    isThinking={message.id === streamingMessageId && isThinking}
                    isBusy={isReplyInFlight}
                    showSlowHint={message.id === streamingMessageId && showSlowHint}
                    onUserEdit={onUserEdit}
                    onUserRetry={onUserRetry}
                    onAssistantFeedback={onAssistantFeedback}
                    onAssistantRegenerate={onAssistantRegenerate}
                    {...(message.id === streamingMessageId && onCancelActiveReply !== undefined
                      ? { onCancelProcessing: onCancelActiveReply }
                      : {})}
                  />
                ))}
                <div ref={messagesEndRef} style={{ scrollMarginBottom: 96 }} />
              </div>
            </div>
          </>
        ) : null}

        <PendingApprovalsStrip
          approvals={pendingApprovals}
          loading={pendingApprovalsLoading}
          inFlight={approvalActionInFlight}
          onApprovalDecision={onApprovalDecision}
        />

        <div
          style={{
            flex: hasMessages ? '0 0 auto' : 1,
            display: 'flex',
            alignItems: hasMessages ? 'flex-end' : 'center',
            justifyContent: 'center',
            paddingTop: hasMessages ? 18 : 32,
            paddingBottom: CHAT_SAFE_BOTTOM,
            minHeight: 0,
          }}
        >
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
        </div>
      </div>
    </section>
  );
}
