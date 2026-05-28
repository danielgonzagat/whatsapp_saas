import { describe, it, expect } from 'vitest';
import {
  BLOCKED_HOSTNAMES,
  BLOCKED_PORTS,
  createSsrfRequestError,
  ipToNumber,
  isPrivateIP,
  isPrivateIPv6,
  isUrlAllowed,
  normalizeHost,
  parseUrl,
  PRIVATE_IP_RANGES,
  REDIRECT_STATUSES,
  sanitizeHeaders,
  SSRF_REQUEST_ERRORS,
  validateBasicRules,
} from '../utils/ssrf-protection.helpers';

describe('ssrf-protection.helpers / normalizeHost', () => {
  it('trims and lowercases the host', () => {
    expect(normalizeHost('  EXAMPLE.com  ')).toBe('example.com');
  });

  it('strips IPv6 brackets', () => {
    expect(normalizeHost('[::1]')).toBe('::1');
    expect(normalizeHost('[2001:db8::1]')).toBe('2001:db8::1');
  });

  it('does not strip a single bracket on one side', () => {
    expect(normalizeHost('[::1')).toBe('[::1');
    expect(normalizeHost('::1]')).toBe('::1]');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizeHost('')).toBe('');
    expect(normalizeHost(null as unknown as string)).toBe('');
    expect(normalizeHost(undefined as unknown as string)).toBe('');
  });
});

describe('ssrf-protection.helpers / ipToNumber', () => {
  it('converts dotted-quad to its 32-bit representation', () => {
    expect(ipToNumber('0.0.0.0')).toBe(0);
    expect(ipToNumber('0.0.0.1')).toBe(1);
    expect(ipToNumber('1.0.0.0')).toBe(1 << 24);
    expect(ipToNumber('10.0.0.0')).toBe(10 << 24);
  });

  it('preserves ordering across ranges', () => {
    expect(ipToNumber('192.168.0.0')).toBeLessThan(ipToNumber('192.168.255.255'));
    expect(ipToNumber('172.15.255.255')).toBeLessThan(ipToNumber('172.16.0.0'));
  });
});

describe('ssrf-protection.helpers / isPrivateIP (IPv4)', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.0.1', true],
    ['192.168.1.100', true],
    ['169.254.169.254', true], // cloud metadata
    ['100.64.0.1', true], // CGNAT
    ['0.0.0.0', true],
    ['255.255.255.255', true],
    ['192.0.2.10', true], // TEST-NET-1
    ['198.51.100.10', true], // TEST-NET-2
    ['203.0.113.10', true], // TEST-NET-3
  ])('flags %s as private', (ip, expected) => {
    expect(isPrivateIP(ip)).toBe(expected);
  });

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['172.32.0.1'], // just outside the 172.16/12 block
    ['172.15.255.255'], // just before the block
    ['11.0.0.1'], // adjacent to 10/8
    ['100.63.255.255'], // just before CGNAT
    ['100.128.0.1'], // just after CGNAT
  ])('treats %s as public', (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });

  it('fails closed on non-IP input', () => {
    expect(isPrivateIP('not-an-ip')).toBe(true);
    expect(isPrivateIP('')).toBe(true);
  });
});

describe('ssrf-protection.helpers / isPrivateIPv6', () => {
  it.each([['::1'], ['::'], ['fe80::1'], ['fc00::1'], ['fd00::1'], ['2001:db8::1']])(
    'flags %s as private',
    (ip) => {
      expect(isPrivateIPv6(ip)).toBe(true);
    },
  );

  it('detects IPv4-mapped private addresses', () => {
    expect(isPrivateIPv6('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
  });

  it('treats IPv4-mapped public addresses as public', () => {
    expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
  });

  it('strips zone identifiers before classification', () => {
    expect(isPrivateIPv6('fe80::1%eth0')).toBe(true);
  });

  it('returns false for global unicast addresses', () => {
    expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);
  });
});

describe('ssrf-protection.helpers / isPrivateIP (IPv6 via dispatch)', () => {
  it('routes IPv6 inputs through the IPv6 classifier', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('fe80::1')).toBe(true);
    expect(isPrivateIP('2606:4700:4700::1111')).toBe(false);
  });
});

describe('ssrf-protection.helpers / parseUrl', () => {
  it('returns the parsed URL for valid input', () => {
    const result = parseUrl('https://example.com/path');
    expect('url' in result).toBe(true);
    if ('url' in result) {
      expect(result.url.hostname).toBe('example.com');
      expect(result.url.protocol).toBe('https:');
    }
  });

  it('returns a localized error for invalid input', () => {
    const result = parseUrl('not a url');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/URL inv[aá]lida/);
    }
  });
});

