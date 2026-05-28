import {
  isIndividualChatId,
  isPlaceholderContactName,
  resolveTrustedContactName,
  normalizeChatId,
} from './whatsapp.service.helpers';// ── isIndividualChatId ──────────────────────────────────────────────────────

describe('isIndividualChatId', () => {
  it.each([
    '5511999991111@c.us',
    '5511999991111@c.us ',
    ' 5511999991111@c.us',
    '5511999992222@s.whatsapp.net',
  ])('returns true for individual chat id %j', (input) => {
    expect(isIndividualChatId(input)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['group id', '5511900000000-123456@g.us'],
    ['broadcast', 'status@broadcast'],
    ['newsletter', '123@newsletter'],
    ['plain phone', '5511999991111'],
    ['random text', 'hello world'],
  ] as const)('returns false for %s', (_label, input) => {
    expect(isIndividualChatId(input)).toBe(false);
  });

  it('returns false for a chat id that ends with unrelated suffix', () => {
    expect(isIndividualChatId('5511999991111@lid')).toBe(false);
  });
});// ── isPlaceholderContactName ────────────────────────────────────────────────

describe('isPlaceholderContactName', () => {
  it('returns true for empty/whitespace-only input', () => {
    expect(isPlaceholderContactName('')).toBe(true);
    expect(isPlaceholderContactName('   ')).toBe(true);
    expect(isPlaceholderContactName(null)).toBe(true);
  });

  it('returns true for literal placeholder names', () => {
    expect(isPlaceholderContactName('doe')).toBe(true);
    expect(isPlaceholderContactName('unknown')).toBe(true);
    expect(isPlaceholderContactName('desconhecido')).toBe(true);
  });

  it('returns true for phone-doe patterns', () => {
    expect(isPlaceholderContactName('5511999991111 doe')).toBe(true);
    expect(isPlaceholderContactName('5511999991111 Doe')).toBe(true);
    expect(isPlaceholderContactName('+55 11 99999 1111 doe')).toBe(true);
  });

  it('returns true when name equals phone digits', () => {
    expect(isPlaceholderContactName('5511999991111', '5511999991111')).toBe(true);
  });

  it('returns false for real contact names', () => {
    expect(isPlaceholderContactName('Alice')).toBe(false);
    expect(isPlaceholderContactName('Bob Silva')).toBe(false);
    expect(isPlaceholderContactName('João Souza')).toBe(false);
  });

  it('returns false for phone-doe when prefix has letters', () => {
    expect(isPlaceholderContactName('abc doe')).toBe(false);
  });

  it('returns false for names that only end in doe-like words but are real', () => {
    expect(isPlaceholderContactName('John Doe')).toBe(false);
  });
});// ── resolveTrustedContactName ───────────────────────────────────────────────

describe('resolveTrustedContactName', () => {
  const phone = '5511999991111';

  it('returns the first trusted name among candidates', () => {
    expect(resolveTrustedContactName(phone, 'Alice', 'Bob')).toBe('Alice');
  });

  it('skips placeholder names and returns the first real name', () => {
    expect(resolveTrustedContactName(phone, 'doe', 'Alice', 'Bob')).toBe('Alice');
  });

  it('skips phone-derived placeholder and returns a later real name', () => {
    expect(
      resolveTrustedContactName(phone, '5511999991111 doe', 'Alice'),
    ).toBe('Alice');
  });

  it('returns empty string when all candidates are placeholders', () => {
    expect(resolveTrustedContactName(phone, 'doe', 'unknown')).toBe('');
  });

  it('returns empty string when no candidates provided', () => {
    expect(resolveTrustedContactName(phone)).toBe('');
  });

  it('returns empty string when candidates are null/undefined', () => {
    expect(resolveTrustedContactName(phone, null, undefined, '')).toBe('');
  });

  it('trims whitespace from candidate names', () => {
    expect(resolveTrustedContactName(phone, '  Alice  ')).toBe('Alice');
  });

  it('handles number and boolean candidates', () => {
    expect(resolveTrustedContactName(phone, 42, true, 'Alice')).toBe('42');
  });

  it('skips the name that looks like the phone number itself', () => {
    expect(
      resolveTrustedContactName(phone, phone, 'Real Name'),
    ).toBe('Real Name');
  });

  it('returns the first candidate when phone is empty', () => {
    expect(resolveTrustedContactName('', 'Alice', 'Bob')).toBe('Alice');
  });
});// ── normalizeChatId ─────────────────────────────────────────────────────────

describe('normalizeChatId', () => {
  it('returns chat id as-is when it already contains @', () => {
    expect(normalizeChatId('5511999991111@c.us')).toBe('5511999991111@c.us');
    expect(normalizeChatId('5511999992222@s.whatsapp.net')).toBe(
      '5511999992222@s.whatsapp.net',
    );
    expect(normalizeChatId('123456789@g.us')).toBe('123456789@g.us');
  });

  it('appends @c.us when input is a plain phone number', () => {
    expect(normalizeChatId('5511999991111')).toBe('5511999991111@c.us');
  });

  it('strips non-digit characters from a plain number before appending @c.us', () => {
    expect(normalizeChatId('+55 11 99999-1111')).toBe('5511999991111@c.us');
  });

  it('returns @c.us for empty input', () => {
    expect(normalizeChatId('')).toBe('@c.us');
  });

  it('returns @c.us for non-numeric input with no @', () => {
    expect(normalizeChatId('abc')).toBe('@c.us');
  });
});
