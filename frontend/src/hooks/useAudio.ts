"use client";

import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface TranscriptionResult {
  text: string;
  duration?: number;
  language: string;
}

export function useAudio(workspaceId: string) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribeFile = useCallback(async (
    file: File,
    language = 'pt'
  ): Promise<TranscriptionResult | null> => {
    setIsTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('language', language);

      const response = await fetch(
        `${API_URL}/kloel/audio/${workspaceId}/transcribe`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('Falha na transcrição');
      }

      const data = await response.json();
      return {
        text: data.transcription,
        duration: data.duration,
        language: data.language,
      };
    } catch (err: any) {
      setError(err.message || 'Erro ao transcrever áudio');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [workspaceId]);

  const transcribeUrl = useCallback(async (
    audioUrl: string,
    language = 'pt'
  ): Promise<TranscriptionResult | null> => {
    setIsTranscribing(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/kloel/audio/${workspaceId}/transcribe-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioUrl, language }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha na transcrição');
      }

      const data = await response.json();
      return {
        text: data.transcription,
        duration: data.duration,
        language: data.language,
      };
    } catch (err: any) {
      setError(err.message || 'Erro ao transcrever áudio');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [workspaceId]);

  const transcribeBase64 = useCallback(async (
    base64Audio: string,
    language = 'pt'
  ): Promise<TranscriptionResult | null> => {
    setIsTranscribing(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/kloel/audio/${workspaceId}/transcribe-base64`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64Audio, language }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha na transcrição');
      }

      const data = await response.json();
      return {
        text: data.transcription,
        duration: data.duration,
        language: data.language,
      };
    } catch (err: any) {
      setError(err.message || 'Erro ao transcrever áudio');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [workspaceId]);

  const textToSpeech = useCallback(async (
    text: string,
    options?: { 
      voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
      hd?: boolean;
    }
  ): Promise<string | null> => {
    setIsGeneratingSpeech(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/kloel/audio/${workspaceId}/text-to-speech-base64`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: options?.voice || 'nova',
            hd: options?.hd || false,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao gerar áudio');
      }

      const data = await response.json();
      return data.audio; // data URL
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar áudio');
      return null;
    } finally {
      setIsGeneratingSpeech(false);
    }
  }, [workspaceId]);

  const playText = useCallback(async (
    text: string,
    options?: { 
      voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
      hd?: boolean;
    }
  ): Promise<void> => {
    const audioUrl = await textToSpeech(text, options);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
    }
  }, [textToSpeech]);

  return {
    isTranscribing,
    isGeneratingSpeech,
    error,
    transcribeFile,
    transcribeUrl,
    transcribeBase64,
    textToSpeech,
    playText,
  };
}
