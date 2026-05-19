import { describe, it, expect } from 'vitest';
import {
  extractCatalogChatName,
  isPlaceholderCatalogName,
  resolveTrustedCatalogName,
  extractTrustedNameFromRemoteMessage,
  extractTrustedNameFromMessageText,
  extractRemoteMessageText,
  buildConversationLedger,
} from '../processors/autopilot/identity-names';

describe('extractCatalogChatName', () => {
  it('returns chat name when valid', () => {
    const chat = { name: 'Joao Silva' };
    expect(extractCatalogChatName(chat)).toBe('Joao Silva');
  });

  it('returns pushName from contact', () => {
    const chat = { contact: { pushName: 'Maria' } };
    expect(extractCatalogChatName(chat)).toBe('Maria');
  });

  it('skips "doe" placeholder', () => {
    const chat = { name: 'John Doe', contact: { pushName: 'Maria' } };
    expect(extractCatalogChatName(chat)).toBe('Maria');
  });

  it('skips "unknown" placeholder', () => {
    const chat = { name: 'Unknown', pushName: 'Carlos' };
    expect(extractCatalogChatName(chat)).toBe('Carlos');
  });

  it('skips "desconhecido" placeholder', () => {
    const chat = { name: 'Desconhecido', contact: { name: 'Ana' } };
    expect(extractCatalogChatName(chat)).toBe('Ana');
  });

  it('skips phone-only names matching fallbackPhone', () => {
    const chat = { name: '+5511987654321' };
    expect(extractCatalogChatName(chat, '+5511987654321')).toBe('');
  });

  it('returns empty string when all candidates are placeholders', () => {
    const chat = { name: 'John Doe', pushName: 'Unknown', contact: { name: 'Desconhecido' } };
    expect(extractCatalogChatName(chat)).toBe('');
  });

  it('handles null chat', () => {
    expect(extractCatalogChatName(null as Record<string, unknown>)).toBe('');
  });

  it('reads from lastMessage._data.notifyName', () => {
    const chat = { lastMessage: { _data: { notifyName: 'Pedro Biz' } } };
    expect(extractCatalogChatName(chat)).toBe('Pedro Biz');
  });
});

describe('isPlaceholderCatalogName', () => {
  it('returns true for empty string', () => {
    expect(isPlaceholderCatalogName('')).toBe(true);
  });

  it('returns true for null', () => {
    expect(isPlaceholderCatalogName(null)).toBe(true);
  });

  it('returns true for "doe"', () => {
    expect(isPlaceholderCatalogName('John Doe')).toBe(true);
  });

  it('returns true for "unknown"', () => {
    expect(isPlaceholderCatalogName('Unknown')).toBe(true);
  });

  it('returns false for valid name', () => {
    expect(isPlaceholderCatalogName('Joao')).toBe(false);
  });

  it('returns true when name is just the phone number', () => {
    expect(isPlaceholderCatalogName('5511987654321', '+5511987654321')).toBe(true);
  });

  it('returns true for phone + doe pattern', () => {
    expect(isPlaceholderCatalogName('55 11 987654321 Doe', '+5511987654321')).toBe(true);
  });
});

describe('resolveTrustedCatalogName', () => {
  it('returns first non-placeholder name', () => {
    expect(resolveTrustedCatalogName(null, 'John Doe', 'Maria')).toBe('Maria');
  });

  it('returns empty when all are placeholders', () => {
    expect(resolveTrustedCatalogName(null, 'Unknown', 'John Doe')).toBe('');
  });

  it('handles no candidates', () => {
    expect(resolveTrustedCatalogName(null)).toBe('');
  });
});

describe('extractTrustedNameFromRemoteMessage', () => {
  it('extracts pushName from message', () => {
    const msg = { pushName: 'Carlos' };
    expect(extractTrustedNameFromRemoteMessage(msg)).toBe('Carlos');
  });

  it('falls through multiple fields', () => {
    const msg = { notifyName: 'Unknown', senderName: 'Eduardo', pushName: 'Desconhecido' };
    expect(extractTrustedNameFromRemoteMessage(msg)).toBe('Eduardo');
  });

  it('returns empty when all placeholder', () => {
    const msg = {
      pushName: 'John Doe',
      notifyName: 'Unknown',
      _data: { notifyName: 'Desconhecido' },
    };
    expect(extractTrustedNameFromRemoteMessage(msg)).toBe('');
  });
});

