jest.mock('../observability/ops-alert.service', () => ({
  OpsAlertService: jest.fn().mockImplementation(() => ({
    alertOnCriticalError: jest.fn(),
  })),
}));

import { TranscriptionService } from './transcription.service';

const mockExistsSync = jest.requireMock('node:fs').existsSync as jest.Mock;
const mockReadFile = jest.requireMock('node:fs/promises').readFile as jest.Mock;
const mockWriteFile = jest.requireMock('node:fs/promises').writeFile as jest.Mock;
const mockUnlink = jest.requireMock('node:fs/promises').unlink as jest.Mock;

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('node:os', () => ({
  tmpdir: () => '/tmp',
}));

jest.mock('node:path', () => {
  const actual = jest.requireActual('node:path');
  return {
    ...actual,
    basename: (p: string) => {
      const parts = p.split('/');
      return parts[parts.length - 1];
    },
  };
});

jest.mock('../common/trace-headers', () => ({
  getTraceHeaders: () => ({ 'x-trace-id': 'test-trace' }),
}));

jest.mock('../common/utils/url-validator', () => ({
  validateNoInternalAccess: jest.fn(),
}));

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: (type: string) =>
    type === 'audio_understanding' ? 'whisper-1' : 'whisper-1',
}));

const mockValidateNoInternalAccess = jest.requireMock('../common/utils/url-validator')
  .validateNoInternalAccess as jest.Mock;

