import { BadRequestException } from '@nestjs/common';
import {
  type AssertSafeStorageUrlOptions,
  assertSafeStorageUrl,
  safeStorageFetch,
} from '../common/utils/url-safety';

type LookupFn = NonNullable<AssertSafeStorageUrlOptions['dnsLookup']>;

const ALLOWED = ['cdn.example.com', 'storage.googleapis.com'];

const PUBLIC_LOOKUP: LookupFn = async (hostname: string) => {
  const map: Record<string, { address: string; family: number }> = {
    'cdn.example.com': { address: '93.184.216.34', family: 4 },
    'storage.googleapis.com': { address: '142.250.190.16', family: 4 },
    'evil.example.org': { address: '203.0.113.10', family: 4 },
    'rebind.example.com': { address: '10.0.0.5', family: 4 },
  };
  const hit = map[hostname];
  if (!hit) {
    throw new Error(`unknown host: ${hostname}`);
  }
  return [hit];
};

function baseOptions(): AssertSafeStorageUrlOptions {
  return {
    allowedHosts: ALLOWED,
    allowHttp: false,
    dnsLookup: PUBLIC_LOOKUP,
  };
}

describe('assertSafeStorageUrl (SSRF guard)', () => {
  it('rejects file:// scheme', async () => {
    await expect(assertSafeStorageUrl('file:///etc/passwd', baseOptions())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects data: scheme', async () => {
    await expect(
      assertSafeStorageUrl('data:text/plain;base64,SGVsbG8=', baseOptions()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects blob: scheme', async () => {
    await expect(
      assertSafeStorageUrl('blob:https://cdn.example.com/abc', baseOptions()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects http:// when not in dev exemption', async () => {
    await expect(
      assertSafeStorageUrl('http://cdn.example.com/file.bin', baseOptions()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects malformed URL', async () => {
    await expect(assertSafeStorageUrl('not a url', baseOptions())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects URL with embedded credentials', async () => {
    await expect(
      assertSafeStorageUrl('https://user:pw@cdn.example.com/x', baseOptions()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-standard port', async () => {
    await expect(
      assertSafeStorageUrl('https://cdn.example.com:8443/x', baseOptions()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects localhost literal', async () => {
    await expect(
      assertSafeStorageUrl('https://localhost/file', {
        ...baseOptions(),
        allowedHosts: ['localhost'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects 127.0.0.1 literal', async () => {
    await expect(
      assertSafeStorageUrl('https://127.0.0.1/file', {
        ...baseOptions(),
        allowedHosts: ['127.0.0.1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects AWS metadata IP 169.254.169.254', async () => {
    await expect(
      assertSafeStorageUrl('https://169.254.169.254/latest/meta-data/', {
        ...baseOptions(),
        allowedHosts: ['169.254.169.254'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects RFC1918 10.0.0.5 literal', async () => {
    await expect(
      assertSafeStorageUrl('https://10.0.0.5/file', {
        ...baseOptions(),
        allowedHosts: ['10.0.0.5'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects DNS-rebinding host that resolves to a private IP', async () => {
    // Host is in allowlist (simulating a trusted CNAME), but DNS returns RFC1918.
    await expect(
      assertSafeStorageUrl('https://rebind.example.com/file', {
        allowedHosts: ['rebind.example.com'],
        dnsLookup: PUBLIC_LOOKUP,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects host not in allowlist', async () => {
    await expect(
      assertSafeStorageUrl('https://evil.example.org/file', baseOptions()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects suffix collisions like evilcdn.example.com when exact match required', async () => {
    const lookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];
    await expect(
      assertSafeStorageUrl('https://evilcdn.example.com/x', {
        allowedHosts: ['cdn.example.com'],
        dnsLookup: lookup,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a properly allowlisted https URL on default port', async () => {
    const url = await assertSafeStorageUrl(
      'https://cdn.example.com/path/file.bin?sig=abc',
      baseOptions(),
    );
    expect(url.toString()).toBe('https://cdn.example.com/path/file.bin?sig=abc');
  });

  it('rejects when allowedHosts is empty', async () => {
    await expect(
      assertSafeStorageUrl('https://cdn.example.com/file', {
        allowedHosts: [],
        dnsLookup: PUBLIC_LOOKUP,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('safeStorageFetch (redirect re-validation)', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
  });

  it('rejects redirect target pointing to a private IP host', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (u.startsWith('https://cdn.example.com/')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://rebind.example.com/private' },
        });
      }
      return new Response('should-not-reach', { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      safeStorageFetch('https://cdn.example.com/file', {
        allowedHosts: ['cdn.example.com', 'rebind.example.com'],
        dnsLookup: PUBLIC_LOOKUP,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a valid redirect to another allowlisted public host', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (u.startsWith('https://cdn.example.com/')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://storage.googleapis.com/bucket/file' },
        });
      }
      return new Response('OK', { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await safeStorageFetch('https://cdn.example.com/file', {
      allowedHosts: ALLOWED,
      dnsLookup: PUBLIC_LOOKUP,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects redirect to a disallowed host', async () => {
    const fetchMock = jest.fn(async (): Promise<Response> => {
      return new Response(null, {
        status: 301,
        headers: { location: 'https://evil.example.org/x' },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      safeStorageFetch('https://cdn.example.com/file', {
        allowedHosts: ALLOWED,
        dnsLookup: PUBLIC_LOOKUP,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
