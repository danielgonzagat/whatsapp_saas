"use client";

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, Send, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiUrl } from '@/lib/http';

interface AudioRecorderProps {
  workspaceId: string;
  onTranscription?: (text: string) => void;
  onAudioReady?: (audioBlob: Blob, audioUrl: string) => void;
  onSendAudio?: (audioBlob: Blob) => void;
  disabled?: boolean;
  className?: string;
}

export function AudioRecorder({
  workspaceId,
  onTranscription,
  onAudioReady,
  onSendAudio,
  disabled = false,
  className = '',
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        onAudioReady?.(blob, url);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Não foi possível acessar o microfone');
    }
  }, [onAudioReady]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const discardRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingDuration(0);
  }, [audioUrl]);

  const transcribeAudio = useCallback(async () => {
    if (!audioBlob || !onTranscription) return;

    setIsTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', 'pt');

      const response = await fetch(apiUrl(`/kloel/audio/${workspaceId}/transcribe`), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Falha na transcrição');
      }

      const data = await response.json();
      onTranscription(data.transcription);
      discardRecording();
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Erro ao transcrever áudio');
    } finally {
      setIsTranscribing(false);
    }
  }, [audioBlob, workspaceId, onTranscription, discardRecording]);

  const sendAudio = useCallback(() => {
    if (!audioBlob || !onSendAudio) return;
    onSendAudio(audioBlob);
    discardRecording();
  }, [audioBlob, onSendAudio, discardRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <AnimatePresence mode="wait">
        {!audioBlob ? (
          // Recording controls
          <motion.div
            key="recording"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            {isRecording ? (
              <>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-3 h-3 bg-red-500 rounded-full"
                />
                <span className="text-sm text-gray-600 font-mono">
                  {formatDuration(recordingDuration)}
                </span>
                <button
                  onClick={stopRecording}
                  className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  title="Parar gravação"
                >
                  <MicOff className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button
                onClick={startRecording}
                disabled={disabled}
                className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
                title="Iniciar gravação"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </motion.div>
        ) : (
          // Playback & send controls
          <motion.div
            key="playback"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1"
          >
            <audio src={audioUrl!} controls className="h-8 max-w-[150px]" />
            
            <button
              onClick={discardRecording}
              className="p-1.5 text-gray-500 hover:text-red-500 transition-colors"
              title="Descartar"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {onTranscription && (
              <button
                onClick={transcribeAudio}
                disabled={isTranscribing}
                className="p-1.5 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition-colors disabled:opacity-50"
                title="Transcrever áudio"
              >
                {isTranscribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-xs px-1">📝</span>
                )}
              </button>
            )}

            {onSendAudio && (
              <button
                onClick={sendAudio}
                className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                title="Enviar áudio"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
