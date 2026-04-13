import { BadRequestException } from '@nestjs/common';
import {
  collectAllowedHosts,
  validateAllowlistedUserUrl,
  validateNoInternalAccess,
} from './url-validator';

describe('url-validator', () => {
  it('allows public https urls without credentials', () => {
    expect(validateNoInternalAccess('https://cdn.example.com/audio.mp3').toString()).toBe(
      'https://cdn.example.com/audio.mp3',
    );
  });

  it('rejects urls with embedded credentials', () => {
    expect(() => validateNoInternalAccess('https://user:pass@example.com/file.mp3')).toThrow(
      BadRequestException,
    );
  });

  it('rejects private and link-local ipv4 ranges', () => {
    expect(() => validateNoInternalAccess('http://10.0.0.5/private')).toThrow(BadRequestException);
    expect(() => validateNoInternalAccess('http://169.254.10.20/private')).toThrow(
      BadRequestException,
    );
  });

  it('allows allowlisted hosts and subdomains only', () => {
    const allowedHosts = collectAllowedHosts('cdn.example.com, assets.example.com');

    expect(
      validateAllowlistedUserUrl('https://cdn.example.com/file.mp3', allowedHosts),
    ).toBeTruthy();
    expect(
      validateAllowlistedUserUrl('https://media.cdn.example.com/file.mp3', allowedHosts),
    ).toBeTruthy();
    expect(() =>
      validateAllowlistedUserUrl('https://evil-example.com/file.mp3', allowedHosts),
    ).toThrow(BadRequestException);
  });
});
