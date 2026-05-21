import OpenAI from 'openai';
import { safeResolve } from '../../safe-path';
import { prisma } from '../../db';
import { WhatsAppEngine } from '../../providers/whatsapp-engine';
import { buildSignedLocalStorageUrl } from '../../utils/signed-storage-url';
import { log, type UnknownRecord } from './shared';

export async function sendAudioResponse(
  workspaceId: string,
  phone: string,
  chatId: string | undefined,
  text: string,
  settings: UnknownRecord,
  workspaceCfg: UnknownRecord,
  quotedMessageId?: string,
): Promise<boolean> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      log.warn('openai_tts_not_configured', { workspaceId });
      return false;
    }

    let voiceId =
      settings?.voice?.voiceId ||
      settings?.autopilot?.voiceId ||
      process.env.OPENAI_TTS_VOICE ||
      'nova';

    const voiceProfile = await prisma.voiceProfile.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      select: { voiceId: true },
    });
    if (voiceProfile?.voiceId) {
      voiceId = voiceProfile.voiceId;
    }

    const ttsSpeed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

    const openai = new OpenAI({ apiKey });
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voiceId as string,
      input: text,
      speed: ttsSpeed,
      response_format: 'opus',
    });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const base64Audio = audioBuffer.toString('base64');

    const fs = await import('node:fs');
    const path = await import('node:path');
    const crypto = await import('node:crypto');

    const uploadsDir = safeResolve(process.cwd(), '..', 'backend', 'uploads', 'audio');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `audio_${crypto.randomUUID()}_${Date.now()}.mp3`;
    const filePath = safeResolve(uploadsDir, path.normalize(fileName));
    if (!filePath.startsWith(`${uploadsDir}${path.sep}`) && filePath !== uploadsDir) {
      throw new Error('Path traversal detected in audio file path');
    }
    fs.writeFileSync(filePath, audioBuffer);

    const cdnBase = process.env.CDN_BASE_URL || process.env.MEDIA_BASE_URL;

    let audioUrl: string;
    if (cdnBase) {
      audioUrl = `${cdnBase}/audio/${fileName}`;
    } else if (process.env.APP_URL || process.env.BACKEND_URL || process.env.API_URL) {
      audioUrl = buildSignedLocalStorageUrl(`audio/${fileName}`, {
        expiresInSeconds: 15 * 60,
        downloadName: fileName,
      });
    } else {
      audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    }

    await WhatsAppEngine.sendMedia(
      workspaceCfg as { id: string; [key: string]: unknown },
      phone,
      'audio',
      audioUrl,
      undefined,
      {
        quotedMessageId,
        chatId,
      },
    );

    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        void 0;
      }
    }, 60000);

    log.info('audio_response_sent', {
      workspaceId,
      phone,
      textLength: text.length,
      audioUrl: audioUrl.substring(0, 80),
    });
    return true;
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    log.error('send_audio_error', { error: errorInstanceofError.message, workspaceId, phone });
    return false;
  }
}
