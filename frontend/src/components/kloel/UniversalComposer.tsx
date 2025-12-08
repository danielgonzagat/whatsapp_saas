'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { 
  Send, 
  Mic, 
  Square, 
  Paperclip,
  FileText,
  Package,
  Smartphone,
  Zap,
  Bot,
  Users,
  Stethoscope,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius, shadows } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export interface ActionChip {
  id: string;
  label: string;
  icon?: React.ElementType;
  prompt: string;
}

export interface UniversalComposerProps {
  /** Placeholder text */
  placeholder?: string;
  /** Action chips to display */
  chips?: ActionChip[];
  /** Called when user sends a message */
  onSend: (message: string) => void;
  /** Called when user clicks a chip */
  onChipClick?: (chip: ActionChip) => void;
  /** Is the AI currently responding? */
  isStreaming?: boolean;
  /** Is loading? */
  isLoading?: boolean;
  /** Called to stop streaming */
  onStop?: () => void;
  /** Size variant */
  size?: 'default' | 'compact';
  /** Additional class */
  className?: string;
}

// ============================================
// DEFAULT CHIPS
// ============================================

const DEFAULT_CHIPS: ActionChip[] = [
  { id: 'pdf', label: 'Anexar PDF', icon: FileText, prompt: 'Quero ensinar meus produtos via PDF' },
  { id: 'products', label: 'Ensinar produtos', icon: Package, prompt: 'Me ajude a cadastrar meus produtos' },
  { id: 'whatsapp', label: 'Conectar WhatsApp', icon: Smartphone, prompt: 'Quero conectar meu WhatsApp' },
  { id: 'campaign', label: 'Criar campanha', icon: Zap, prompt: 'Crie uma campanha de vendas' },
  { id: 'autopilot', label: 'Ativar Autopilot', icon: Bot, prompt: 'Ative o autopilot para mim' },
  { id: 'leads', label: 'Importar leads', icon: Users, prompt: 'Quero importar minha lista de leads' },
  { id: 'diagnostic', label: 'Ver diagnóstico', icon: Stethoscope, prompt: 'Faça um diagnóstico do meu negócio' },
];

// ============================================
// COMPONENT
// ============================================

export function UniversalComposer({
  placeholder = 'Diga o que você quer que eu faça pelo seu WhatsApp e suas vendas…',
  chips = DEFAULT_CHIPS,
  onSend,
  onChipClick,
  isStreaming = false,
  isLoading = false,
  onStop,
  size = 'default',
  className,
}: UniversalComposerProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = size === 'compact' ? 120 : 200;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [message, size]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (chip: ActionChip) => {
    if (onChipClick) {
      onChipClick(chip);
    } else {
      setMessage(chip.prompt);
      textareaRef.current?.focus();
    }
  };

  const isCompact = size === 'compact';

  return (
    <div className={cn('w-full', className)}>
      {/* Main Composer Box */}
      <div
        className="relative group"
        style={{
          backgroundColor: colors.background.surface1,
          borderRadius: radius.xl,
          border: `1px solid ${colors.stroke}`,
          boxShadow: shadows.card,
          transition: `all ${motion.duration.normal} ${motion.easing.default}`,
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className={cn(
            'w-full bg-transparent resize-none focus:outline-none',
            isCompact ? 'px-4 py-3 text-[15px]' : 'px-5 py-4 text-base',
          )}
          style={{
            color: colors.text.primary,
            lineHeight: '1.5',
          }}
        />

        {/* Action Buttons Row */}
        <div 
          className={cn(
            'flex items-center justify-between border-t',
            isCompact ? 'px-3 py-2' : 'px-4 py-3',
          )}
          style={{ borderColor: colors.divider }}
        >
          {/* Left: Attachment + Voice */}
          <div className="flex items-center gap-1">
            {/* Attach */}
            <button
              type="button"
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: colors.text.muted }}
              aria-label="Anexar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Voice */}
            <button
              type="button"
              onClick={() => setIsRecording(!isRecording)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isRecording ? 'bg-red-500/20' : 'hover:bg-white/5'
              )}
              style={{ color: isRecording ? colors.state.error : colors.text.muted }}
              aria-label={isRecording ? 'Parar gravação' : 'Gravar áudio'}
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>

          {/* Right: Send or Stop */}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all"
              style={{
                backgroundColor: colors.state.error,
                color: '#fff',
              }}
            >
              <Square className="w-4 h-4" />
              Parar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim() || isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-40"
              style={{
                backgroundColor: message.trim() ? colors.brand.green : colors.background.surface2,
                color: message.trim() ? colors.background.obsidian : colors.text.muted,
              }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {!isCompact && 'Enviar'}
            </button>
          )}
        </div>
      </div>

      {/* Action Chips */}
      {chips.length > 0 && !isCompact && (
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          {chips.slice(0, 7).map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                onClick={() => handleChipClick(chip)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                  color: colors.text.secondary,
                }}
              >
                {Icon && <Icon className="w-4 h-4" style={{ color: colors.brand.green }} />}
                {chip.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { ActionChip as ComposerChip };