describe('extractTrustedNameFromMessageText', () => {
  it('extracts name from "meu nome e" pattern', () => {
    const result = extractTrustedNameFromMessageText('ola meu nome e Joao Silva');
    expect(result).toBe('Joao Silva');
  });

  it('extracts name from "me chamo" pattern', () => {
    const result = extractTrustedNameFromMessageText('oi me chamo Maria');
    expect(result).toBe('Maria');
  });

  it('extracts name from "assinado" pattern', () => {
    const result = extractTrustedNameFromMessageText('obrigado assinado Pedro Santos');
    expect(result).toBe('Pedro Santos');
  });

  it('returns empty when no name pattern matches', () => {
    const result = extractTrustedNameFromMessageText('oi tudo bem');
    expect(result).toBe('');
  });

  it('returns empty for empty text', () => {
    expect(extractTrustedNameFromMessageText('')).toBe('');
  });

  it('returns empty when name is a placeholder', () => {
    const result = extractTrustedNameFromMessageText('meu nome e John Doe');
    expect(result).toBe('');
  });
});

describe('extractRemoteMessageText', () => {
  it('extracts body', () => {
    expect(extractRemoteMessageText({ body: 'Hello world' })).toBe('Hello world');
  });

  it('falls back to content', () => {
    expect(extractRemoteMessageText({ content: 'Hello' })).toBe('Hello');
  });

  it('falls back to text field', () => {
    expect(extractRemoteMessageText({ text: 'Hi there' })).toBe('Hi there');
  });

  it('extracts from nested message.conversation', () => {
    expect(
      extractRemoteMessageText({
        message: { conversation: 'nested text' },
      }),
    ).toBe('nested text');
  });

  it('normalizes whitespace', () => {
    expect(extractRemoteMessageText({ body: '  Hello   world  ' })).toBe('Hello world');
  });

  it('returns empty for unknown structure', () => {
    expect(extractRemoteMessageText({})).toBe('');
  });
});

describe('buildConversationLedger', () => {
  it('returns empty transcript for empty history', () => {
    const result = buildConversationLedger([]);
    expect(result.transcript).toBe('');
    expect(result.factsText).toContain('Sem fatos acumulados');
  });

  it('returns empty transcript for non-array input', () => {
    const result = buildConversationLedger(null as never[]);
    expect(result.transcript).toBe('');
  });

  it('builds transcript from messages', () => {
    const result = buildConversationLedger([
      { content: 'ola', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
      { content: 'tudo bem?', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.transcript).toContain('Cliente: ola');
    expect(result.transcript).toContain('Cliente: tudo bem?');
  });

  it('marks OUTBOUND as Conta', () => {
    const result = buildConversationLedger([
      { content: 'resposta', direction: 'OUTBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.transcript).toContain('Conta: resposta');
  });

  it('detects asked questions from OUTBOUND', () => {
    const result = buildConversationLedger([
      { content: 'voce quer comprar?', direction: 'OUTBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.factsText).toContain('voce quer comprar?');
  });

  it('detects informed names', () => {
    const result = buildConversationLedger([
      { content: 'meu nome e Joao', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.factsText).toContain('nome: Joao');
  });

  it('detects email addresses', () => {
    const result = buildConversationLedger([
      {
        content: 'meu email e joao@teste.com',
        direction: 'INBOUND',
        createdAt: new Date('2026-01-01'),
      },
    ]);
    expect(result.factsText).toContain('joao@teste.com');
  });

  it('detects covered topics: preco', () => {
    const result = buildConversationLedger([
      { content: 'qual o preco?', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.factsText).toContain('preco');
  });

  it('detects covered topics: pagamento', () => {
    const result = buildConversationLedger([
      { content: 'pode ser no pix?', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.factsText).toContain('pagamento');
  });

  it('detects covered topics: prazo', () => {
    const result = buildConversationLedger([
      {
        content: 'qual o prazo de entrega?',
        direction: 'INBOUND',
        createdAt: new Date('2026-01-01'),
      },
    ]);
    expect(result.factsText).toContain('prazo');
  });

  it('detects covered topics: problema', () => {
    const result = buildConversationLedger([
      { content: 'estou com um problema', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.factsText).toContain('problema');
  });

  it('detects covered topics: resultado', () => {
    const result = buildConversationLedger([
      { content: 'como funciona isso?', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.factsText).toContain('resultado');
  });

  it('handles entries without content', () => {
    const result = buildConversationLedger([
      { content: null, direction: 'INBOUND' },
      { content: 'hello', direction: 'INBOUND', createdAt: new Date('2026-01-01') },
    ]);
    expect(result.transcript).toContain('hello');
  });
});