describe('ssrf-protection.helpers / validateBasicRules', () => {
  it('rejects non-HTTP(S) protocols', () => {
    const url = new URL('ftp://example.com');
    const result = validateBasicRules(url);
    expect(result?.valid).toBe(false);
    expect(result?.error).toMatch(/Protocolo n[aã]o permitido/);
  });

  it.each([['file:'], ['gopher:'], ['ws:'], ['wss:']])('rejects %s', (protocol) => {
    const url = new URL(`${protocol}//example.com`);
    expect(validateBasicRules(url)?.valid).toBe(false);
  });

  it('rejects blocked hostnames', () => {
    for (const blocked of BLOCKED_HOSTNAMES.filter((h) => !h.includes(':'))) {
      const url = new URL(`https://${blocked}`);
      const result = validateBasicRules(url);
      expect(result?.valid).toBe(false);
      expect(result?.error).toMatch(/bloqueado/);
    }
  });

  it('rejects private IP literals in the host slot', () => {
    const url = new URL('http://10.0.0.1');
    const result = validateBasicRules(url);
    expect(result?.valid).toBe(false);
    expect(result?.error).toMatch(/IP privado bloqueado/);
  });

  it('rejects blocked ports', () => {
    const url = new URL('http://example.com:22');
    const result = validateBasicRules(url);
    expect(result?.valid).toBe(false);
    expect(result?.error).toMatch(/Porta bloqueada/);
  });

  it.each(BLOCKED_PORTS)('rejects blocked port %i', (port) => {
    const url = new URL(`http://example.com:${port}`);
    expect(validateBasicRules(url)?.valid).toBe(false);
  });

  it('returns null when every rule passes (caller escalates to DNS)', () => {
    const url = new URL('https://example.com');
    expect(validateBasicRules(url)).toBeNull();
  });

  it('returns null for an HTTP URL on a non-standard but allowed port', () => {
    const url = new URL('https://example.com:8443');
    expect(validateBasicRules(url)).toBeNull();
  });

  it('uses the default port (80/443) when none is specified', () => {
    // No port — should not match the blocked-port list.
    const url = new URL('http://example.com');
    expect(validateBasicRules(url)).toBeNull();
  });
});

describe('ssrf-protection.helpers / sanitizeHeaders', () => {
  it('removes X-Forwarded-For and X-Real-IP', () => {
    const result = sanitizeHeaders({
      'X-Forwarded-For': '127.0.0.1',
      'X-Real-IP': '127.0.0.1',
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
    });
    expect(result).not.toHaveProperty('X-Forwarded-For');
    expect(result).not.toHaveProperty('X-Real-IP');
    expect(result.Authorization).toBe('Bearer token');
    expect(result['Content-Type']).toBe('application/json');
  });

  it('returns a fresh object instead of mutating the input', () => {
    const input = { 'X-Forwarded-For': 'a', Other: 'b' };
    const output = sanitizeHeaders(input);
    expect(input).toHaveProperty('X-Forwarded-For');
    expect(output).not.toBe(input);
  });

  it('handles an empty header bag', () => {
    expect(sanitizeHeaders({})).toEqual({});
  });
});

describe('ssrf-protection.helpers / isUrlAllowed', () => {
  it('returns true when the allowlist is empty (opt-in semantics)', () => {
    expect(isUrlAllowed('https://example.com', [])).toBe(true);
  });

  it('matches by prefix', () => {
    expect(isUrlAllowed('https://api.example.com/v1', ['https://api.example.com'])).toBe(true);
  });

  it('rejects URLs whose prefix is not in the allowlist', () => {
    expect(isUrlAllowed('https://evil.com', ['https://api.example.com'])).toBe(false);
  });

  it('handles multiple prefixes (any match wins)', () => {
    expect(
      isUrlAllowed('https://b.example.com/x', ['https://a.example.com', 'https://b.example.com']),
    ).toBe(true);
  });

  it('is exact-prefix sensitive (no scheme upgrade)', () => {
    expect(isUrlAllowed('http://example.com', ['https://example.com'])).toBe(false);
  });
});

describe('ssrf-protection.helpers / createSsrfRequestError', () => {
  it('produces an Error whose message matches the input', () => {
    const err = createSsrfRequestError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
  });
});

describe('ssrf-protection.helpers / constants integrity', () => {
  it('PRIVATE_IP_RANGES is non-empty and sorted (each range start <= end)', () => {
    expect(PRIVATE_IP_RANGES.length).toBeGreaterThan(0);
    for (const range of PRIVATE_IP_RANGES) {
      expect(ipToNumber(range.start)).toBeLessThanOrEqual(ipToNumber(range.end));
    }
  });

  it('REDIRECT_STATUSES contains the standard set', () => {
    expect(REDIRECT_STATUSES.has(301)).toBe(true);
    expect(REDIRECT_STATUSES.has(302)).toBe(true);
    expect(REDIRECT_STATUSES.has(303)).toBe(true);
    expect(REDIRECT_STATUSES.has(307)).toBe(true);
    expect(REDIRECT_STATUSES.has(308)).toBe(true);
    expect(REDIRECT_STATUSES.has(200)).toBe(false);
    expect(REDIRECT_STATUSES.has(304)).toBe(false);
  });

  it('SSRF_REQUEST_ERRORS exposes the prefixes used at throw sites', () => {
    expect(SSRF_REQUEST_ERRORS.redirectsExceeded).toMatch(/redirect/i);
    expect(SSRF_REQUEST_ERRORS.allowlistPrefix.endsWith(' ')).toBe(true);
    expect(SSRF_REQUEST_ERRORS.validationPrefix.endsWith(' ')).toBe(true);
  });

  it('BLOCKED_HOSTNAMES covers the cloud metadata endpoints', () => {
    expect(BLOCKED_HOSTNAMES).toContain('169.254.169.254');
    expect(BLOCKED_HOSTNAMES).toContain('metadata.google.internal');
    expect(BLOCKED_HOSTNAMES).toContain('localhost');
  });
});
