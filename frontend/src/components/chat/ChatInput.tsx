'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Paperclip, Mic, X, File, Image, FileAudio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttachedFile {
  file: File;
  preview?: string;
  type: 'image' | 'audio' | 'document';
}

interface ChatInputProps {
  onSend: (message: string) => void;
  onSendFile?: (file: File, caption?: string) => void;
  onSendAudio?: (audioBlob: Blob) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onSendFile,
  onSendAudio,
  onStop,
  isLoading = false,
  isStreaming = false,
  placeholder = 'Digite sua mensagem...',
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (attachedFile?.preview) {
        URL.revokeObjectURL(attachedFile.preview);
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [attachedFile]);

  const handleSubmit = () => {
    if (attachedFile && onSendFile) {
      onSendFile(attachedFile.file, value.trim() || undefined);
      setAttachedFile(null);
      setValue('');
      return;
    }
    
    if (value.trim() && !isLoading && !disabled) {
      onSend(value);
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: AttachedFile['type'] = 'document';
    let preview: string | undefined;

    if (file.type.startsWith('image/')) {
      type = 'image';
      preview = URL.createObjectURL(file);
    } else if (file.type.startsWith('audio/')) {
      type = 'audio';
    }

    setAttachedFile({ file, preview, type });
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = () => {
    if (attachedFile?.preview) {
      URL.revokeObjectURL(attachedFile.preview);
    }
    setAttachedFile(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (onSendAudio) {
          onSendAudio(audioBlob);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);

    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = []; // Clear chunks to not send
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileIcon = () => {
    if (!attachedFile) return null;
    switch (attachedFile.type) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'audio':
        return <FileAudio className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  // Recording mode
  if (isRecording) {
    return (
      <div className="flex items-center gap-4 p-4 bg-[#0A0A0F] border-t border-[#2A2A3E]">
        <button
          onClick={cancelRecording}
          className="p-2 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
          title="Cancelar"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex-1 flex items-center gap-3">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 font-mono text-lg">
            {formatRecordingTime(recordingTime)}
          </span>
          <span className="text-gray-400 text-sm">Gravando...</span>
        </div>

        <button
          onClick={stopRecording}
          className="p-3 rounded-xl bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] text-black hover:opacity-90 transition-colors flex items-center justify-center"
          title="Enviar áudio"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col bg-[#0A0A0F] border-t border-[#2A2A3E]">
      {/* Attachment preview */}
      {attachedFile && (
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#1A1A24] rounded-lg border border-[#2A2A3E]">
            {attachedFile.preview ? (
              <img 
                src={attachedFile.preview} 
                alt="Preview" 
                className="w-10 h-10 object-cover rounded"
              />
            ) : (
              <div className="w-10 h-10 flex items-center justify-center bg-[#2A2A3E] rounded">
                {getFileIcon()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{attachedFile.file.name}</p>
              <p className="text-xs text-gray-500">
                {(attachedFile.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={removeAttachment}
              className="p-1 rounded hover:bg-red-500/20 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-red-400" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 p-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
        />

        {/* Botões extras */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A24] transition-colors disabled:opacity-50"
            title="Anexar arquivo"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled || !onSendAudio}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A24] transition-colors disabled:opacity-50"
            title="Gravar áudio"
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>

        {/* Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedFile ? 'Adicione uma legenda...' : placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full px-4 py-3 bg-[#1A1A24] border border-[#2A2A3E] rounded-xl',
              'text-white placeholder:text-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-[#00FFA3]/50 focus:border-[#00FFA3]',
              'resize-none max-h-32 scrollbar-thin scrollbar-thumb-[#2A2A3E]',
              'transition-all duration-200',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />
        </div>

        {/* Botão de enviar/parar */}
        {isStreaming ? (
          <button
            type="button"
            onClick={handleStop}
            className={cn(
              'p-3 rounded-xl bg-red-500 text-white',
              'hover:bg-red-600 transition-colors',
              'flex items-center justify-center'
            )}
            title="Parar resposta"
          >
            <Square className="w-5 h-5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={(!value.trim() && !attachedFile) || isLoading || disabled}
            className={cn(
              'p-3 rounded-xl transition-all duration-200',
              'flex items-center justify-center',
              (value.trim() || attachedFile) && !isLoading && !disabled
                ? 'bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] text-black hover:opacity-90'
                : 'bg-[#2A2A3E] text-gray-500 cursor-not-allowed'
            )}
            title="Enviar mensagem"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
