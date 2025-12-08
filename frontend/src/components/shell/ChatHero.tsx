'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  Image as ImageIcon,
  FileText,
  Sparkles,
  Zap,
  TrendingUp,
  MessageSquare,
  ShoppingBag,
  Headphones,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: '#050608',
  surface: '#111317',
  surfaceHover: '#181B20',
  green: '#28E07B',
  greenHover: '#1FC66A',
  textPrimary: '#F5F5F7',
  textSecondary: '#A0A3AA',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
};

// -------------- ACTION CHIPS --------------
interface ActionChip {
  id: string;
  label: string;
  icon: React.ElementType;
  prompt: string;
}

const DEFAULT_CHIPS: ActionChip[] = [
  {
    id: 'campaign',
    label: 'Criar campanha',
    icon: Zap,
    prompt: 'Quero criar uma campanha de WhatsApp para',
  },
  {
    id: 'analyze',
    label: 'Analisar vendas',
    icon: TrendingUp,
    prompt: 'Analise minhas vendas dos últimos 7 dias e sugira melhorias',
  },
  {
    id: 'respond',
    label: 'Responder cliente',
    icon: MessageSquare,
    prompt: 'Me ajude a responder este cliente que',
  },
  {
    id: 'products',
    label: 'Gerenciar produtos',
    icon: ShoppingBag,
    prompt: 'Quero cadastrar um novo produto',
  },
];

// -------------- MODE SELECTOR --------------
type ChatMode = 'sales' | 'support' | 'auto';

interface ModeOption {
  id: ChatMode;
  label: string;
  description: string;
  icon: React.ElementType;
}

const MODES: ModeOption[] = [
  {
    id: 'auto',
    label: 'Automático',
    description: 'A IA decide o melhor modo',
    icon: Sparkles,
  },
  {
    id: 'sales',
    label: 'Vendas',
    description: 'Foco em converter e vender',
    icon: TrendingUp,
  },
  {
    id: 'support',
    label: 'Suporte',
    description: 'Foco em ajudar clientes',
    icon: Headphones,
  },
];

// -------------- PROPS --------------
interface ChatHeroProps {
  /** Hero title - the big question */
  heroTitle?: string;
  /** Subtitle below the title */
  heroSubtitle?: string;
  /** Custom action chips for this page context */
  actionChips?: ActionChip[];
  /** Show mode selector */
  showModeSelector?: boolean;
  /** Called when user sends a message */
  onSend?: (message: string, mode: ChatMode) => void;
  /** Called when user attaches a file */
  onAttachFile?: (file: File) => void;
  /** Called when user records audio */
  onRecordAudio?: (blob: Blob) => void;
  /** Custom class name */
  className?: string;
  /** Whether the chat is processing */
  isLoading?: boolean;
  /** Placeholder text for input */
  placeholder?: string;
}