describe('TranscriptionService', () => {
  let config: { get: jest.Mock };
  let opsAlert: { alertOnCriticalError: jest.Mock };
  let service: TranscriptionService;
  const origFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReset();

    config = {
      get: jest.fn().mockReturnValue('sk-test-openai-key'),
    };

    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };

    service = new TranscriptionService(
      config as unknown as ConstructorParameters<typeof TranscriptionService>[0],
      opsAlert as unknown as ConstructorParameters<typeof TranscriptionService>[1],
    );
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  describe('transcribeAudio', () => {
    it('returns error when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.transcribeAudio('/nonexistent/file.ogg');

      expect(result).toEqual({ text: '', source: 'error' });
    });

    it('returns fallback when openai key is not configured', async () => {
      mockExistsSync.mockReturnValue(true);
      config.get.mockReturnValue(undefined);
      const svc = new TranscriptionService(
        config as unknown as ConstructorParameters<typeof TranscriptionService>[0],
      );

      const result = await svc.transcribeAudio('/tmp/test.ogg');

      expect(result).toEqual({ text: '[Áudio não transcrito]', source: 'fallback' });
    });

    it('returns fallback when all openai retries fail', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('fake-audio-data'));

      const fetchMock = jest.fn().mockRejectedValue(new Error('network error'));
      global.fetch = fetchMock as never;

      const result = await service.transcribeAudio('/tmp/test.ogg');

      expect(result).toEqual({ text: '[Áudio não transcrito]', source: 'fallback' });
    });

    it('returns openai transcription on successful API call', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('fake-audio-data'));

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'Olá mundo' }),
      });
      global.fetch = fetchMock as never;

      const result = await service.transcribeAudio('/tmp/test.ogg');

      expect(result).toEqual({ text: 'Olá mundo', source: 'openai' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('passes language parameter through to openai', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('fake-audio-data'));

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'Bonjour le monde' }),
      });
      global.fetch = fetchMock as never;

      const result = await service.transcribeAudio('/tmp/test.ogg', 'fr');

      expect(result).toEqual({ text: 'Bonjour le monde', source: 'openai' });
    });

    it('retries after first openai failure', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('fake-audio-data'));

      let callCount = 0;
      const fetchMock = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('timeout'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ text: 'retry success' }),
        } as Response);
      });
      global.fetch = fetchMock as never;

      const result = await service.transcribeAudio('/tmp/test.ogg');

      expect(result).toEqual({ text: 'retry success', source: 'openai' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('tries fallback model on 4xx error from primary model', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('fake-audio-data'));

      let callCount = 0;
      const fetchMock = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () => Promise.resolve('bad request'),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ text: 'fallback model transcript' }),
        } as Response);
      });
      global.fetch = fetchMock as never;

      const result = await service.transcribeAudio('/tmp/test.ogg');

      expect(result).toEqual({ text: 'fallback model transcript', source: 'openai' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws when fallback model also returns 4xx', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('fake-audio-data'));

      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      });
      global.fetch = fetchMock as never;

      const result = await service.transcribeAudio('/tmp/test.ogg');

      expect(result).toEqual({ text: '[Áudio não transcrito]', source: 'fallback' });
    });

    it('alerts ops on critical error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('fake-audio-data'));

      const fetchMock = jest.fn().mockRejectedValue(new Error('critical failure'));
      global.fetch = fetchMock as never;

      await service.transcribeAudio('/tmp/test.ogg');

      expect(opsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        expect.anything(),
        'TranscriptionService.json',
      );
    });
  });

  describe('downloadToTemp', () => {
    it('rejects internal URLs via SSRF guard', async () => {
      mockValidateNoInternalAccess.mockImplementation(() => {
        throw new Error('SSRF blocked');
      });

      const result = await service.downloadToTemp('http://10.0.0.5/audio.ogg', 'msg-1');

      expect(result).toBeNull();
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalled();
      expect(mockValidateNoInternalAccess).toHaveBeenCalledWith('http://10.0.0.5/audio.ogg');
    });

    it('downloads and saves file to temp directory', async () => {
      mockValidateNoInternalAccess.mockReturnValue(undefined);

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: new Headers({ 'content-type': 'audio/ogg' }),
      });
      global.fetch = fetchMock as never;

      mockWriteFile.mockResolvedValue(undefined);

      const result = await service.downloadToTemp('https://cdn.example.com/audio.ogg', 'msg-1');

      expect(result).toMatch(/^\/tmp\/audio_.*\.ogg$/);
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('returns null on fetch failure', async () => {
      mockValidateNoInternalAccess.mockReturnValue(undefined);

      const fetchMock = jest.fn().mockRejectedValue(new Error('fetch failed'));
      global.fetch = fetchMock as never;

      const result = await service.downloadToTemp('https://cdn.example.com/audio.ogg', 'msg-1');

      expect(result).toBeNull();
    });

    it('extracts file extension from content-type header', async () => {
      mockValidateNoInternalAccess.mockReturnValue(undefined);

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      });
      global.fetch = fetchMock as never;

      mockWriteFile.mockResolvedValue(undefined);

      const result = await service.downloadToTemp('https://example.com/audio', 'msg-1');

      expect(result).toMatch(/\.mp3$/);
    });

    it('extracts file extension from URL when content-type is absent', async () => {
      mockValidateNoInternalAccess.mockReturnValue(undefined);

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: new Headers({}),
      });
      global.fetch = fetchMock as never;

      mockWriteFile.mockResolvedValue(undefined);

      const result = await service.downloadToTemp('https://example.com/audio.wav', 'msg-1');

      expect(result).toMatch(/\.wav$/);
    });

    it('defaults to .ogg when extension cannot be determined', async () => {
      mockValidateNoInternalAccess.mockReturnValue(undefined);

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: new Headers({}),
      });
      global.fetch = fetchMock as never;

      mockWriteFile.mockResolvedValue(undefined);

      const result = await service.downloadToTemp('https://example.com/audio', 'msg-1');

      expect(result).toMatch(/\.ogg$/);
    });

    it('uses randomUUID for safe path generation', async () => {
      mockValidateNoInternalAccess.mockReturnValue(undefined);

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: new Headers({}),
      });
      global.fetch = fetchMock as never;

      mockWriteFile.mockResolvedValue(undefined);

      const result1 = await service.downloadToTemp('https://cdn.example.com/audio.ogg', 'msg-1');
      const result2 = await service.downloadToTemp('https://cdn.example.com/audio.ogg', 'msg-2');

      expect(result1).not.toBe(result2);
    });
  });

  describe('cleanup', () => {
    it('deletes file within temp directory', async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);

      await service.cleanup('/tmp/audio_test.ogg');

      expect(mockUnlink).toHaveBeenCalledWith('/tmp/audio_test.ogg');
    });

    it('skips cleanup when file is outside temp directory', async () => {
      mockExistsSync.mockReturnValue(true);

      await service.cleanup('/etc/passwd');

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('skips cleanup when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await service.cleanup('/tmp/nonexistent.ogg');

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('ignores errors during cleanup', async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockRejectedValue(new Error('permission denied'));

      await expect(service.cleanup('/tmp/audio_test.ogg')).resolves.toBeUndefined();
    });
  });
});