// -------------- COMPONENT --------------
export function ChatHero({
  heroTitle = 'Como posso ajudar o seu negócio hoje?',
  heroSubtitle,
  actionChips = DEFAULT_CHIPS,
  showModeSelector = true,
  onSend,
  onAttachFile,
  onRecordAudio,
  className,
  isLoading = false,
  placeholder = 'Pergunte qualquer coisa sobre seu negócio...',
}: ChatHeroProps) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<ChatMode>('auto');
  const [isRecording, setIsRecording] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  // Send message
  const handleSend = () => {
    if (!message.trim() || isLoading) return;
    onSend?.(message.trim(), mode);
    setMessage('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  // Keyboard shortcut
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Chip click
  const handleChipClick = (chip: ActionChip) => {
    setMessage(chip.prompt);
    inputRef.current?.focus();
  };

  // File attachment
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttachFile?.(file);
    }
    e.target.value = '';
  };

  // Audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecordAudio?.(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentMode = MODES.find((m) => m.id === mode) || MODES[0];

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      {/* Hero Title */}
      <div className="text-center mb-8 max-w-2xl">
        <h1
          className="text-4xl md:text-5xl font-semibold mb-3"
          style={{ color: COLORS.textPrimary }}
        >
          {heroTitle}
        </h1>
        {heroSubtitle && (
          <p
            className="text-lg"
            style={{ color: COLORS.textSecondary }}
          >
            {heroSubtitle}
          </p>
        )}
      </div>

      {/* Main Input Card */}
      <div
        className="w-full max-w-2xl rounded-2xl p-1 transition-all duration-200"
        style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isLoading || isRecording}
            className="w-full resize-none bg-transparent px-4 py-4 text-base focus:outline-none"
            style={{
              color: COLORS.textPrimary,
              minHeight: '56px',
              maxHeight: '200px',
            }}
          />
        </div>

        {/* Bottom Bar */}
        <div
          className="flex items-center justify-between px-3 py-2 border-t"
          style={{ borderColor: COLORS.border }}
        >
          {/* Left Actions */}
          <div className="flex items-center gap-2">
            {/* File Attach */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg transition-colors"
              style={{ color: COLORS.textSecondary }}
              title="Anexar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Audio Record */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isRecording && 'animate-pulse'
              )}
              style={{
                color: isRecording ? '#ef4444' : COLORS.textSecondary,
                backgroundColor: isRecording ? 'rgba(239,68,68,0.1)' : 'transparent',
              }}
              title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
            >
              {isRecording ? (
                <div className="flex items-center gap-2">
                  <MicOff className="w-5 h-5" />
                  <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
                </div>
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            {/* Mode Selector */}
            {showModeSelector && (
              <div className="relative">
                <button
                  onClick={() => setShowModeDropdown(!showModeDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    color: COLORS.textSecondary,
                    backgroundColor: COLORS.surfaceHover,
                  }}
                >
                  <currentMode.icon className="w-4 h-4" />
                  <span>{currentMode.label}</span>
                </button>

                {showModeDropdown && (
                  <div
                    className="absolute bottom-full left-0 mb-2 w-48 rounded-xl p-1 shadow-xl z-50"
                    style={{
                      backgroundColor: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {MODES.map((modeOption) => (
                      <button
                        key={modeOption.id}
                        onClick={() => {
                          setMode(modeOption.id);
                          setShowModeDropdown(false);
                        }}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
                          mode === modeOption.id && 'bg-white/5'
                        )}
                        style={{ color: COLORS.textPrimary }}
                      >
                        <modeOption.icon
                          className="w-5 h-5 mt-0.5"
                          style={{
                            color: mode === modeOption.id ? COLORS.green : COLORS.textSecondary,
                          }}
                        />
                        <div>
                          <div className="font-medium text-sm">{modeOption.label}</div>
                          <div
                            className="text-xs mt-0.5"
                            style={{ color: COLORS.textSecondary }}
                          >
                            {modeOption.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!message.trim() || isLoading}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
              !message.trim() && 'opacity-40 cursor-not-allowed'
            )}
            style={{
              backgroundColor: message.trim() ? COLORS.green : COLORS.surfaceHover,
              color: message.trim() ? COLORS.bg : COLORS.textSecondary,
            }}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Action Chips */}
      {actionChips.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-2xl">
          {actionChips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => handleChipClick(chip)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all duration-200 hover:scale-105"
              style={{
                backgroundColor: COLORS.surface,
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <chip.icon className="w-4 h-4" style={{ color: COLORS.green }} />
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hint Text */}
      <p
        className="mt-6 text-xs text-center"
        style={{ color: COLORS.textSecondary }}
      >
        <Sparkles className="w-3 h-3 inline mr-1 opacity-60" />
        A KLOEL pode cometer erros. Verifique informações importantes.
      </p>
    </div>
  );
}

export type { ActionChip, ChatMode, ChatHeroProps };
